# Browser Tools Architecture & Roadmap

**Status:** Working (Multi-Instance Support Added)
**Date:** December 18, 2025

---

## Current Architecture (Working)

### Multi-Instance Local Mode (Claude Code)

Multiple Claude Code instances can share browser tools through a single GUI app:

```
┌─────────────────────────────────────────────────────────────────┐
│     Claude Code #1                Claude Code #2                │
│          ↓ stdio                       ↓ stdio                  │
│   StdioMCPBridge #1              StdioMCPBridge #2              │
│   (tries port 3458 - SUCCESS)    (tries port 3458 - FAILS)      │
│          │                              │                       │
│          │                              │                       │
│          │    checkBrowserBridgeAvailable()                     │
│          │         ↓                    ↓                       │
│          └─────────┴────────────────────┘                       │
│                    │ HTTP POST :3457/command                    │
│                    ▼                                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │        ScreenControl.app (GUI - Menu Bar App)           │   │
│   │                                                         │   │
│   │  BrowserWebSocketServer on port 3457                    │   │
│   │  - Accepts browser extension WebSocket connections      │   │
│   │  - Handles HTTP POST /command from StdioMCPBridge       │   │
│   │  - Routes commands to connected browsers                │   │
│   └─────────────────────────┬───────────────────────────────┘   │
│                             │ WebSocket                         │
│                             ▼                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   Browser Extension                     │   │
│   │              (Firefox / Chrome / Safari)                │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Implementation Details:**

1. **StdioMCPBridge.checkBrowserBridgeAvailable()** (added Dec 18, 2025):
   - First checks local BrowserWebSocketServer on port 3458
   - Falls back to checking GUI app on port 3457 via HTTP POST
   - Sends `getTabs` action to verify browser is connected
   - Returns YES if either source responds

2. **Tool Availability Logic**:
   ```objc
   // OLD (broken for multi-instance):
   BOOL includeBrowserTools = self.browserWebSocketServer.isRunning;

   // NEW (works for multi-instance):
   BOOL includeBrowserTools = [self checkBrowserBridgeAvailable];
   ```

3. **Browser Command Execution** (unchanged):
   - All browser commands go to port 3457 via HTTP POST
   - GUI app forwards to connected browser via WebSocket

### Remote Mode Communication Chain
```
Claude AI (MCP)
    ↓ (HTTP/SSE)
Control Server (192.168.10.10:3000)
    ↓ (WebSocket)
Agent (macOS ScreenControl.app)
    ↓ (HTTP POST to localhost:3457/command)
BrowserWebSocketServer (port 3457)
    ↓ (WebSocket)
Browser Extension (Firefox/Chrome/Edge/Safari)
    ↓ (Content Script → Injected Script)
Web Page DOM
```

### Current Implementation Details

**Agent → Browser Bridge (HTTP):**
```objective-c
// AppDelegate.m:3624-3674
NSURL *url = [NSURL URLWithString:@"http://localhost:3457/command"];
NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
request.HTTPMethod = @"POST";
// ... sends {"action": "getTabs", "payload": {...}, "browser": "firefox"}
```

**Browser Bridge → Browser Extension (WebSocket):**
```typescript
// browser-bridge-server.ts:308
const result = await this.sendToExtension(action, payload || {}, browser);
```

**Browser Extension → Web Page:**
- Uses Tampermonkey-style early injection (`document_start`)
- Bypasses CSP and Chrome MV3 restrictions
- See `CSP_AND_MV3_BYPASS.md` for details

---

## Issues with Current Architecture

### 1. Unnecessary HTTP Layer
- **Agent has WebSocket capability** but uses HTTP
- **Browser Bridge just proxies** HTTP → WebSocket → HTTP
- **Adds latency** and parsing overhead
- **Wastes resources** (HTTP server, request parsing, response serialization)

### 2. HTTP Endpoint Purpose
The HTTP endpoint exists for:
- ✅ **Testing**: Easy `curl` commands for debugging
- ✅ **Legacy compatibility**: Simple clients without WebSocket libraries
- ❌ **Agent communication**: Should use WebSocket directly

### 3. Debug Build Confusion
- **Test Server** (port 3456) exists for development/testing
- **Browser Bridge** (port 3457) should be production-only
- HTTP endpoint on 3457 should be **debug-only** or removed

---

## Proper Architecture (Target)

### Communication Chain
```
Claude AI (MCP)
    ↓ (HTTP/SSE)
Control Server (192.168.10.10:3000)
    ↓ (WebSocket)
Agent (macOS ScreenControl.app)
    ↓ (WebSocket to localhost:3457) ← PROPER
Browser Bridge Server (WebSocket Multiplexer)
    ↓ (WebSocket)
Browser Extension (Firefox/Chrome/Edge/Safari)
    ↓ (Content Script → Injected Script)
Web Page DOM
```

### Benefits
- ✅ **Direct WS-to-WS**: No HTTP parsing overhead
- ✅ **Bidirectional**: Browser can push events to agent
- ✅ **Connection reuse**: Persistent WebSocket
- ✅ **Lower latency**: One less protocol conversion
- ✅ **Simpler code**: Browser Bridge becomes pure message router

---

## Implementation Roadmap

### Phase 1: Working Fix ✅ (COMPLETED)
**Status:** Deployed December 9, 2025
**Commit:** `cf046d4` - "fix: Enable browser tools in agent by removing isRunning check"

**Changes:**
- Removed `browserBridgeServer.isRunning` check
- Added direct HTTP POST to `localhost:3457/command`
- Agent decoupled from browser-bridge-server lifecycle

**Result:**
- Full chain works: Control Server → Agent → Browser Bridge → Firefox
- Browser tools functional from Claude AI

---

### Phase 2: WebSocket Client in Agent (NEXT)

**Objective:** Replace HTTP with WebSocket in agent

**Tasks:**

1. **Add WebSocket Client to Agent** (`AppDelegate.m`)
   ```objective-c
   @property (nonatomic, strong) NSURLSessionWebSocketTask *browserBridgeWebSocket;

   - (void)connectToBrowserBridge {
       NSURLSession *session = [NSURLSession sessionWithConfiguration:[NSURLSessionConfiguration defaultSessionConfiguration]];
       NSURL *url = [NSURL URLWithString:@"ws://localhost:3457"];
       self.browserBridgeWebSocket = [session webSocketTaskWithURL:url];
       [self.browserBridgeWebSocket resume];
       [self receiveBrowserBridgeMessage];
   }

   - (void)sendBrowserCommand:(NSString *)action payload:(NSDictionary *)payload browser:(NSString *)browser {
       NSDictionary *message = @{
           @"id": [[NSUUID UUID] UUIDString],
           @"action": action,
           @"payload": payload ?: @{},
           @"browser": browser ?: @"default"
       };
       NSData *data = [NSJSONSerialization dataWithJSONObject:message options:0 error:nil];
       NSURLSessionWebSocketMessage *wsMessage = [[NSURLSessionWebSocketMessage alloc] initWithData:data];
       [self.browserBridgeWebSocket sendMessage:wsMessage completionHandler:^(NSError *error) {
           if (error) NSLog(@"WebSocket send error: %@", error);
       }];
   }
   ```

2. **Update Browser Bridge Server** (`browser-bridge-server.ts`)
   - Accept WebSocket connections from agents
   - Route messages between agent WS and browser WS
   - Keep HTTP endpoint for debugging only (behind flag)

3. **Testing**
   - Verify WebSocket connection establishment
   - Test all browser tools via WebSocket
   - Ensure error handling and reconnection logic

**Expected Outcome:**
```
Agent (WS) ←→ Browser Bridge (WS Multiplexer) ←→ Browser Extension (WS)
```

---

### Phase 3: Debug-Only HTTP Endpoint (CLEANUP)

**Objective:** Move HTTP endpoint to debug builds only

**Tasks:**

1. **Add Debug Flag Check** (`browser-bridge-server.ts`)
   ```typescript
   const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

   if (DEBUG_MODE) {
       // HTTP endpoint for testing/debugging
       app.post('/command', async (req, res) => { ... });
   }
   ```

2. **Test Server Separation** (`AppDelegate.m`)
   ```objective-c
   #ifdef DEBUG
   - (void)startTestServer {
       // HTTP server on port 3456 for curl testing
       // Provides /ping, /execute, /getLogs endpoints
   }
   #endif
   ```

3. **Documentation**
   - Update README with WebSocket-only production architecture
   - Document debug mode for testing
   - Provide curl examples for debug endpoint

**Expected Outcome:**
- Production: WebSocket-only communication
- Debug builds: HTTP endpoint available for testing
- Clear separation of concerns

---

### Phase 4: Remove Legacy Code (FINAL CLEANUP)

**Objective:** Remove all unused browser bridge wrapper code

**Files to Remove:**
```
❌ macos/ScreenControl/BrowserBridgeServer.m/.h
   - Wrapper that spawns Node.js process
   - No longer needed (agent connects directly)

❌ macos/ScreenControl/BrowserWebSocketServer.m/.h
   - Native WebSocket server implementation
   - Incomplete (doesn't support HTTP endpoint)
   - Node.js version is better maintained

✅ Keep: src/browser-bridge-server.ts
   - Node.js WebSocket + HTTP server
   - Well-tested and feature-complete
```

**Code Changes in AppDelegate.m:**
```objective-c
// REMOVE:
@property (nonatomic, strong) BrowserBridgeServer *browserBridgeServer;
@property (nonatomic, strong) BrowserWebSocketServer *browserWebSocketServer;
- (void)startBrowserBridge;
- (void)stopBrowserBridge;

// KEEP:
@property (nonatomic, strong) NSURLSessionWebSocketTask *browserBridgeWebSocket;
- (void)connectToBrowserBridge;
- (void)sendBrowserCommand:payload:browser:;
```

**Expected Outcome:**
- Clean codebase with no legacy wrappers
- Single source of truth: Node.js browser-bridge-server
- Agent connects as WebSocket client

---

## Browser Bridge Server Architecture

### Current Role (Inefficient)
```
HTTP Server + WebSocket Server + Message Router
```

### Future Role (Efficient)
```
WebSocket Multiplexer (Routes messages between agent and browsers)
```

### Message Flow Example
```
Agent sends:
{
  "id": "uuid-123",
  "action": "getTabs",
  "payload": {},
  "browser": "firefox"
}

Browser Bridge routes to Firefox extension

Firefox extension responds:
{
  "id": "uuid-123",
  "result": [{"id": 1, "title": "YouTube", ...}]
}

Browser Bridge routes back to Agent
```

---

## Testing Strategy

### Current Testing (HTTP)
```bash
# Direct test (bypasses agent)
curl -X POST http://localhost:3457/command \
  -H "Content-Type: application/json" \
  -d '{"action":"getTabs","payload":{},"browser":"firefox"}'
```

### Future Testing (WebSocket)

**Debug Build:**
```bash
# HTTP endpoint still available for testing
DEBUG_MODE=true node dist/browser-bridge-server.js
curl -X POST http://localhost:3457/command -d '{...}'
```

**Production Build:**
```bash
# WebSocket only
node dist/browser-bridge-server.js

# Test via agent or WebSocket client
websocat ws://localhost:3457
{"action":"getTabs","payload":{},"browser":"firefox"}
```

### Test Server (Debug Only)
```bash
# Agent test server on port 3456 (DEBUG builds only)
curl -X POST http://localhost:3456/execute \
  -H "Content-Type: application/json" \
  -d '{"method":"executeToolFromWebSocket","params":{"name":"browser_getTabs","arguments":{}}}'
```

---

## Deployment Considerations

### Development
- Browser bridge runs manually: `node dist/browser-bridge-server.js`
- Agent connects to localhost:3457
- HTTP endpoint enabled for debugging

### Production (macOS Agent)
- Browser bridge embedded in .app bundle
- Started as subprocess or LaunchAgent
- WebSocket-only communication
- No HTTP endpoint

### Production (Control Server)
- Agent connects via WAN WebSocket
- Control server already uses WebSocket
- No changes needed in control server

---

## Migration Path

### Step 1: Deploy Current Fix ✅
- Commit `cf046d4` already deployed
- HTTP-based solution working
- Unblocks browser tools immediately

### Step 2: Implement WebSocket (1-2 days)
- Add WebSocket client to agent
- Update browser bridge for agent connections
- Test end-to-end

### Step 3: Switch to WebSocket (1 day)
- Update agent to use WebSocket by default
- Keep HTTP as fallback
- Monitor for issues

### Step 4: Remove HTTP (1 day)
- Move HTTP to debug-only
- Clean up legacy code
- Update documentation

### Step 5: Final Cleanup (1 day)
- Remove wrapper classes
- Optimize browser bridge
- Final testing

**Total Estimated Time:** 4-6 days

---

## Compatibility Matrix

| Component | HTTP Support | WebSocket Support | Status |
|-----------|--------------|-------------------|--------|
| Agent (current) | ✅ Temporary | ❌ Needs implementation | Working |
| Agent (target) | ⚠️ Debug only | ✅ Primary | Future |
| Browser Bridge | ✅ Has endpoint | ✅ Has server | Working |
| Browser Extension | ❌ N/A | ✅ Native | Working |
| Control Server | ❌ N/A | ✅ Native | Working |

---

## Success Criteria

### Current Fix ✅
- [x] Browser tools work from control server
- [x] Communication chain complete
- [x] Agent connects to browser bridge
- [x] Firefox extension receives commands
- [x] Commands execute on web pages

### Multi-Instance Support ✅ (December 18, 2025)
- [x] Multiple Claude Code instances see browser tools
- [x] StdioMCPBridge checks port 3457 fallback
- [x] All instances share browser extension via GUI app
- [x] No port conflicts between instances
- [x] Documentation updated

### WebSocket Implementation (Future)
- [ ] Agent connects via WebSocket to browser bridge
- [ ] All browser tools work via WebSocket
- [ ] Reconnection logic handles disconnects
- [ ] Latency improved vs HTTP
- [ ] No regression in functionality

### Final Cleanup (Future)
- [ ] HTTP endpoint only in debug builds
- [ ] Legacy wrapper code removed
- [ ] Production deployment successful
- [ ] All tests passing

---

## References

- **Current Fix Commit:** `cf046d4` - Fix browser tools HTTP communication
- **CSP Bypass:** `CSP_AND_MV3_BYPASS.md` - Tampermonkey injection strategy
- **Browser Tools:** `BROWSER_COMMANDS_VERIFIED.md` - All 46 commands working
- **Extension Code:** `extension/firefox/` - Browser extension implementation
- **Bridge Server:** `src/browser-bridge-server.ts` - Node.js WebSocket + HTTP server

---

## Questions & Decisions

### Q: Why not use native BrowserWebSocketServer?
**A:** Incomplete implementation - doesn't have HTTP endpoint needed for testing. Node.js version is better maintained and has both WebSocket + HTTP.

### Q: Why keep HTTP endpoint at all?
**A:** Testing and debugging. Easy curl commands for development. Will be debug-only in production.

### Q: Can we remove browser-bridge-server.js entirely?
**A:** No - it's the only complete implementation that works with browser extensions. Native rewrite would be significant effort.

### Q: What about the Test Server?
**A:** Separate concept - agent's debug API on port 3456. Should be `#ifdef DEBUG` only. Different from browser bridge.

---

**Last Updated:** December 18, 2025
**Next Review:** After Phase 2 WebSocket implementation
