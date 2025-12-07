# Agent Management & Distribution System Tasks

> Enable agents to connect back to the web system, declare their status, advertise tools, and allow users to manage their agent fleet.

## Overview

This task file covers the complete agent lifecycle:
1. **Agent Connection** - WebSocket endpoint for agents to phone home
2. **Agent Fleet Dashboard** - UI for users to see/manage their agents
3. **Licensing & Activation** - Activate agents (PENDING → ACTIVE)
4. **Agent Downloads** - Tenant-tagged installer distribution

Currently implemented:
- ✅ Database schema (Agent, AgentState, PowerState, etc.)
- ✅ Control-server library (agent-registry, websocket-handler, db-service)
- ✅ Custom server.ts with WebSocket integration (Part A)
- ✅ API routes for agents (`/api/agents`, `/api/agents/[id]`, wake, activate, block, events, stats, logs) (Part C)
- ✅ Dashboard UI for agent fleet management (list, detail, actions) (Part B)
- ✅ Real-time SSE updates for agent status (Part B.4)
- ✅ Patch service library for installer distribution (Part D.3, D.4)
- ✅ Download UI on connection detail page (Part D.5)
- ✅ Navigation enhancements with agent badges (Part E)
- ✅ Initial test suite (Part F) - 159 tests passing
- ✅ macOS Agent WebSocket Integration (Part D.9) - full bidirectional communication working
- ✅ macOS Agent TestServer (Part D.12.2) - remote agent control via HTTP API
- ✅ agentRegistry globalThis singleton pattern (fixes Next.js module isolation)
- ✅ Command execution from server to agent via `/api/agents/[id]` POST

**Next up (Build Phase):**
- Agent renaming (D.7: MCPEyes → ScreenControl) - partially complete
- Debug build menu (D.8: manual config for testing) - macOS complete
- Windows/Linux Agent WebSocket client implementation (D.10-D.11)
- Control server agent integration (Part I)

**Later (Features Phase):**
- Activity log UI in agent detail page (B.3.4)
- Golden build storage setup on production (D.2)
- Agent-side PatchData reading (D.6)
- Multi-tenant SaaS features (Part H)

**Final steps (after all features complete):**
- Expand test suite (F.5: tests for all new features)
- Production deployment (Part G: MUST be last)

---

## Part D.0: Developer Test Environment Setup

> **PREREQUISITE**: Before testing agents, you need database records for your developer account.

### D.0.1 Developer Account & MCP Connection

The Debug tab in the macOS agent needs an `endpointUuid` from an MCP connection. This requires:

1. A user account (richard.brown@knws.co.uk)
2. An MCP connection linked to that user
3. The connection's `endpointUuid` to paste into the Debug tab

**Tasks:**
- [x] D.0.1.1 Create seed script: `web/prisma/seed-dev.ts`
- [x] D.0.1.2 Seed script creates developer user if not exists
- [x] D.0.1.3 Seed script creates "Dev Testing" MCP connection for that user
- [x] D.0.1.4 Seed script outputs the `endpointUuid` to console
- [x] D.0.1.5 Add `npm run seed:dev` script to package.json
- [x] D.0.1.6 Document: Copy endpointUuid into macOS Debug tab → "Endpoint UUID" field

**Seed Script Output Example:**
```
✓ Developer user: richard.brown@knws.co.uk (created/found)
✓ MCP Connection: "Dev Testing"
✓ Endpoint UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890

Paste this UUID into the macOS agent's Debug tab to test.
```

### D.0.2 Alternative: Manual Setup via Dashboard

If the dashboard is already deployed:
- [ ] D.0.2.1 Sign up / sign in as developer
- [ ] D.0.2.2 Go to Connections → Add Connection
- [ ] D.0.2.3 Create "Dev Testing" connection
- [ ] D.0.2.4 Copy the endpoint UUID from connection detail page

### D.0.3 Prisma Studio (Quick Check)

For quick database inspection:
```bash
cd web
npx prisma studio
```
- View Users, McpConnections tables
- Copy `endpointUuid` directly from database

---

## Part A: WebSocket Integration ✅ COMPLETE

The control-server library is fully integrated with Next.js via custom server.

### A.1 WebSocket Server Integration ✅ COMPLETE

**File**: `web/server.ts` - Custom server with WebSocket support

- [x] A.1.1 `web/server.ts` exists with WebSocket support
- [x] A.1.2 Custom server implements:
  - Runs Next.js via `next()`
  - WebSocket server on `/ws` path
  - Imports `handleAgentConnection` from websocket-handler.ts
  - Uses `agentRegistry` singleton
  - Server-side ping every 15 seconds
- [x] A.1.3 `package.json` has scripts for custom server
- [x] A.1.4 Test agent can connect via `ws://localhost:3000/ws` (tested with macOS agent)

### A.2 Agent Registration Flow ✅ COMPLETE

**Implemented in**: `websocket-handler.ts`, `agent-registry.ts`

- [x] A.2.1 Registration flow implemented end-to-end
- [x] A.2.2 Test with macOS agent (ScreenControl.app) - verified via TestServer remote control
- [x] A.2.3 Agent record created/updated in database on connect

### A.3 Heartbeat & License Checking ✅ COMPLETE

**Implemented in**: `websocket-handler.ts`

- [x] A.3.1 Heartbeat updates `lastSeenAt` via `updateAgentHeartbeat()`
- [x] A.3.2 License status changes propagate to agent via `heartbeat_ack`
- [x] A.3.3 Power state transitions handled (ACTIVE → PASSIVE → SLEEP)
- [x] A.3.4 Command queueing for sleeping agents
- [x] A.3.5 Wake broadcasts on portal login/AI connection

---

## Part B: Agent Fleet Dashboard

Users need a UI to see and manage their connected agents.

### B.1 Agents List Page ✅ COMPLETE

**File**: `web/src/app/dashboard/agents/page.tsx`

**Features:**
- [x] B.1.1 Real-time list of user's agents (with 10s polling)
- [x] B.1.2 Show for each agent:
  - Machine name / hostname
  - OS type (macOS/Windows/Linux) with icon
  - Status: Online/Offline badge
  - State: PENDING/ACTIVE/BLOCKED/EXPIRED badge
  - Power state: ACTIVE/PASSIVE/SLEEP indicator
  - Screen locked status
  - Last seen timestamp
  - IP address
- [x] B.1.3 Filter by: Status (online/offline), State, OS type
- [x] B.1.4 Search by machine name
- [x] B.1.5 Empty state: "No agents connected yet" with link to downloads

### B.2 Agent Actions ✅ COMPLETE

- [x] B.2.1 **Activate** button (PENDING → ACTIVE)
  - Only show for PENDING agents
  - API: `PATCH /api/agents/[id]` with `{ state: 'ACTIVE' }`
  - Updates `activatedAt` timestamp

- [x] B.2.2 **Deactivate** button (ACTIVE → PENDING)
  - For when user wants to stop billing

- [x] B.2.3 **Block** button (any → BLOCKED)
  - For suspicious/unauthorized agents
  - Agent will be disconnected and can't reconnect

- [x] B.2.4 **Unblock** button (BLOCKED → PENDING)
  - Allows agent to reconnect

- [x] B.2.5 **Wake** button (SLEEP → ACTIVE)
  - For sleeping agents
  - API: `POST /api/agents/[id]/wake`

### B.3 Agent Detail Page ✅ COMPLETE

**File**: `web/src/app/dashboard/agents/[id]/page.tsx`

**Features:**
- [x] B.3.1 Full agent information:
  - Machine name, hostname
  - OS type, version, architecture
  - Agent version
  - IP address (public and local)
  - First connected timestamp
  - Last seen timestamp
  - License UUID (if activated)

- [x] B.3.2 Hardware fingerprint info:
  - Fingerprint raw JSON display
  - Fingerprint hash

- [x] B.3.3 Status section:
  - Current state with state change buttons
  - Power state
  - Screen lock status
  - Current task (if any)

- [ ] B.3.4 Activity log:
  - Recent commands executed
  - Connection history (sessions)
  - Fingerprint changes

- [x] B.3.5 Edit agent label (click to edit)

### B.4 Real-time Updates ✅ COMPLETE

- [x] B.4.1 Add SSE endpoint for agent status updates: `GET /api/agents/events`
- [x] B.4.2 Dashboard subscribes to SSE for real-time:
  - Agent online/offline changes
  - State changes
  - Power state changes
- [x] B.4.3 Visual indicator when agent comes online/goes offline

### B.5 Agent Statistics ✅ COMPLETE

Dashboard shows:
- [x] B.5.1 Total agents count
- [x] B.5.2 Online vs offline count
- [x] B.5.3 By state (Active, Pending, Blocked)
- [x] B.5.4 By OS type

---

## Part C: Agent API Enhancements ✅ COMPLETE

### C.1 Current API Routes

All implemented:
- `GET /api/agents` - List user's agents (with filters, stats)
- `GET /api/agents/[id]` - Get agent details
- `PATCH /api/agents/[id]` - Update agent (state, label, groupName, tags)
- `DELETE /api/agents/[id]` - Delete agent
- `POST /api/agents/[id]` - Send command to agent (internal network only)

### C.2 New API Routes ✅ COMPLETE

- [x] C.2.1 `POST /api/agents/[id]/wake` - Wake a sleeping agent
- [x] C.2.2 `POST /api/agents/[id]/activate` - Activate (PENDING → ACTIVE)
- [x] C.2.3 `POST /api/agents/[id]/block` - Block agent
- [x] C.2.4 `GET /api/agents/events` - SSE for real-time updates
- [x] C.2.5 `GET /api/agents/[id]/logs` - Get agent command logs
- [x] C.2.6 `GET /api/agents/stats` - Get aggregate statistics

### C.3 API Integration with Control Server ✅ COMPLETE

- [x] C.3.1 Import `agentRegistry` singleton in API routes
- [x] C.3.2 `/api/agents/[id]/wake` calls `agentRegistry.wakeAgent()`
- [x] C.3.3 State changes update both DB and notify connected agent

---

## Part D: Agent Installer Distribution

Enable users to download tenant-tagged agent installers.

### D.1 Database Schema ✅ COMPLETE

- [x] D.1.1 Verify `InstallerDownload` model exists (it does)
- [x] D.1.2 Relation to McpConnection via `connectionId` field exists

### D.2 Golden Build Storage

**Server path**: `/var/www/html/screencontrol/golden/`

- [ ] D.2.1 Create directory structure on production server
- [ ] D.2.2 Create `manifest.json` format:
  ```json
  {
    "latest": "1.0.0",
    "versions": {
      "1.0.0": {
        "macos": { "filename": "MCPEyes.app.tar.gz", "sha256": "..." },
        "windows": { "filename": "ScreenControl.exe", "sha256": "..." },
        "linux-gui": { "filename": "screencontrol-gui", "sha256": "..." },
        "linux-headless": { "filename": "screencontrol-headless", "sha256": "..." }
      }
    }
  }
  ```
- [ ] D.2.3 Upload initial golden builds

### D.3 Patch Service ✅ COMPLETE

**Created**: `web/src/lib/patch-service/`

PatchData structure (256 bytes):
```
PATCH_MAGIC_START (8 bytes): "SCPATCH\x00"
endpoint_uuid (40 bytes): MCP connection UUID
server_url (128 bytes): https://screencontrol.knws.co.uk
checksum (32 bytes): HMAC-SHA256
reserved (40 bytes): zeros
PATCH_MAGIC_END (8 bytes): "SCEND\x00\x00\x00"
```

- [x] D.3.1 Create `patch-service/constants.ts` - Magic markers
- [x] D.3.2 Create `patch-service/manifest.ts` - Load manifest
- [x] D.3.3 Create `patch-service/patcher.ts` - Binary patching
- [x] D.3.4 Create `patch-service/checksum.ts` - HMAC generation

### D.4 Download API ✅ COMPLETE

**Created**: `web/src/app/api/connections/[id]/download/route.ts`

```
GET /api/connections/[id]/download?platform=macos
Authorization: Bearer <session>

Response: Binary stream
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="ScreenControl-<name>.app.tar.gz"
```

- [x] D.4.1 Validate user owns connection
- [x] D.4.2 Validate platform parameter
- [x] D.4.3 Fetch golden build from storage
- [x] D.4.4 Patch binary with connection's endpointUuid
- [x] D.4.5 Log download to InstallerDownload table
- [x] D.4.6 Stream patched binary to user
- [x] D.4.7 Rate limit: 10 downloads/hour/user

### D.5 Download UI ✅ COMPLETE

Added to connection detail page.

- [x] D.5.1 Download section on connection detail page
- [x] D.5.2 Platform icons (macOS, Windows, Linux)
- [x] D.5.3 Download button for each platform
- [x] D.5.4 Show download history
- [x] D.5.5 Installation instructions per platform

### D.6 Agent-Side PatchData Reading

Agents need to read embedded configuration on startup.

- [ ] D.6.1 macOS: Add PatchData section to MCPEyes binary
- [ ] D.6.2 macOS: Read endpoint_uuid on startup
- [ ] D.6.3 macOS: Connect to correct MCP endpoint
- [ ] D.6.4 Windows: Same for ScreenControl.exe
- [ ] D.6.5 Linux: Same for ELF binary

### D.7 Agent Renaming ✅ COMPLETE (macOS)

**Rename all agents from "MCPEyes" to "ScreenControl" for consistent branding.**

#### D.7.0 macOS Agent Rename ✅ COMPLETE
- [x] D.7.0.1 Rename `MCPEyes.app` → `ScreenControl.app`
- [x] D.7.0.2 Update Xcode project name and bundle identifier
- [x] D.7.0.3 Update Info.plist: CFBundleName, CFBundleDisplayName
- [x] D.7.0.4 Update code references from "MCPEyes" to "ScreenControl"
- [x] D.7.0.5 Update menu bar title and about dialog
- [x] D.7.0.6 Update app icon (if needed for rebrand)

#### D.7.0 Windows Agent Rename
- [ ] D.7.0.7 Service: `ScreenControlService.exe` (already named correctly)
- [ ] D.7.0.8 Tray app: `ScreenControlTray.exe` → `ScreenControl.exe` (user-facing)
- [ ] D.7.0.9 Update project names and assembly info

#### D.7.0 Linux Agent Rename
- [ ] D.7.0.10 GUI binary: `screencontrol` (no extension)
- [ ] D.7.0.11 Headless binary: `screencontrol-headless` (no extension)
- [ ] D.7.0.12 Update Makefile targets and output names

---

### D.8 Debug Build Menu (Manual Stamping for Testing)

**Problem**: Golden build stamping isn't implemented yet, but we need to test agent → control server connections.

**Solution**: Add a debug/settings menu in agents to manually configure connection parameters (equivalent to what would be embedded in stamped builds).

**IMPORTANT**: Debug menu should be visible on ALL platforms during testing phase. Only hide behind `#ifdef DEBUG` or feature flag when ready for production release.

#### D.8.1 macOS Debug Menu (ScreenControl.app) ✅ COMPLETE

- [x] D.8.1.1 Add "Debug Settings" or "Developer" menu item (visible during testing)
- [x] D.8.1.2 Create settings window with fields:
  - Server URL, Endpoint UUID, Customer ID, Connect on startup toggle
- [x] D.8.1.3 Save settings to `~/Library/Application Support/ScreenControl/debug-config.json`
- [x] D.8.1.4 On startup, load debug config (bundled or user-saved)
- [x] D.8.1.5 Show connection status in menu bar (connected/disconnected/error)
- [x] D.8.1.6 Add "Copy MCP URL" button to copy `https://server/mcp/{uuid}` to clipboard
- [ ] D.8.1.7 Add feature flag for hiding debug menu in production (disabled during testing)

#### D.8.2 Windows Debug Menu (ScreenControl.exe Tray)

- [ ] D.8.2.1 Add "Debug Settings" context menu item (visible during testing)
- [ ] D.8.2.2 Create WinForms settings dialog with same fields
- [ ] D.8.2.3 Save to `%APPDATA%\ScreenControl\debug-config.json`
- [ ] D.8.2.4 Load on startup if no PatchData in service binary
- [ ] D.8.2.5 Tray icon reflects connection status

#### D.8.3 Linux Debug Menu

- [ ] D.8.3.1 GUI mode: Add settings dialog (GTK)
- [ ] D.8.3.2 Headless mode: CLI arguments `--server-url`, `--endpoint-uuid`, `--customer-id`
- [ ] D.8.3.3 Config file: `~/.config/screencontrol/debug-config.json`
- [ ] D.8.3.4 Environment variables as alternative: `SCREENCONTROL_SERVER_URL`, `SCREENCONTROL_ENDPOINT_UUID`

#### D.8.4 Debug Config JSON Format

```json
{
  "serverUrl": "https://screencontrol.knws.co.uk",
  "endpointUuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "customerId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "connectOnStartup": true,
  "useLocalhost": false
}
```

#### D.8.5 Website Debug Mode (Licensing & Agent Testing)

**Problem**: Need to test the licensing system, agent state transitions, and billing integration without requiring real agents to be connected.

**Solution**: Add debug mode to the web dashboard for testing licensing functionality.

**IMPORTANT**: Debug mode should be accessible during testing phase. Hide behind admin role or feature flag for production.

##### D.8.5.1 Debug Page ✅ COMPLETE

**Created**: `web/src/app/dashboard/debug/page.tsx`

- [x] D.8.5.1.1 Create debug dashboard page (only visible during testing or to admin users)
- [x] D.8.5.1.2 Add link in sidebar (conditionally shown based on debug mode)

##### D.8.5.2 Mock Agent Management ✅ COMPLETE

- [x] D.8.5.2.1 "Create Mock Agent" button to create test agents in database
  - Pre-fill with test data (hostname, fingerprint, etc.)
  - Select OS type (macOS, Windows, Linux)
  - Select initial state (PENDING, ACTIVE, BLOCKED, EXPIRED)
- [x] D.8.5.2.2 "Simulate Agent Online" - mark agent as online without real WebSocket
- [x] D.8.5.2.3 "Simulate Agent Offline" - mark agent as offline
- [x] D.8.5.2.4 "Delete All Mock Agents" - cleanup test data

##### D.8.5.3 License State Testing ✅ COMPLETE

- [x] D.8.5.3.1 Manual state change buttons for any agent:
  ```
  ┌─────────────────────────────────────────────────────┐
  │  Agent: test-mac-001                                │
  │  Current State: PENDING                             │
  ├─────────────────────────────────────────────────────┤
  │  Change State:                                      │
  │  [ PENDING ] [ ACTIVE ] [ BLOCKED ] [ EXPIRED ]     │
  ├─────────────────────────────────────────────────────┤
  │  Set Activation Date:                               │
  │  [ 2024-01-15 ]  [ Clear ]                          │
  │                                                     │
  │  Set Expiration Date:                               │
  │  [ 2024-12-31 ]  [ Clear ]                          │
  └─────────────────────────────────────────────────────┘
  ```
- [x] D.8.5.3.2 "Simulate License Expiration" - fast-forward agent to EXPIRED
- [x] D.8.5.3.3 "Simulate License Renewal" - reset expiration, move to ACTIVE
- [ ] D.8.5.3.4 View state change history for debugging

##### D.8.5.4 Billing Simulation

- [ ] D.8.5.4.1 Show what would be billed based on current ACTIVE agents
- [ ] D.8.5.4.2 "Generate Test Invoice" preview (no actual charge)
- [ ] D.8.5.4.3 Billing period selector for testing billing calculations

##### D.8.5.5 MCP Connection Testing

- [ ] D.8.5.5.1 "Create Mock Connection" with test OAuth tokens
- [ ] D.8.5.5.2 "Test MCP Endpoint" button to verify endpoint responds
- [ ] D.8.5.5.3 View raw request/response logs for debugging
- [ ] D.8.5.5.4 "Revoke All Test Tokens" cleanup button

##### D.8.5.6 Debug Mode Configuration

Add environment variable and/or database flag:

```bash
# .env
DEBUG_MODE=true  # Enable debug features (disable in production)
```

- [x] D.8.5.6.1 Add `DEBUG_MODE` environment variable check
- [x] D.8.5.6.2 Create `isDebugMode()` utility function in `web/src/lib/debug.ts`
- [x] D.8.5.6.3 Conditionally render debug navigation item
- [x] D.8.5.6.4 Add middleware to protect debug routes when `DEBUG_MODE=false` (API routes check isDebugMode())

---

### D.9 macOS Agent WebSocket Integration (ScreenControl.app) ✅ COMPLETE

**Current state**: ScreenControl.app fully implements WebSocket connection to control server.

**Tasks:**
- [x] D.9.1 Add `NSURLSessionWebSocketTask` client to ScreenControl.app
- [x] D.9.2 Connect to `wss://screencontrol.knws.co.uk/ws` on startup
- [x] D.9.3 Send registration message on connect:
  ```json
  {
    "type": "register",
    "machineId": "<hardware-uuid>",
    "fingerprint": "<cpu+disk+mobo hash>",
    "hostname": "<machine-name>",
    "osType": "macos",
    "osVersion": "<darwin-version>",
    "arch": "<arm64|x64>",
    "agentVersion": "<app-version>",
    "customerId": "<from-patchdata-or-settings>"
  }
  ```
- [x] D.9.4 Handle `registered` response and store `licenseUuid`
- [x] D.9.5 Implement heartbeat loop (every 30s when ACTIVE):
  ```json
  {
    "type": "heartbeat",
    "powerState": "ACTIVE|PASSIVE|SLEEP",
    "screenLocked": true|false,
    "currentTask": null
  }
  ```
- [x] D.9.6 Handle `heartbeat_ack` response (license status, power config)
- [x] D.9.7 Implement reconnection logic with exponential backoff
- [x] D.9.8 Handle incoming `request` messages (commands from control server)
- [x] D.9.9 Send `response` messages with command results
- [x] D.9.10 Update menu bar status based on connection state

### D.10 Windows Agent WebSocket Integration (ScreenControl.exe)

- [ ] D.10.1 Add WebSocket client (cpp-httplib or beast)
- [ ] D.10.2 Same protocol as macOS (D.9.2 - D.9.10)

### D.11 Linux Agent WebSocket Integration

- [ ] D.11.1 Add WebSocket client (libwebsockets or beast)
- [ ] D.11.2 Same protocol as macOS (D.9.2 - D.9.10)

---

### D.12 Agent Remote Testing Infrastructure

**Problem**: Manual testing of agent functionality is slow and error-prone. We need automated testing capabilities to verify agent behavior across all platforms.

**Solution**: Add a local test server port (3456 or 3457) to each agent that accepts commands to control and inspect the agent's state. This allows automated testing without touching production WebSocket connections.

#### D.12.1 Test Server Protocol

The test server listens on `localhost:3456` (primary) and `localhost:3457` (fallback) and accepts JSON-RPC style commands over HTTP POST.

**Port Strategy:**
- Port 3456: Primary test server port
- Port 3457: Fallback if 3456 is in use (allows running 2 agents for cross-platform testing)

**Core Commands:**
```json
// Health check - verify agent is responsive
{ "method": "ping" }
-> { "pong": true, "version": "1.0.0", "platform": "macos", "uptime": 3600 }

// Get current agent state
{ "method": "getState" }
-> { "connected": true, "endpoint": "...", "status": "ACTIVE", "powerState": "PASSIVE", ... }

// Get all config field values
{ "method": "getFields" }
-> { "serverUrl": "...", "endpointUuid": "...", "customerId": "...", "connectOnStartup": true }

// Set debug field values
{ "method": "setField", "params": { "field": "serverUrl", "value": "wss://..." } }

// Click a button / trigger action
{ "method": "clickButton", "params": { "button": "connect" } }
{ "method": "clickButton", "params": { "button": "disconnect" } }
```

**Lifecycle Commands:**
```json
// Restart the agent (quit + relaunch)
{ "method": "restart" }

// Quit the agent gracefully
{ "method": "quit" }

// Force quit (for hung agents)
{ "method": "forceQuit" }
```

**Debugging Commands:**
```json
// Get recent logs (configurable limit)
{ "method": "getLogs", "params": { "limit": 100, "level": "debug" } }
-> { "logs": [ { "time": "...", "level": "info", "message": "..." }, ... ] }

// Stream logs in real-time (WebSocket upgrade)
{ "method": "streamLogs" }
-> WebSocket connection for real-time log streaming

// Get current memory/CPU usage
{ "method": "getMetrics" }
-> { "memoryMB": 45, "cpuPercent": 2.5, "connections": 1, "uptime": 3600 }

// Get screenshot (visual debugging)
{ "method": "getScreenshot", "params": { "format": "png" } }
-> { "screenshot": "<base64-encoded-image>" }

// Get stack trace (for debugging hangs)
{ "method": "getStackTrace" }
-> { "threads": [ { "name": "main", "stack": "..." }, ... ] }
```

**Simulation Commands:**
```json
// Simulate WebSocket disconnect
{ "method": "simulateDisconnect" }

// Simulate reconnection
{ "method": "simulateReconnect" }

// Simulate network latency
{ "method": "simulateLatency", "params": { "ms": 500 } }

// Simulate error condition
{ "method": "simulateError", "params": { "type": "auth_failure" } }
```

**Remote Update Commands:**
```json
// Update agent binary (for CI/CD)
{ "method": "updateBinary", "params": { "url": "https://...", "checksum": "sha256:..." } }
-> { "status": "downloading" } / { "status": "installing" } / { "status": "restarting" }

// Get current version info
{ "method": "getVersion" }
-> { "version": "1.0.0", "buildDate": "2024-01-15", "gitCommit": "abc123" }
```

#### D.12.2 macOS Test Server Implementation ✅ CORE COMPLETE

- [x] D.12.2.1 Add `TestServer` class in `TestServer.h/m`
- [x] D.12.2.2 Start HTTP server on localhost:3457 on app launch (uses native BSD sockets, DEBUG builds only)
- [x] D.12.2.3 Implement `getState` - return connection status, settings
- [x] D.12.2.4 Implement `setField` - programmatically fill text fields
- [x] D.12.2.5 Implement `clickButton` - trigger button actions (connect/disconnect/saveSettings)
- [x] D.12.2.6 Implement `getFields` - return all current field values
- [x] D.12.2.7 Implement `getLogs` - return recent log entries from debug log view
- [x] D.12.2.8 Implement `restart` - quit and relaunch app via NSWorkspace
- [x] D.12.2.9 Implement `quit` - graceful shutdown via NSApplication terminate
- [x] D.12.2.10 Implement `ping` - health check with version/platform info
- [x] D.12.2.11 Only bind to localhost (127.0.0.1) for security
- [ ] D.12.2.12 Add `--test-port=NNNN` command line argument to override port
- [ ] D.12.2.13 Implement `getMetrics` - memory/CPU via mach_task_info
- [ ] D.12.2.14 Implement `getScreenshot` - capture via CGWindowListCreateImage
- [ ] D.12.2.15 Implement `updateBinary` - download and replace app bundle
- [x] D.12.2.16 Implement `getVersion` - return app version, build date, git commit
- [ ] D.12.2.17 Implement WebSocket endpoint for `streamLogs` real-time log streaming

#### D.12.3 Windows Test Server Implementation

- [ ] D.12.3.1 Add `TestServer` class in C# (ScreenControlTray project)
- [ ] D.12.3.2 Start HTTP server on localhost:3456 on app launch (use HttpListener)
- [ ] D.12.3.3 Implement `getState` - return connection status, settings
- [ ] D.12.3.4 Implement `setField` - programmatically fill text fields
- [ ] D.12.3.5 Implement `clickButton` - trigger button actions (connect/disconnect)
- [ ] D.12.3.6 Implement `getFields` - return all current field values
- [ ] D.12.3.7 Implement `getLogs` - return recent log entries from Event Log or file
- [ ] D.12.3.8 Implement `restart` - quit and relaunch app via Process.Start
- [ ] D.12.3.9 Implement `quit` - graceful shutdown via Application.Exit
- [ ] D.12.3.10 Implement `ping` - health check with version info
- [ ] D.12.3.11 Only bind to localhost (127.0.0.1) for security
- [ ] D.12.3.12 Add `--test-port=NNNN` command line argument to override port
- [ ] D.12.3.13 Implement `getServiceStatus` - Windows service state via ServiceController
- [ ] D.12.3.14 Implement `getScreenshot` - capture via Graphics.CopyFromScreen
- [ ] D.12.3.15 Implement `getMetrics` - memory/CPU via PerformanceCounter
- [ ] D.12.3.16 Implement `updateBinary` - download and replace exe, schedule restart
- [ ] D.12.3.17 Implement `getVersion` - return assembly version, build date
- [ ] D.12.3.18 Implement WebSocket endpoint for `streamLogs` real-time log streaming

#### D.12.4 Linux Test Server Implementation

- [ ] D.12.4.1 Add `TestServer` class in C++ (screencontrol project) using cpp-httplib
- [ ] D.12.4.2 Start HTTP server on localhost:3456 on startup
- [ ] D.12.4.3 Implement `getState` - return connection status, settings
- [ ] D.12.4.4 Implement `setField` - programmatically set config values
- [ ] D.12.4.5 Implement `clickButton` - trigger actions (connect/disconnect)
- [ ] D.12.4.6 Implement `getFields` - return all current config values
- [ ] D.12.4.7 Implement `getLogs` - return recent log entries from journald (sd_journal) or file
- [ ] D.12.4.8 Implement `restart` - quit and relaunch via fork/exec
- [ ] D.12.4.9 Implement `quit` - graceful shutdown via signal
- [ ] D.12.4.10 Implement `ping` - health check with version info
- [ ] D.12.4.11 Only bind to localhost (127.0.0.1) for security
- [ ] D.12.4.12 Add `--test-port=NNNN` command line argument to override port
- [ ] D.12.4.13 Support both GUI and headless modes with same test interface
- [ ] D.12.4.14 Implement `getScreenshot` - capture via X11 XGetImage or Wayland
- [ ] D.12.4.15 Implement `getMetrics` - read from /proc/self/status
- [ ] D.12.4.16 Implement `updateBinary` - download, replace binary, restart
- [ ] D.12.4.17 Implement `getVersion` - return version from embedded string
- [ ] D.12.4.18 Implement WebSocket endpoint for `streamLogs` (use websocketpp)

#### D.12.5 Test Runner (Node.js)

Create a test runner in `test/agent-tests/` that can control agents remotely:

- [ ] D.12.5.1 Create `test/agent-tests/client.ts` - TestClient class for agent control
- [ ] D.12.5.2 Create `test/agent-tests/runner.ts` - test runner CLI
- [ ] D.12.5.3 Create test cases:
  - [ ] D.12.5.3.1 `connection.test.ts` - verify connect/disconnect flow
  - [ ] D.12.5.3.2 `heartbeat.test.ts` - verify heartbeat sends correctly
  - [ ] D.12.5.3.3 `reconnection.test.ts` - verify reconnection after disconnect
  - [ ] D.12.5.3.4 `config.test.ts` - verify debug config loading
  - [ ] D.12.5.3.5 `commands.test.ts` - verify MCP command handling
- [ ] D.12.5.4 Add `npm run test:agent` script
- [ ] D.12.5.5 Support targeting specific platforms: `npm run test:agent -- --platform=macos`

#### D.12.6 CI Integration

- [ ] D.12.6.1 Add GitHub Actions workflow for agent testing
- [ ] D.12.6.2 Run macOS tests on macOS runner
- [ ] D.12.6.3 Run Windows tests on Windows runner
- [ ] D.12.6.4 Run Linux tests on Linux runner

#### D.12.7 Test Server Security

**Important**: The test server should ONLY be available in debug builds or when explicitly enabled.

- [x] D.12.7.1 Only enable test server when `DEBUG` build flag is set
- [x] D.12.7.2 Bind ONLY to 127.0.0.1 (never 0.0.0.0)
- [ ] D.12.7.3 Add `--enable-test-server` command line flag for production builds
- [x] D.12.7.4 Log warning when test server is enabled
- [ ] D.12.7.5 Consider token-based auth for additional security

#### D.12.8 Continuous Deployment & Automated Testing Workflow

**Goal**: Enable fully automated build → deploy → test → fix → redeploy cycles without manual intervention.

##### D.12.8.1 Test Infrastructure Setup

**Each test machine has:**
- Agent running with test server enabled (port 3456)
- SSH access for deployment (or use `updateBinary` remote command)
- Network access to control server and build artifacts

**Environment:**
```
┌─────────────────────────────────────────────────────────────────┐
│                      CI/CD Server                                │
│  (GitHub Actions / Jenkins / Local)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│   │  macOS   │    │ Windows  │    │  Linux   │                 │
│   │  Agent   │    │  Agent   │    │  Agent   │                 │
│   │ :3456    │    │ :3456    │    │ :3456    │                 │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘                 │
│        │               │               │                        │
│        └───────────────┼───────────────┘                        │
│                        │                                         │
│                 Control Server                                   │
│              (screencontrol.knws.co.uk)                         │
│                        │                                         │
│                   Web Dashboard                                  │
└─────────────────────────────────────────────────────────────────┘
```

##### D.12.8.2 Automated Test Flow

```
1. Build Phase:
   - CI builds agent for all platforms (macOS, Windows, Linux)
   - Generate checksums for each binary
   - Upload to artifact storage

2. Deploy Phase (per platform):
   - Connect to agent's test server (localhost:3456 via SSH tunnel)
   - Call `getVersion` to check current version
   - Call `updateBinary` with new binary URL and checksum
   - Wait for agent to restart
   - Call `ping` to verify agent is back online

3. Test Phase:
   - Run connection tests (connect/disconnect/reconnect)
   - Run heartbeat tests (verify server receives heartbeats)
   - Run command tests (execute MCP tools, verify results)
   - Run stress tests (rapid connect/disconnect, many commands)
   - Capture screenshots for visual verification

4. Analyze Phase:
   - Call `getLogs` to retrieve all logs
   - Call `getMetrics` to get performance data
   - Compare results against expected baselines
   - Generate test report

5. Fix & Retry Phase (if tests fail):
   - Analyze failure logs
   - If fixable automatically: apply fix, rebuild, go to step 1
   - If requires manual intervention: alert developer with full logs
```

##### D.12.8.3 Implementation Tasks

- [ ] D.12.8.3.1 Create `scripts/deploy-agent.ts` - deploy new binary to test machine
- [ ] D.12.8.3.2 Create `scripts/test-agent.ts` - run full test suite against agent
- [ ] D.12.8.3.3 Create `scripts/collect-logs.ts` - gather logs from all platforms
- [ ] D.12.8.3.4 Create `scripts/generate-report.ts` - create HTML test report
- [ ] D.12.8.3.5 Create `scripts/ci-pipeline.ts` - orchestrate full CI/CD flow
- [ ] D.12.8.3.6 Add GitHub Actions workflow for automated testing
- [ ] D.12.8.3.7 Set up SSH tunnels for remote agent access (or VPN)
- [ ] D.12.8.3.8 Create artifact storage for test builds (S3, GCS, or local)

##### D.12.8.4 Test Machine Requirements

**macOS Test Machine:**
- [ ] D.12.8.4.1 macOS VM or physical machine with Accessibility permissions pre-granted
- [ ] D.12.8.4.2 ScreenControl.app installed with `--enable-test-server`
- [ ] D.12.8.4.3 SSH enabled for remote deployment
- [ ] D.12.8.4.4 Auto-login configured for GUI testing

**Windows Test Machine:**
- [ ] D.12.8.4.5 Windows VM with UAC configured for automation
- [ ] D.12.8.4.6 ScreenControl.exe installed with `--enable-test-server`
- [ ] D.12.8.4.7 OpenSSH or WinRM enabled for remote deployment
- [ ] D.12.8.4.8 Auto-login configured for GUI testing

**Linux Test Machine:**
- [ ] D.12.8.4.9 Linux VM with X11/Wayland for GUI testing
- [ ] D.12.8.4.10 screencontrol installed with `--enable-test-server`
- [ ] D.12.8.4.11 SSH enabled for remote deployment
- [ ] D.12.8.4.12 Headless variant tested separately (no display required)

##### D.12.8.5 Monitoring Dashboard

- [ ] D.12.8.5.1 Create real-time test status dashboard
- [ ] D.12.8.5.2 Show each platform's test status (passing/failing)
- [ ] D.12.8.5.3 Display live log stream from all agents
- [ ] D.12.8.5.4 Alert on test failures (Slack, email, etc.)
- [ ] D.12.8.5.5 Historical test results graph

---

## Part E: Navigation & Layout ✅ COMPLETE

### E.1 Dashboard Navigation ✅ COMPLETE

- [x] E.1.1 Add "Agents" link to dashboard sidebar
- [x] E.1.2 Add badge showing online agent count
- [x] E.1.3 Downloads integrated into connection detail page

### E.2 Home Dashboard Widgets ✅ COMPLETE

- [x] E.2.1 Agent status summary widget (connection status, activation state, power state)
- [x] E.2.2 Recent agent activity widget (last 10 commands)

---

## Environment Variables

Add to `.env`:

```bash
# Golden Builds
GOLDEN_BUILDS_PATH=/var/www/html/screencontrol/golden
PATCH_SECRET=your-hmac-secret-key

# WebSocket (if separate port needed)
WS_PORT=3001
```

---

## Priority Order (Summary)

> See "Updated Priority Order" at end of document for current detailed order.

**Next Up:**
1. D.7: Agent Renaming (MCPEyes → ScreenControl)
2. D.8: Debug Build Menu (manual stamping for testing)
3. D.9-D.11: Agent WebSocket Implementation

**Later:**
- Part H: Multi-tenant SaaS features
- Part I: Control server agent integration

**Final Steps (after all features complete):**
- Part F: Testing - Expand test suite for all new features
- Part G: Deployment - Production release (MUST be last)

---

## Testing Checklist

- [ ] Agent connects via WebSocket and appears in database
- [ ] Agent shows in dashboard as PENDING
- [ ] User activates agent → becomes ACTIVE
- [ ] Agent heartbeat updates lastSeenAt
- [ ] Agent disconnect shows as offline
- [ ] Wake command reaches sleeping agent
- [ ] Block prevents agent from connecting
- [ ] Download returns patched installer
- [ ] Patched agent connects to correct MCP endpoint

---

## Part F: Testing (from tasks3 Phase 10) - INITIAL IMPLEMENTATION ✅

> **Note**: Initial test suite implemented (159 tests passing). Will need expansion as more features are added (D.7-D.11, H.*, I.*).

### F.1 Unit Tests ✅ INITIAL COMPLETE

- [x] F.1.1 PKCE verification tests (RFC 7636 compliance)
- [x] F.1.2 Token generation/validation tests
- [x] F.1.3 Scope validation tests
- [x] F.1.4 Rate limiting tests

### F.2 Integration Tests ✅ INITIAL COMPLETE

- [x] F.2.1 Full OAuth flow test
- [x] F.2.2 Token refresh flow test
- [x] F.2.3 MCP request with valid token (scope validation)
- [x] F.2.4 MCP request with invalid/expired token
- [x] F.2.5 Agent WebSocket protocol test (message validation)
- [x] F.2.6 Agent registration and heartbeat test

### F.3 Manual Testing Checklist ✅ CREATED

**Created**: `web/src/__tests__/TESTING_CHECKLIST.md`

- [x] F.3.1 Test auth discovery procedures documented
- [x] F.3.2 Test DCR (Dynamic Client Registration) documented
- [x] F.3.3 Test authorization flow documented
- [x] F.3.4 Test MCP tools via authenticated connection documented

### F.4 Agent Testing Checklist

> To be verified with real agents after D.9-D.11 agent implementation

- [ ] F.4.1 Agent connects via WebSocket and appears in database
- [ ] F.4.2 Agent shows in dashboard as PENDING
- [ ] F.4.3 User activates agent → becomes ACTIVE
- [ ] F.4.4 Agent heartbeat updates lastSeenAt
- [ ] F.4.5 Agent disconnect shows as offline
- [ ] F.4.6 Wake command reaches sleeping agent
- [ ] F.4.7 Block prevents agent from connecting
- [ ] F.4.8 Download returns patched installer
- [ ] F.4.9 Patched agent connects to correct MCP endpoint

### F.5 Tests to Add (After Feature Completion)

> Add tests for new features as they are implemented

- [ ] F.5.1 Patch service binary patching tests
- [ ] F.5.2 Agent debug menu configuration tests
- [ ] F.5.3 Mock agent creation tests (D.8.5)
- [ ] F.5.4 Permissions and access control tests (H.4)
- [ ] F.5.5 Billing/subscription tests (H.2)
- [ ] F.5.6 Schedule override tests (H.6)

---

## Part H: Missing Multi-Tenant SaaS Features

> Features from tasks2.md Phase 6 that are required for the website to be a proper multi-tenant SaaS central router.

### H.1 Installer Download Portal

**Current state**: Download API routes exist but no UI.

**Create**: `web/src/app/dashboard/downloads/page.tsx`

- [ ] H.1.1 Create installer download page (requires login)
- [ ] H.1.2 Platform selector (macOS, Windows, Linux GUI, Linux Headless)
- [ ] H.1.3 Version selector (if multiple versions available)
- [ ] H.1.4 One-click download button that triggers patch service
- [ ] H.1.5 Show download history (from InstallerDownload table)
- [ ] H.1.6 "Regenerate Installer" button (new anti-piracy checksum)
- [ ] H.1.7 Custom installer notes/labels for organization
- [ ] H.1.8 Installation instructions per platform (collapsible)
- [ ] H.1.9 Link downloads page to connection detail page
- [ ] H.1.10 Show which connection the download is linked to

### H.2 Billing & Subscription Management (Stripe Integration)

**Current state**: Transaction model exists but no Stripe integration.

**Created**: `web/src/app/dashboard/licenses/page.tsx` (with billing/plan features)
**Created**: `web/src/lib/billing/` (provider-agnostic abstraction)

#### H.2.1 Billing Dashboard
- [x] H.2.1.1 Current plan display (Starter, Pro, Enterprise)
- [x] H.2.1.2 Active agents count vs plan limit
- [x] H.2.1.3 Current billing period dates
- [x] H.2.1.4 Next invoice estimate based on active agents
- [x] H.2.1.5 Payment method on file (last 4 digits)

#### H.2.2 Stripe Integration (Provider-Agnostic)
- [ ] H.2.2.1 Set up Stripe account and API keys
- [x] H.2.2.2 Create `web/src/lib/billing/provider.ts` (abstraction layer with mock + Stripe stub)
- [x] H.2.2.3 Create `/api/billing/checkout` - New subscription
- [x] H.2.2.4 Create `/api/billing/portal` - Manage subscription
- [x] H.2.2.5 Create `/api/billing/webhook` - Webhook handler (stub)
- [ ] H.2.2.6 Handle `checkout.session.completed` - Create/update license (stub ready)
- [ ] H.2.2.7 Handle `customer.subscription.updated` - Plan changes (stub ready)
- [ ] H.2.2.8 Handle `customer.subscription.deleted` - Cancellations (stub ready)
- [ ] H.2.2.9 Handle `invoice.payment_failed` - Suspend license (stub ready)

#### H.2.3 Per-Agent Pricing
- [x] H.2.3.1 Define pricing tiers:
  - Starter: 5 agents, $XX/month
  - Pro: 25 agents, $XX/month
  - Enterprise: Unlimited, custom pricing
- [ ] H.2.3.2 Overage handling configuration:
  - Option A: Block new agents at limit
  - Option B: Auto-upgrade to next tier
  - Option C: Per-agent overage charge
- [ ] H.2.3.3 Sync active agent count with Stripe metered billing
- [ ] H.2.3.4 Notify user approaching limit (80%, 100%)

#### H.2.4 Invoice History
- [ ] H.2.4.1 List past invoices from Stripe
- [ ] H.2.4.2 Download invoice PDF link
- [ ] H.2.4.3 Show payment status (paid, failed, pending)

### H.3 AI Connection Management

**Current state**: AIConnection model exists but limited UI (only via MCP connections).

**Create**: Enhanced view in `web/src/app/dashboard/connections/`

#### H.3.1 AI Connection List
- [ ] H.3.1.1 Show all AI connections (AIConnection table)
- [ ] H.3.1.2 Display: client name, client version, last activity
- [ ] H.3.1.3 Status: connected, disconnected, authorized
- [ ] H.3.1.4 Linked MCP connection (which endpoint they're using)

#### H.3.2 AI Connection Details
- [ ] H.3.2.1 Session history (connect/disconnect times)
- [ ] H.3.2.2 Command count and history
- [ ] H.3.2.3 Which agents this AI has accessed
- [ ] H.3.2.4 Revoke/disconnect button

#### H.3.3 Test Connection
- [ ] H.3.3.1 "Test MCP Endpoint" button
- [ ] H.3.3.2 Send test ping, show response time
- [ ] H.3.3.3 List available tools
- [ ] H.3.3.4 Show connection diagnostics if failed

### H.4 Permissions & Access Control

**Current state**: Basic scope validation exists. Need fine-grained agent-level permissions.

#### H.4.1 AI → Agent Mapping
- [ ] H.4.1.1 Create AgentPermission model (or extend existing)
  ```prisma
  model AgentPermission {
    id              String    @id @default(cuid())
    connectionId    String    // MCP connection
    agentId         String    // Which agent
    allowedTools    String[]  // ["screenshot", "click", "fs_read"]
    deniedTools     String[]  // ["shell_exec", "fs_write"]
    createdAt       DateTime  @default(now())
  }
  ```
- [ ] H.4.1.2 UI to configure which agents a connection can access
- [ ] H.4.1.3 "Allow All Agents" vs "Specific Agents" toggle

#### H.4.2 Tool-Level Permissions
- [ ] H.4.2.1 UI to allow/deny specific tools per connection
- [ ] H.4.2.2 Tool categories: GUI, Filesystem, Shell, Browser
- [ ] H.4.2.3 Quick presets: "Read Only", "Full Access", "No Shell"
- [ ] H.4.2.4 Enforce permissions in MCP route handler

#### H.4.3 Time-Based Access
- [ ] H.4.3.1 Schedule windows when connection is active
- [ ] H.4.3.2 "Allow during business hours only" option
- [ ] H.4.3.3 Timezone selector for schedules

#### H.4.4 IP Restrictions
- [ ] H.4.4.1 IP whitelist for connections
- [ ] H.4.4.2 IP blacklist for blocking known bad actors
- [ ] H.4.4.3 Enforce in MCP route handler

### H.5 User Account Settings

**Current state**: Settings page created with profile, password, and session management.

**Created**: `web/src/app/dashboard/settings/page.tsx`
**Created**: `web/src/app/api/settings/route.ts` - GET/PATCH user profile
**Created**: `web/src/app/api/settings/password/route.ts` - POST change password
**Created**: `web/src/app/api/settings/sessions/route.ts` - GET/DELETE sessions

#### H.5.1 Profile Settings
- [x] H.5.1.1 Edit name, email
- [x] H.5.1.2 Change password (for local auth users)
- [ ] H.5.1.3 Profile picture upload

#### H.5.2 Company/Billing Info
- [x] H.5.2.1 Company name
- [x] H.5.2.2 Billing email (for invoices)
- [x] H.5.2.3 VAT number (for EU customers)
- [ ] H.5.2.4 Billing address

#### H.5.3 Security Settings
- [x] H.5.3.1 Active sessions list (from Session table)
- [x] H.5.3.2 "Sign out all other devices" button
- [ ] H.5.3.3 Two-factor authentication (optional enhancement)
- [ ] H.5.3.4 API keys management (for programmatic access)

#### H.5.4 Notification Preferences
- [ ] H.5.4.1 Email notifications toggle
- [ ] H.5.4.2 Agent offline alerts
- [ ] H.5.4.3 Billing alerts (approaching limit, payment failed)

### H.6 Customer Schedule Overrides

**Current state**: CustomerActivityPattern model exists with scheduleMode. No UI.

**Create**: Add to agent settings or separate power management page.

#### H.6.1 Global Schedule Settings
- [ ] H.6.1.1 UI to set schedule mode:
  - Always Active (24/7)
  - Auto-Detect (learn from patterns)
  - Custom (user-defined hours)
  - Sleep Overnight (simple 11pm-7am)
- [ ] H.6.1.2 Timezone selector
- [ ] H.6.1.3 Custom quiet hours (start/end time pickers)

#### H.6.2 Per-Agent Schedule
- [ ] H.6.2.1 Override global schedule for specific agents
- [ ] H.6.2.2 "Never sleep" option for critical agents
- [ ] H.6.2.3 "Always sleep" option for standby agents

#### H.6.3 Activity Visualization
- [ ] H.6.3.1 24-hour activity chart (from hourlyActivity)
- [ ] H.6.3.2 Detected quiet hours display
- [ ] H.6.3.3 "Clear pattern data" button

### H.7 Agent Grouping & Organization

**Current state**: Agent model has `groupName` and `tags` fields. No UI.

#### H.7.1 Agent Groups
- [ ] H.7.1.1 Create/edit/delete agent groups
- [ ] H.7.1.2 Drag-drop agents into groups
- [ ] H.7.1.3 Filter agent list by group
- [ ] H.7.1.4 Group-level actions (activate all, block all)

#### H.7.2 Agent Tags
- [ ] H.7.2.1 Add/remove tags on agents
- [ ] H.7.2.2 Tag autocomplete from existing tags
- [ ] H.7.2.3 Filter agent list by tags
- [ ] H.7.2.4 Color-coded tags

#### H.7.3 Agent Custom Labels
- [ ] H.7.3.1 Edit agent label (friendly name)
- [ ] H.7.3.2 Agent notes/description field
- [ ] H.7.3.3 Show label in agent list (instead of hostname if set)

### H.8 Export & Reporting

**Current state**: No export functionality.

- [ ] H.8.1 Export agent list (CSV, JSON)
- [ ] H.8.2 Export command logs (CSV, JSON)
- [ ] H.8.3 Export connection activity (CSV)
- [ ] H.8.4 Usage reports for billing review
- [ ] H.8.5 Audit log export for compliance

### H.9 Dashboard Home Widgets

**Current state**: Dashboard has agent fleet status and recent activity widgets.

**Updated**: `web/src/app/dashboard/page.tsx`

- [x] H.9.1 Agent status summary card (online/offline/pending counts, activation state, power state)
- [x] H.9.2 Recent activity feed (last 10 commands from CommandLog)
- [ ] H.9.3 Billing summary card (current usage vs limit)
- [ ] H.9.4 Quick actions: Add connection, Download installer
- [ ] H.9.5 System health indicators

---

## Part I: Control Server Agent Integration (from tasks2.md 1.3)

> Agent-side connection tasks that are prerequisites for the dashboard to work.

### I.1 Agent WebSocket Client

- [ ] I.1.1 Implement WebSocket client with auto-reconnect (exponential backoff)
- [ ] I.1.2 Implement REGISTER message on connect
- [ ] I.1.3 Implement HEARTBEAT sending at server-specified interval
- [ ] I.1.4 Implement local license cache (secure storage)
- [ ] I.1.5 Implement grace period logic (72 hours default)
- [ ] I.1.6 Implement DEGRADED mode when grace period exceeded
- [ ] I.1.7 Implement status reporting (ready, screen locked, current task)
- [ ] I.1.8 Implement command reception and execution
- [ ] I.1.9 Implement response sending
- [ ] I.1.10 Never hard-kill mid-task (complete current, then enforce)

### I.2 Control Server Enhancements

- [x] I.2.1 Implement customer schedule overrides (from CustomerActivityPattern)
- [x] I.2.2 Implement periodic license re-validation
- [x] I.2.3 Handle license expiry mid-session
- [x] I.2.4 Register agent capabilities (tool list) on connect
- [x] I.2.5 Aggregate tools/list from connected agents

---

## Updated Priority Order

### ✅ COMPLETED
- **Part A: WebSocket Integration** - Custom server.ts with WebSocket on /ws
- **Part B: Agent Fleet Dashboard** - List, detail, actions, SSE updates
- **Part C: Agent API Enhancements** - All routes implemented
- **Part D.1: Database Schema** - InstallerDownload model exists
- **Part D.3-D.5: Patch Service & Download UI** - Library and API implemented
- **Part E: Navigation & Layout** - Agent badges, dashboard widgets
- **Part F: Initial Testing** - 159 tests passing (PKCE, tokens, scopes, rate limiting, OAuth flow, WebSocket protocol)

### 🚧 NEXT UP (Build Phase)
0. **D.0: Developer Test Environment** (create user + MCP connection + get endpointUuid)
1. **D.7: Agent Renaming** (MCPEyes → ScreenControl branding)
2. **D.8: Debug Build Menu** (manual stamping for testing - CRITICAL for development)
   - D.8.1-D.8.4: Agent debug menus (macOS, Windows, Linux)
   - D.8.5: Website debug mode (licensing & agent testing)
3. **D.9-D.11: Agent WebSocket Implementation** (macOS, Windows, Linux)
4. **Part I: Control Server Agent Integration** (agent-side connection)
5. **B.3.4: Activity Log UI** (Recent commands, sessions in agent detail)
6. **Part D.2: Golden Build Storage** (production server setup)
7. **Part D.6: Agent-Side PatchData Reading** (read embedded config)

### 📋 LATER (Features Phase)
8. **Part H.1: Installer Download Portal** (download stamped installers)
9. **Part H.4: Permissions & Access Control** (AI→agent mapping)
10. **Part H.5: User Account Settings** (profile, company info)
11. **Part H.6: Customer Schedule Overrides** (power management)
12. **Part H.7: Agent Grouping** (organization)
13. **Part H.2: Billing & Stripe** (production only)
14. **Part H.3: AI Connection Management** (enhanced view)
15. **Part H.8-H.9: Export & Dashboard Widgets** (polish)

### 🔒 FINAL (After All Features Complete)
16. **Part F.5: Expand Test Suite** - Add tests for D.7-D.11, H.*, I.* features
    - Patch service binary patching tests
    - Agent debug menu tests
    - Permissions tests
    - Billing integration tests
17. **Part G: Deployment** - Production release (MUST BE ABSOLUTE LAST)
    - Only after ALL features implemented and tested
    - Includes production environment setup
    - Final manual testing checklist verification

---

## References

- [tasks2.md Phase 1: Control Server](/todo/tasks2.md)
- [tasks2.md Phase 5: Build & Patch System](/todo/tasks2.md)
- [tasks2.md Phase 6: Web Platform](/todo/tasks2.md)
- [tasks3_remote_mcp.md: MCP Connection Management](/todo/tasks3_remote_mcp.md)
- [web/src/lib/control-server/](/web/src/lib/control-server/) - Existing implementation
