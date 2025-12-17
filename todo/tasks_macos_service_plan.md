# macOS Service Architecture Migration Plan

## Problem Statement

The current macOS ScreenControl implementation runs entirely in userland as a menu bar application. When the machine locks or the user session becomes unresponsive, the entire agent becomes inaccessible. This prevents:

1. Sending machine unlock commands
2. Executing shell commands remotely
3. File system operations
4. Any form of remote recovery

**This completely defeats the purpose of "remote access via AI"** - when you need it most (machine locked/unresponsive), it's unavailable.

**Goal**: Create a privileged service that runs independently of the user session, similar to the Windows and Linux implementations, enabling the agent to remain accessible when the machine is locked and capable of unlocking the machine.

---

## CRITICAL: Single Relay Architecture

The service is the **SINGLE POINT OF CONTACT** with the control server. This is fundamental to the architecture.

```
┌─────────────────────────────────────────────────────────────────┐
│                 screencontrol.knws.co.uk                         │
│                    (Control Server)                              │
│                                                                  │
│  • Sends tool requests                                           │
│  • Receives responses & heartbeats                               │
│  • Manages agent registration & licensing                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                      WebSocket (WSS)
                            │
                    ONLY CONNECTION
                      TO OUTSIDE
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ScreenControlService                            │
│               *** SINGLE RELAY POINT ***                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              WebSocket Client (EXCLUSIVE)                   │ │
│  │                                                             │ │
│  │  • ONLY component that talks to control server              │ │
│  │  • Maintains persistent connection                          │ │
│  │  • Receives ALL remote commands                             │ │
│  │  • Sends ALL responses back                                 │ │
│  │  • Heartbeats, registration, licensing                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                    Command Router                                │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐       │
│  │ Shell Tools │   │  FS Tools   │   │  Proxy to App   │       │
│  │ (execute)   │   │ (execute)   │   │  (GUI ops)      │       │
│  └─────────────┘   └─────────────┘   └────────┬────────┘       │
│                                                │                 │
│  Runs as: root (LaunchDaemon)                  │                 │
│  Survives: Machine lock, logout, reboot        │                 │
│  NEVER DIES while machine is powered on        │                 │
└────────────────────────────────────────────────┼─────────────────┘
                                                 │
                                          HTTP (localhost)
                                           127.0.0.1 ONLY
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ScreenControl.app                             │
│              *** NO EXTERNAL CONNECTIONS ***                     │
│                                                                  │
│  • NEVER talks to control server directly                        │
│  • ONLY communicates with local service via HTTP                 │
│  • Can die/restart without losing server connection              │
│  • Provides GUI operations service cannot do                     │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │  Menu Bar UI    │  │  MCP Stdio Mode  │  │  GUI Bridge    │  │
│  │  Settings       │  │  (Claude Code)   │  │  Server :3457  │  │
│  └─────────────────┘  └──────────────────┘  └────────────────┘  │
│                                                                  │
│  Runs as: Current user                                           │
│  Requires: Active user session, display                          │
└──────────────────────────────────────────────────────────────────┘
```

### Why Single Relay Matters

| Scenario | Old (All-in-One) | New (Service Relay) |
|----------|------------------|---------------------|
| Machine locks | ❌ Lost connection | ✅ Service maintains connection |
| App crashes | ❌ Lost connection | ✅ Service unaffected |
| User logs out | ❌ Lost connection | ✅ Service keeps running |
| Need to unlock | ❌ Impossible | ✅ Service sends unlock |
| GUI operation needed | ✅ Direct | ✅ Service proxies to app |

### Request Flow (All Remote Commands)

**Every remote command flows through the service:**

```
Control Server (screencontrol.knws.co.uk)
         │
         │ WebSocket message: {"method": "tools/call", "params": {"name": "shell_exec", ...}}
         ▼
    ScreenControlService
         │
         ├─► Is this a GUI operation? (screenshot, click, keyboard, OCR)
         │       │
         │       YES ──► HTTP POST to App:3457 ──► App executes ──► Response
         │       │                                                      │
         │       └──────────────────────────────────────────────────────┘
         │                                                              │
         └─► NO (shell, fs, system, unlock)                            │
                 │                                                      │
                 └──► Execute locally ──► Response                     │
                                              │                         │
         ┌────────────────────────────────────┴─────────────────────────┘
         │
         ▼
    WebSocket response back to Control Server
```

**The app NEVER sends anything to the control server directly. All external communication routes through the service.**

---

## Bidirectional Command Routing & Master Mode

### Stdio Support: Service OR App

MCP stdio mode can be provided by **either** the service or the app, depending on the use case:

| Stdio Provider | Use Case | Capabilities |
|----------------|----------|--------------|
| **Service** (`--mcp-stdio`) | Headless/server environments | Shell, FS, system, unlock - NO GUI |
| **App** (`--mcp-stdio`) | Desktop with Claude Code | Full capabilities including GUI |

Both expose the same MCP protocol, but route tools differently:
- **Service stdio**: Executes shell/fs locally, proxies GUI to app (if available)
- **App stdio**: Executes GUI locally, routes shell/fs to service

### Bidirectional Command Flow

The server (see `./web`) supports **bidirectional** command routing. Commands can flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        screencontrol.knws.co.uk                              │
│                           (Control Server)                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Agent Registry                                    │    │
│  │                                                                      │    │
│  │  • Aggregates tools from ALL agents with prefixes                   │    │
│  │  • Routes: "MacBook__screenshot" → MacBook agent                    │    │
│  │  • Routes: "Ubuntu__shell_exec" → Ubuntu agent                      │    │
│  │  • Enables agent-to-agent control through server                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────┬──────────────────┬───────────────────────────┘
                               │                  │
                          WebSocket           WebSocket
                               │                  │
                               ▼                  ▼
                    ┌──────────────────┐  ┌──────────────────┐
                    │  This Mac Agent  │  │  Other Agents    │
                    │  (Service)       │  │  (Win/Linux/Mac) │
                    └──────────────────┘  └──────────────────┘
```

### Master Mode: Local LLM Control

The app can act as a **master controller** when connected to a local LLM:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Local LLM (Ollama, etc.)                             │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                            stdio / SSE / HTTP
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ScreenControl.app (MASTER MODE)                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Local LLM Bridge                                  │    │
│  │                                                                      │    │
│  │  • Receives commands from local LLM                                 │    │
│  │  • Executes LOCAL tools directly (screenshot, click, etc.)          │    │
│  │  • Routes REMOTE agent commands through service → server            │    │
│  │  • Can control OTHER agents via prefixed tools                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                              HTTP (localhost)
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ScreenControlService                                 │
│                                                                              │
│  • Relays outbound commands TO server (for other agents)                    │
│  • Receives inbound commands FROM server (for this agent)                   │
│  • Bidirectional relay                                                       │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                              WebSocket
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    screencontrol.knws.co.uk                                  │
│                                                                              │
│  Routes command to target agent based on tool prefix                        │
│  e.g., "Ubuntu__shell_exec" → Ubuntu agent                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Command Routing Examples

**1. Inbound: Control Server → This Machine**
```
Server sends: {"method": "tools/call", "params": {"name": "screenshot"}}
         │
    Service receives via WebSocket
         │
    Routes to App:3457 (GUI operation)
         │
    App executes screenshot
         │
    Response back through Service → Server
```

**2. Outbound: Local LLM → Other Agent**
```
Local LLM sends: {"method": "tools/call", "params": {"name": "Ubuntu__shell_exec", "command": "ls"}}
         │
    App receives via stdio/SSE
         │
    Detects remote agent prefix "Ubuntu__"
         │
    Routes to Service:3456 → /relay endpoint
         │
    Service forwards to Server via WebSocket
         │
    Server routes to Ubuntu agent
         │
    Response flows back: Ubuntu → Server → Service → App → Local LLM
```

**3. Local: Local LLM → This Machine**
```
Local LLM sends: {"method": "tools/call", "params": {"name": "screenshot"}}
         │
    App receives via stdio/SSE
         │
    No prefix = local execution
         │
    App executes screenshot directly
         │
    Response back to Local LLM
```

### Service Relay Endpoint

The service needs a `/relay` endpoint for outbound commands:

```cpp
// In http_server.cpp
server.Post("/relay", [](const Request& req, Response& res) {
    auto body = json::parse(req.body);
    std::string method = body["method"];
    json params = body["params"];

    // Forward to control server via WebSocket
    auto result = g_wsClient->sendCommandToServer(method, params);

    res.set_content(result.dump(), "application/json");
});
```

### App Master Mode Components

```objc
// LocalLLMBridge.m - Connects to local LLM (Ollama, LM Studio, etc.)
@interface LocalLLMBridge : NSObject

// Connection modes
- (void)connectViaStdio;           // For CLI integration
- (void)connectViaSSE:(NSString *)url;  // Server-sent events
- (void)connectViaHTTP:(NSString *)url; // HTTP polling

// Tool routing
- (void)handleToolCall:(NSString *)toolName
                params:(NSDictionary *)params
            completion:(void(^)(NSDictionary *result))completion {

    if ([self hasRemoteAgentPrefix:toolName]) {
        // Route through service to server to other agent
        [self.serviceClient relayToRemoteAgent:toolName
                                        params:params
                                    completion:completion];
    } else if ([self isGuiTool:toolName]) {
        // Execute locally (we have GUI access)
        [self executeGuiTool:toolName params:params completion:completion];
    } else {
        // Route to local service for shell/fs
        [self.serviceClient executeLocally:toolName
                                    params:params
                                completion:completion];
    }
}

@end
```

### Tool Prefix Convention

Following the server's design (`./web/src/lib/control-server/agent-registry.ts`):

```
{AgentName}__{ToolName}

Examples:
  MacBook__screenshot     → MacBook agent, screenshot tool
  Ubuntu__shell_exec      → Ubuntu agent, shell_exec tool
  Windows-PC__fs_read     → Windows-PC agent, fs_read tool
```

When no prefix is present, the tool executes on the local agent.

### Updated Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              COMMAND SOURCES                                 │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Control      │  │ Local LLM    │  │ Claude Code  │  │ Browser      │    │
│  │ Server       │  │ (Ollama)     │  │ (stdio)      │  │ Extension    │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                  │            │
└─────────┼─────────────────┼─────────────────┼──────────────────┼────────────┘
          │                 │                 │                  │
     WebSocket          stdio/SSE          stdio            WebSocket
          │                 │                 │                  │
          ▼                 ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ScreenControlService                               │
│                                                                              │
│  • SINGLE external connection (WebSocket to server)                         │
│  • HTTP API for local components (:3456)                                    │
│  • Bidirectional relay (inbound + outbound commands)                        │
│  • Shell, FS, system tools (execute locally)                                │
│  • GUI proxy to app when needed                                             │
│                                                                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                             HTTP (localhost)
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ScreenControl.app                                  │
│                                                                              │
│  • GUI Bridge Server (:3457) - screenshot, click, keyboard, OCR             │
│  • MCP Stdio Mode - for Claude Code                                         │
│  • Local LLM Bridge - for Ollama/LM Studio (MASTER MODE)                    │
│  • Browser WebSocket - for extension                                        │
│  • Menu bar UI                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Archive: Legacy All-in-One Code

### Why Archive

The existing all-in-one macOS application represents significant development effort and works well for certain use cases:
- Local-only MCP stdio mode (Claude Code)
- Simple deployments where machine lock isn't a concern
- Quick user-installable option

However, the deal-breaker is that it becomes completely inaccessible when the machine locks - defeating the core purpose of remote AI access.

### Archive Strategy

Before beginning the new architecture, archive the current code:

```bash
# Phase 0: Archive legacy code
cd /Users/richardbrown/dev/screen_control

# Create archive directory
mkdir -p old

# Create compressed archive of current macOS app
tar -czvf old/macos-all-in-one-legacy-$(date +%Y%m%d).tar.gz \
    macos/ScreenControl/ \
    --exclude='*.xcuserstate' \
    --exclude='DerivedData' \
    --exclude='build'

# Commit to branch for safekeeping
git checkout -b archive/macos-all-in-one-legacy
git add old/
git commit -m "Archive legacy all-in-one macOS agent before service refactor"
git push origin archive/macos-all-in-one-legacy

# Return to main branch
git checkout main
```

### Archive Contents

The archive will contain:
- `ScreenControl/` - Complete Objective-C source
  - `AppDelegate.m/h` - Menu bar app with embedded servers
  - `MCPServer.m/h` - HTTP server (port 3456)
  - `StdioMCPBridge.m/h` - MCP protocol handler
  - `BrowserWebSocketServer.m/h` - Browser extension server
  - `FilesystemTools.m/h` - File operations
  - `ShellTools.m/h` - Shell execution
  - All supporting files

### When to Use Legacy Archive

The archived code could be useful if:
- Need a quick single-binary deployment
- Machine lock isn't a concern (always-attended use)
- Want to study the Objective-C implementations
- Need to support older macOS versions without service support

**Note**: The new architecture's MCP stdio mode will still work for Claude Code - this archive is purely for the all-in-one remote server scenario.

---

## Current macOS Architecture (Being Replaced)

```
ScreenControl.app (Single Monolithic App - Userland)
├── main.m                    Entry point & mode switching
├── AppDelegate.m             Menu bar UI, settings, all servers
│   └── debugWebSocketTask    ← PROBLEM: Dies when machine locks!
├── StdioMCPBridge.m          MCP stdio mode (Claude Code)
├── MCPServer.m               HTTP server (port 3456)
├── BrowserWebSocketServer.m  Browser extension (port 3457/3459)
├── FilesystemTools.m         File operations
├── ShellTools.m              Shell execution & sessions
└── TestServer.m              Debug testing (port 3458)

❌ All functionality runs in user session
❌ WebSocket to control server in userland
❌ Dies when machine locks = DEAL BREAKER
```

---

## Target Architecture (Service + App)

### Design Philosophy: Service-Heavy Architecture

**Maximize service functionality** - The service is:
- Always running (LaunchDaemon)
- Untouched by user session changes
- Consistent and reliable
- Central point for logging and communication

**Minimize app responsibility** - The app ONLY handles what absolutely requires display/user session.

### Service Layer (ScreenControlService) - Cross-Platform C++

**Why Cross-Platform C++**: Single codebase for macOS, Windows, and Linux - reducing development and maintenance effort significantly.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SHARED C++ CODE (~90%)                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Core (100% shared)                                          │    │
│  │  ├── websocket_client.cpp/h    OpenSSL WebSocket            │    │
│  │  ├── http_server.cpp/h         cpp-httplib server           │    │
│  │  ├── stdio_bridge.cpp/h        MCP stdio mode               │    │
│  │  ├── config.cpp/h              JSON config loading          │    │
│  │  ├── logger.cpp/h              Logging + server relay       │    │
│  │  └── command_router.cpp/h      Tool routing logic           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Tools (95% shared)                                          │    │
│  │  ├── shell_tools.cpp/h         POSIX on mac/linux, Win API  │    │
│  │  ├── filesystem_tools.cpp/h    C++17 <filesystem> (100%)    │    │
│  │  └── system_tools.cpp/h        Mostly shared, some #ifdef   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    Platform Abstraction
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                    PLATFORM-SPECIFIC (~10%)                          │
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │
│  │    macOS      │  │    Windows    │  │     Linux     │           │
│  ├───────────────┤  ├───────────────┤  ├───────────────┤           │
│  │ main_macos.cpp│  │ main_win.cpp  │  │ main_linux.cpp│           │
│  │ LaunchDaemon  │  │ SCM Service   │  │ systemd       │           │
│  │ IOKit unlock  │  │ Win32 unlock  │  │ D-Bus/PAM     │           │
│  │ CGSession     │  │ WTSApi        │  │ logind        │           │
│  │ Keychain      │  │ DPAPI         │  │ libsecret     │           │
│  └───────────────┘  └───────────────┘  └───────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Code Sharing Assessment (Based on Existing Linux/Windows Analysis):**

The existing `linux/` and `windows/ScreenControlService/` code is already well-aligned:

| Component | Lines (Linux) | Lines (Windows) | Shared % | Notes |
|-----------|---------------|-----------------|----------|-------|
| Filesystem tools | 448 | 444 | **95%** | C++17 `<filesystem>`, nearly identical |
| Shell tools | 343 | 288 | **70%** | Same interface, different syscalls |
| System tools | 277 | 436 | **75%** | Platform impl behind same interface |
| HTTP server/routes | 614 | ~600 | **95%** | Identical routes, cpp-httplib |
| WebSocket client | 851 | ~400 | **50%** | SSL layer differs (OpenSSL vs Schannel) |
| Tool dispatcher | ~150 | ~150 | **100%** | Identical routing logic |
| Main entry point | 798 | ~300 | **40%** | Service lifecycle differs |
| **TOTAL** | ~4,500 | ~3,200 | **~75%** | |

**What's Already Identical:**
- Tool interfaces (`shell_tools.h`, `filesystem_tools.h`) - 100% same
- HTTP REST API endpoints - 100% same JSON schemas
- WebSocket message protocol - 100% same JSON format
- Tool dispatcher logic - 100% same routing
- nlohmann/json usage - 100% same

**What Needs Platform Abstraction:**

| Abstraction | Linux | Windows | macOS |
|-------------|-------|---------|-------|
| SSL/TLS | OpenSSL | Schannel | OpenSSL (or Security.framework) |
| Process creation | `fork()/exec()` | `CreateProcess()` | `fork()/exec()` (same as Linux) |
| Clipboard | `xclip`/X11 | Win32 API | `pbcopy`/`pbpaste` |
| System info | `/proc`, `sysctl` | Win32 API, WMI | `sysctl`, IOKit |
| Service lifecycle | systemd | SCM | LaunchDaemon |
| Machine unlock | D-Bus/PAM | WTSApi | IOKit/CGSession |

**macOS Advantage:** macOS shares POSIX APIs with Linux, so ~85% of Linux code works on macOS with minimal changes.

```
ScreenControlService (LaunchDaemon - Root Privileges)
│
├── Communication (ALL external + internal)
│   ├── WebSocket Client ────► screencontrol.knws.co.uk (bidirectional)
│   ├── HTTP Server :3456 ───► Local API for app/CLI
│   ├── MCP Stdio Mode ──────► Headless LLM integration
│   └── Logging ─────────────► Persistent logs + relay to server
│
├── Core Tools (execute directly - NO app needed)
│   ├── Shell Tools (fork/exec, sessions)
│   ├── Filesystem Tools (C++17 fs)
│   ├── System Tools (info, power state)
│   ├── Clipboard (pbcopy/pbpaste as root)
│   ├── Process/Window List (CGWindowListCopyWindowInfo)
│   ├── Unlock Tools (IOKit/CGSession)
│   └── Power Management (wake, sleep, restart)
│
├── Relay Functions
│   ├── Outbound: App → Service → Server → Other agents
│   └── Inbound: Server → Service → Execute or → App (GUI only)
│
└── GUI Proxy (ONLY when display operation needed)
    └── Forward to App:3457 → screenshot, click, keyboard, OCR
```

**Service handles EVERYTHING except display-dependent operations:**

| Component | Implementation | Why Service |
|-----------|---------------|-------------|
| WebSocket Client | OpenSSL | Central communication, survives app crash |
| HTTP Server | cpp-httplib | Local API, consistent interface |
| MCP Stdio | stdin/stdout | Headless LLM support, no GUI needed |
| Shell Tools | POSIX fork/exec | No GUI dependency |
| Filesystem Tools | C++17 `<filesystem>` | No GUI dependency |
| System Info | sysctl/IOKit | No GUI dependency |
| Clipboard | pbcopy/pbpaste | Works as root |
| Window List | CGWindowListCopyWindowInfo | Works without user session |
| Unlock/Wake | IOKit/CGSession | Requires root, no GUI |
| Logging | File + server relay | Persistent, auditable |
| Relay Endpoint | HTTP POST /relay | Route commands to other agents |

### Userland Layer (ScreenControl.app) - Objective-C

**App is a thin GUI-only layer** - minimal responsibility:

```
ScreenControl.app (Menu Bar App - User Session)
│
├── GUI Bridge Server :3457 (ONLY these operations)
│   ├── Screenshot (CGWindowListCreateImage - needs display)
│   ├── Click/Mouse (CGEvent - needs accessibility)
│   ├── Keyboard (CGEvent - needs accessibility)
│   ├── OCR (Vision framework - needs display)
│   └── UI Elements (Accessibility API - needs user context)
│
├── Browser WebSocket :3459
│   └── Browser extension (browser runs in user session)
│
├── Menu Bar UI (user convenience only)
│   ├── Service status indicator
│   ├── Settings window
│   └── Quick actions
│
└── Local LLM Bridge (optional master mode)
    └── Routes commands, can control other agents
```

**App handles ONLY display-dependent operations:**

| Component | Why App (not service) |
|-----------|----------------------|
| Screenshot | Needs CGWindowListCreateImage with display |
| Click/Keyboard | Needs CGEvent with accessibility permission |
| OCR | Needs Vision framework with screen content |
| UI Elements | Needs Accessibility API in user context |
| Browser Extension | Browser runs in user session |
| Menu Bar | Obviously needs user session |

### Clear Boundary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEEDS DISPLAY? NEEDS USER SESSION?                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   NO  ──────────────────►  SERVICE handles it                       │
│                            (shell, fs, system, unlock, comms, logs) │
│                                                                      │
│   YES ──────────────────►  APP handles it                           │
│                            (screenshot, click, keyboard, OCR)        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Multi-User & Air Gap Architecture

The service and app have a **clean air gap** - they are independent components that communicate only via HTTP on localhost. This enables:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MACHINE LEVEL                                │
│                    (One Instance, All Users)                         │
│                                                                      │
│  ScreenControlService (LaunchDaemon)                                │
│  ├── Config: /Library/Application Support/ScreenControl/            │
│  ├── Logs: /var/log/screencontrol.log                               │
│  ├── Runs as: root                                                  │
│  ├── WebSocket: Single connection to control server                 │
│  └── HTTP API: localhost:3456 (serves ALL users)                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                         HTTP :3456
                    (air gap - loose coupling)
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                          USER LEVEL                                  │
│                   (Per-User Instance & Config)                       │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  User A: alice                                               │    │
│  │  ├── Config: ~/.config/screencontrol/                        │    │
│  │  │   ├── settings.json      (UI preferences)                │    │
│  │  │   ├── llm.json           (Ollama on localhost:11434)     │    │
│  │  │   └── tools.json         (enabled tools)                 │    │
│  │  ├── App: ScreenControl.app (alice's session)               │    │
│  │  └── Use case: Local AI coding assistant                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  User B: bob                                                 │    │
│  │  ├── Config: ~/.config/screencontrol/                        │    │
│  │  │   ├── settings.json      (different preferences)         │    │
│  │  │   ├── llm.json           (LM Studio on :1234)            │    │
│  │  │   └── tools.json         (different enabled tools)       │    │
│  │  ├── App: ScreenControl.app (bob's session)                 │    │
│  │  └── Use case: Remote server management                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why This Matters:**

| Aspect | Service (Machine) | App (User) |
|--------|-------------------|------------|
| **Instance** | One per machine | One per logged-in user |
| **Config location** | `/Library/Application Support/ScreenControl/` | `~/.config/screencontrol/` |
| **Runs as** | root (LaunchDaemon) | Current user (LaunchAgent or manual) |
| **Server connection** | Single WebSocket (machine identity) | None (talks to service only) |
| **LLM config** | N/A | Per-user (Ollama, LM Studio, etc.) |
| **Tool preferences** | Machine defaults | Per-user overrides |
| **Survives logout** | Yes | No (per-session) |

**Per-User Configuration (`~/.config/screencontrol/`):**

```json
// settings.json - User UI preferences
{
  "showInMenuBar": true,
  "startAtLogin": true,
  "theme": "dark"
}

// llm.json - User's local LLM setup
{
  "provider": "ollama",
  "endpoint": "http://localhost:11434",
  "model": "llama3.2",
  "masterMode": true  // Can control other agents
}

// tools.json - User's enabled tools
{
  "enabled": ["screenshot", "click", "typeText"],
  "disabled": ["shell_exec"]  // User doesn't want shell access
}
```

**Air Gap Benefits:**

1. **Independence**: Service can restart without affecting user apps
2. **Multi-user**: Each user has their own config, LLM, preferences
3. **Security**: Users can disable tools they don't want
4. **Flexibility**: Different LLM providers per user
5. **Isolation**: One user's crash doesn't affect others
6. **Upgrades**: Service and app can be updated independently

**Communication Protocol:**

The air gap means service and app communicate via simple HTTP:
- App → Service: `POST http://localhost:3456/tool` (execute tool)
- App → Service: `POST http://localhost:3456/relay` (send to other agent)
- Service → App: `POST http://localhost:3457/gui` (GUI operation needed)

No shared memory, no IPC complexity, no tight coupling.

### Service Logging & Server Relay

The service maintains comprehensive logging with optional relay to the control server:

```cpp
// logger.cpp - Service logging with server relay
class Logger {
public:
    enum Level { DEBUG, INFO, WARN, ERROR };

    // Log locally + optionally relay to server
    void log(Level level, const std::string& message, const json& metadata = {});

    // Configure server relay
    void setServerRelay(bool enabled);  // Send logs to server
    void setLogLevel(Level minLevel);   // Filter level

private:
    // Local logging
    void writeToFile(const std::string& entry);     // /var/log/screencontrol.log
    void writeToSyslog(const std::string& entry);   // macOS syslog

    // Server relay (via WebSocket)
    void relayToServer(const json& logEntry);
};
```

**Log Categories:**

| Category | Examples | Relay to Server |
|----------|----------|-----------------|
| `connection` | WebSocket connect/disconnect, reconnects | Yes |
| `command` | Tool calls received, execution results | Yes |
| `error` | Failures, exceptions, timeouts | Yes |
| `security` | Auth failures, permission denied | Yes |
| `system` | Service start/stop, config changes | Yes |
| `debug` | Verbose debugging info | No (local only) |

**Server-Side Benefits:**
- Audit trail of all agent activity
- Real-time monitoring in portal
- Alerting on errors/security events
- Debug remote agents without SSH

**Log Entry Format:**
```json
{
  "timestamp": "2024-12-16T10:30:00Z",
  "level": "INFO",
  "category": "command",
  "message": "Tool executed successfully",
  "metadata": {
    "tool": "shell_exec",
    "duration_ms": 150,
    "exit_code": 0
  }
}
```

---

## Detailed Migration Tasks

### Phase 0: Archive Legacy Code

```bash
# Create archive before making changes
mkdir -p old
tar -czvf old/macos-all-in-one-legacy-$(date +%Y%m%d).tar.gz macos/ScreenControl/
git checkout -b archive/macos-all-in-one-legacy
git add old/
git commit -m "Archive legacy all-in-one macOS agent"
git push origin archive/macos-all-in-one-legacy
git checkout main
```

### Phase 1: Create Service Infrastructure

#### 1.1 Create Service Project Structure

```
macos/
├── ScreenControl/           (existing app - to be modified)
├── ScreenControlService/    (NEW - service daemon)
│   ├── main.cpp
│   ├── http_server.cpp/h
│   ├── websocket_client.cpp/h
│   ├── tools/
│   │   ├── shell_tools.cpp/h
│   │   ├── filesystem_tools.cpp/h
│   │   ├── system_tools.cpp/h
│   │   └── unlock_tools.cpp/h    (NEW - machine unlock)
│   ├── core/
│   │   ├── config.cpp/h
│   │   └── logger.cpp/h
│   └── com.screencontrol.service.plist
└── ScreenControl.xcodeproj  (update to build both targets)
```

#### 1.2 Service Entry Point (main.cpp)

```cpp
// Core functionality:
// - Parse command line args (--install, --uninstall, --console)
// - Load configuration from /Library/Application Support/ScreenControl/
// - Start HTTP server on port 3456
// - Connect to control server via WebSocket (EXCLUSIVE connection)
// - Handle SIGTERM/SIGINT for graceful shutdown
// - Run event loop

int main(int argc, char* argv[]) {
    // 1. Parse args
    // 2. Load config (server URL, credentials)
    // 3. Start HTTP server (port 3456)
    // 4. Connect WebSocket to screencontrol.knws.co.uk
    // 5. Register command handler
    // 6. Run event loop (service stays alive)
}
```

#### 1.3 LaunchDaemon Plist

```xml
<!-- /Library/LaunchDaemons/com.screencontrol.service.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.screencontrol.service</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Library/PrivilegedHelperTools/com.screencontrol.service</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/screencontrol.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/screencontrol.log</string>
</dict>
</plist>
```

### Phase 2: Port Core Tools to C++

#### 2.1 WebSocket Client (websocket_client.cpp) - CRITICAL

This is the heart of the relay architecture:

```cpp
class WebSocketClient {
public:
    // Connect to control server (screencontrol.knws.co.uk)
    bool connect(const std::string& url);

    // Send response back to server
    void sendResponse(const std::string& requestId, const json& result);

    // Send heartbeat
    void sendHeartbeat();

    // Set command handler (routes to tool execution)
    void setCommandCallback(CommandCallback cb);

private:
    // Background thread for receiving
    void receiveLoop();

    // Reconnection with backoff
    void reconnect();
};
```

Port/adapt from Linux implementation:
- Use OpenSSL for TLS (system or Homebrew)
- Maintain persistent connection
- Handle all server communication
- Route commands to appropriate handlers

#### 2.2 HTTP Server (http_server.cpp)

- Use cpp-httplib (header-only, same as Linux/Windows)
- Routes:
  - `/status` - Service health
  - `/fs/*` - Filesystem operations
  - `/shell/*` - Shell command execution
  - `/system/*` - System info, clipboard
  - `/unlock` - Machine unlock (NEW)
  - `/power/*` - Power management (NEW)

#### 2.3 GUI Proxy in HTTP Server

```cpp
// When service receives GUI operation from control server
json handleToolCall(const std::string& tool, const json& params) {
    if (isGuiTool(tool)) {
        // Proxy to app's GUI Bridge Server
        httplib::Client client("127.0.0.1", 3457);
        auto res = client.Post("/tool", params.dump(), "application/json");
        if (res && res->status == 200) {
            return json::parse(res->body);
        }
        return {{"error", "GUI Bridge unavailable - machine may be locked"}};
    }
    // Execute locally
    return executeLocalTool(tool, params);
}
```

#### 2.4 Shell Tools (shell_tools.cpp)

Port from Linux (POSIX APIs work on macOS):
- `executeCommand()` - fork/exec pattern
- `startSession()` - Interactive shell sessions
- `sendInput()` - Write to session stdin
- `stopSession()` - Send signals (SIGTERM/SIGKILL)

#### 2.5 Filesystem Tools (filesystem_tools.cpp)

Port from Linux:
- Use C++17 `<filesystem>` library
- Functions: list, read, readRange, write, delete, move, search, grep, patch

#### 2.6 Machine Unlock Tools (unlock_tools.cpp) - NEW

```cpp
namespace UnlockTools {
    // Check if screen is locked
    bool isScreenLocked();

    // Unlock machine - multiple modes (see Security Architecture below)
    json unlockMachine(const std::string& mode, const json& params);

    // Wake machine from sleep
    json wakeMachine();

    // Get active user session info
    json getSessionInfo();

    // Switch to user session
    json switchToUser(const std::string& username);

    // Credential management (stored mode only)
    json storeCredentials(const std::string& encryptedBlob, const std::string& keyFragment);
    json clearCredentials();
    bool hasStoredCredentials();
}
```

Implementation approaches:
1. **CGSession APIs** - Check lock state, session properties
2. **IOKit** - Power management, wake from sleep
3. **AppleScript/osascript** - Run as root to interact with login window
4. **Security.framework** - For credential handling

---

## Machine Unlock Security Architecture

### Design Principles

1. **Server never stores credentials** - Not even encrypted
2. **Credentials at rest only on machine** - Encrypted with split key
3. **Decryption requires server token** - Can't unlock without server authorization
4. **Physical server theft = no credentials** - Maximum security

### Unlock Modes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         UNLOCK MODE COMPARISON                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MODE 1: FORT KNOX (Maximum Security)                                       │
│  ─────────────────────────────────────                                       │
│  • User enters credentials in web portal at unlock time                     │
│  • Credentials transmitted directly to agent via WebSocket                  │
│  • Used once, immediately discarded                                         │
│  • NOTHING stored anywhere                                                  │
│  • Best for: High-security environments, infrequent unlocks                │
│                                                                              │
│  Portal ──[user enters creds]──► Server ──[WSS]──► Agent ──► Unlock        │
│                                    │                  │                      │
│                               (pass-through)    (use & discard)             │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MODE 2: STORED CREDENTIALS (Convenience + Security)                        │
│  ───────────────────────────────────────────────────                        │
│  • Credentials stored ENCRYPTED on machine only                             │
│  • Decryption requires token from server                                    │
│  • Server stores only: agent ID → unlock enabled (boolean)                  │
│  • Best for: Automated unlocks, scheduled access                            │
│                                                                              │
│  Setup:                                                                      │
│  Portal ──[user enters creds]──► Agent ──► Encrypt & Store locally          │
│                                    │                                         │
│                              (never reaches server)                          │
│                                                                              │
│  Unlock:                                                                     │
│  Portal ──[unlock request]──► Server ──[WSS + token]──► Agent               │
│                                  │                        │                  │
│                            (no creds)              Decrypt & Unlock          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cryptographic Design (Stored Mode)

**Key Split Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CREDENTIAL ENCRYPTION                                 │
│                                                                              │
│  User enters credentials (username + password)                              │
│                          │                                                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Generate random AES-256 key (K)                                     │   │
│  │  Encrypt credentials: E = AES-256-GCM(K, credentials)               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Split key K into two fragments:                                     │   │
│  │    K1 = random(32 bytes)           ← Stored on MACHINE               │   │
│  │    K2 = K XOR K1                   ← Stored on SERVER                │   │
│  │                                                                      │   │
│  │  Neither fragment alone can decrypt                                  │   │
│  │  K = K1 XOR K2 (both needed)                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          │                                                   │
│              ┌───────────┴───────────┐                                      │
│              ▼                       ▼                                       │
│  ┌─────────────────────┐  ┌─────────────────────┐                          │
│  │  MACHINE STORES:    │  │  SERVER STORES:     │                          │
│  │  • E (encrypted     │  │  • K2 (key frag)    │                          │
│  │    credentials)     │  │  • Agent ID         │                          │
│  │  • K1 (key frag)    │  │  • Unlock enabled   │                          │
│  │                     │  │                     │                          │
│  │  Location:          │  │  Location:          │                          │
│  │  macOS: Keychain    │  │  Database           │                          │
│  │  Win: DPAPI         │  │  (encrypted col)    │                          │
│  │  Linux: libsecret   │  │                     │                          │
│  └─────────────────────┘  └─────────────────────┘                          │
│                                                                              │
│  SERVER THEFT RESULT: K2 alone is useless (random bytes)                   │
│  MACHINE THEFT RESULT: E + K1 alone cannot decrypt (need K2)               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Unlock Flow (Stored Mode):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UNLOCK SEQUENCE                                    │
│                                                                              │
│  1. User clicks "Unlock" in web portal                                      │
│                          │                                                   │
│                          ▼                                                   │
│  2. Server retrieves K2 for this agent from database                        │
│                          │                                                   │
│                          ▼                                                   │
│  3. Server sends unlock command via WebSocket:                              │
│     {                                                                        │
│       "type": "request",                                                    │
│       "method": "tools/call",                                               │
│       "params": {                                                           │
│         "name": "unlock_machine",                                           │
│         "mode": "stored",                                                   │
│         "keyFragment": "K2_base64_encoded"                                  │
│       }                                                                      │
│     }                                                                        │
│                          │                                                   │
│                          ▼                                                   │
│  4. Agent receives K2, retrieves K1 + E from local secure storage           │
│                          │                                                   │
│                          ▼                                                   │
│  5. Agent reconstructs key: K = K1 XOR K2                                   │
│                          │                                                   │
│                          ▼                                                   │
│  6. Agent decrypts credentials: credentials = AES-256-GCM-Decrypt(K, E)    │
│                          │                                                   │
│                          ▼                                                   │
│  7. Agent performs unlock using platform API                                │
│                          │                                                   │
│                          ▼                                                   │
│  8. Credentials wiped from memory immediately                               │
│                          │                                                   │
│                          ▼                                                   │
│  9. Agent sends response: {"success": true, "unlocked": true}              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Service Implementation

```cpp
// unlock_tools.cpp - Credential storage and unlock

#include <openssl/evp.h>
#include <openssl/rand.h>

namespace UnlockTools {

    // Platform-specific secure storage
    namespace SecureStorage {
        #if defined(__APPLE__)
            // macOS: Use Keychain Services
            bool store(const std::string& key, const std::vector<uint8_t>& data);
            std::vector<uint8_t> retrieve(const std::string& key);
            bool remove(const std::string& key);
        #elif defined(_WIN32)
            // Windows: Use DPAPI
            bool store(const std::string& key, const std::vector<uint8_t>& data);
            std::vector<uint8_t> retrieve(const std::string& key);
            bool remove(const std::string& key);
        #else
            // Linux: Use libsecret
            bool store(const std::string& key, const std::vector<uint8_t>& data);
            std::vector<uint8_t> retrieve(const std::string& key);
            bool remove(const std::string& key);
        #endif
    }

    // Store encrypted credentials (called during setup)
    json storeCredentials(const std::string& username,
                          const std::string& password,
                          std::string& outServerKeyFragment) {
        // 1. Generate random AES-256 key
        std::vector<uint8_t> key(32);
        RAND_bytes(key.data(), 32);

        // 2. Encrypt credentials
        std::string plaintext = username + "\0" + password;
        auto encrypted = aes256GcmEncrypt(key, plaintext);

        // 3. Split key: K1 (local), K2 (server)
        std::vector<uint8_t> k1(32), k2(32);
        RAND_bytes(k1.data(), 32);
        for (int i = 0; i < 32; i++) {
            k2[i] = key[i] ^ k1[i];
        }

        // 4. Store locally: encrypted blob + K1
        SecureStorage::store("screencontrol.credentials", encrypted);
        SecureStorage::store("screencontrol.keyfrag", k1);

        // 5. Return K2 for server storage
        outServerKeyFragment = base64Encode(k2);

        // 6. Wipe key from memory
        OPENSSL_cleanse(key.data(), key.size());

        return {{"success", true}, {"hasCredentials", true}};
    }

    // Unlock using stored credentials
    json unlockWithStoredCredentials(const std::string& serverKeyFragment) {
        // 1. Retrieve local fragments
        auto encrypted = SecureStorage::retrieve("screencontrol.credentials");
        auto k1 = SecureStorage::retrieve("screencontrol.keyfrag");

        if (encrypted.empty() || k1.empty()) {
            return {{"success", false}, {"error", "No stored credentials"}};
        }

        // 2. Decode server key fragment
        auto k2 = base64Decode(serverKeyFragment);

        // 3. Reconstruct key: K = K1 XOR K2
        std::vector<uint8_t> key(32);
        for (int i = 0; i < 32; i++) {
            key[i] = k1[i] ^ k2[i];
        }

        // 4. Decrypt credentials
        std::string plaintext = aes256GcmDecrypt(key, encrypted);
        size_t sep = plaintext.find('\0');
        std::string username = plaintext.substr(0, sep);
        std::string password = plaintext.substr(sep + 1);

        // 5. Perform unlock
        auto result = performPlatformUnlock(username, password);

        // 6. Wipe sensitive data from memory
        OPENSSL_cleanse(key.data(), key.size());
        OPENSSL_cleanse(&plaintext[0], plaintext.size());
        OPENSSL_cleanse(&password[0], password.size());

        return result;
    }

    // Fort Knox mode: unlock with pushed credentials (not stored)
    json unlockWithPushedCredentials(const std::string& username,
                                      const std::string& password) {
        auto result = performPlatformUnlock(username, password);
        // Credentials never stored, just used and discarded
        return result;
    }
}
```

### Web Portal UI (New Tools)

Add to `./web` portal:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT: MacBook-Pro                                    [●] Connected        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MACHINE STATUS                                                             │
│  ─────────────────                                                          │
│  Screen: 🔒 Locked                                                          │
│  Power: ⚡ Awake                                                            │
│  User: richard (logged in)                                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  UNLOCK OPTIONS                                                      │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  ○ Fort Knox Mode (enter credentials now)                           │   │
│  │    ┌──────────────────────────────────────────────────────────┐    │   │
│  │    │ Username: [richard                                    ]  │    │   │
│  │    │ Password: [••••••••••                                 ]  │    │   │
│  │    └──────────────────────────────────────────────────────────┘    │   │
│  │    ⓘ Credentials sent directly to agent, never stored              │   │
│  │                                                                      │   │
│  │  ● Use Stored Credentials                                           │   │
│  │    ✓ Credentials configured on 2024-12-10                          │   │
│  │    ⓘ Encrypted on machine, requires server token to unlock          │   │
│  │                                                                      │   │
│  │                                        [🔓 Unlock Machine]          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CREDENTIAL MANAGEMENT                                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  [📝 Set Up Stored Credentials]  [🗑️ Clear Stored Credentials]      │   │
│  │                                                                      │   │
│  │  ⚠️  Stored credentials are encrypted on the machine only.          │   │
│  │     The server stores only a decryption token, not the password.    │   │
│  │     If the server is compromised, credentials cannot be recovered.  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Schema (Server)

```sql
-- Add to agents table (or new unlock_config table)
ALTER TABLE agents ADD COLUMN unlock_enabled BOOLEAN DEFAULT false;
ALTER TABLE agents ADD COLUMN unlock_key_fragment TEXT;  -- K2, base64 encoded
ALTER TABLE agents ADD COLUMN unlock_configured_at TIMESTAMP;

-- The key fragment alone is useless without the machine's K1
-- Even if database is stolen, credentials cannot be decrypted
```

### Security Audit Trail

```sql
-- Log all unlock attempts
CREATE TABLE unlock_audit_log (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    mode VARCHAR(20) NOT NULL,  -- 'fortknox' or 'stored'
    initiated_by VARCHAR(255),   -- user who clicked unlock
    ip_address VARCHAR(45),
    success BOOLEAN,
    error_message TEXT,

    -- Never log actual credentials!
);
```

### Fort Knox Principle: Write-Only Credentials

**Credentials are WRITE-ONLY from network perspective:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CREDENTIAL FLOW DIRECTION                                │
│                                                                              │
│                           ┌─────────────┐                                   │
│                           │   SERVER    │                                   │
│                           └──────┬──────┘                                   │
│                                  │                                           │
│                         ┌────────┴────────┐                                 │
│                         │                 │                                 │
│                    K2 token          Fort Knox                              │
│                   (for unlock)      credentials                             │
│                         │                 │                                 │
│                         ▼                 ▼                                 │
│                    ┌─────────────────────────┐                              │
│               ──►  │        AGENT           │  ──X──► NEVER                │
│              IN    │                         │   OUT                        │
│                    │  Credentials stored     │                              │
│                    │  locally, used locally  │                              │
│                    │  NEVER sent back        │                              │
│                    └─────────────────────────┘                              │
│                                                                              │
│  ✓ Server can SEND credentials/tokens to agent                             │
│  ✗ Server can NEVER REQUEST credentials back                               │
│  ✗ No API exists to retrieve stored credentials                            │
│  ✗ Even with full server compromise, credentials stay on machines          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**No Credential Retrieval API:**

```cpp
// unlock_tools.cpp - These functions DO NOT EXIST by design

// ❌ FORBIDDEN - Never implement these:
// json getStoredCredentials();           // NO!
// json exportCredentials();              // NO!
// std::string getUsername();             // NO!
// std::string getPassword();             // NO!

// ✓ ALLOWED - Only these exist:
json storeCredentials(...);              // Write credentials (setup)
json clearCredentials();                 // Delete credentials
bool hasStoredCredentials();             // Check if configured (bool only)
json unlockWithStoredCredentials(...);   // Use credentials locally
```

### Tool Hardening: Credential File Protection

The service implements **Protected Paths** - files that tools are forbidden from accessing, even via shell_exec or fs_read:

```cpp
// protected_paths.h - Credential exfiltration prevention

namespace ProtectedPaths {

    // Files that tools CANNOT access
    const std::vector<std::string> PROTECTED_PATTERNS = {
        // macOS Keychain
        "*/Library/Keychains/*",
        "*/login.keychain*",
        "*/.keychain*",

        // Windows DPAPI
        "*\\AppData\\*\\Microsoft\\Protect\\*",
        "*\\AppData\\*\\Microsoft\\Credentials\\*",

        // Linux libsecret
        "*/.local/share/keyrings/*",
        "*/.gnome2/keyrings/*",

        // ScreenControl specific
        "*screencontrol.credentials*",
        "*screencontrol.keyfrag*",
        "*screencontrol*unlock*",

        // General secrets
        "*/.ssh/*",
        "*/.gnupg/*",
        "*/.aws/credentials*",
        "*/id_rsa*",
        "*/id_ed25519*",
    };

    // Check if path is protected
    bool isProtected(const std::string& path);

    // Get denial message
    std::string getDenialReason(const std::string& path);
}
```

**Enforcement in Tools:**

```cpp
// filesystem_tools.cpp - Protected path enforcement

json FilesystemTools::read(const std::string& path, int maxBytes) {
    // SECURITY: Check protected paths FIRST
    if (ProtectedPaths::isProtected(path)) {
        Logger::log(Logger::SECURITY, "Blocked read attempt to protected path",
                   {{"path", path}, {"tool", "fs_read"}});
        return {
            {"success", false},
            {"error", "Access denied: protected system file"},
            {"code", "PROTECTED_PATH"}
        };
    }

    // Normal read operation...
}

json FilesystemTools::list(const std::string& path, bool recursive, int maxDepth) {
    // SECURITY: Filter out protected paths from listings
    // Don't even reveal they exist
    // ...
}

// shell_tools.cpp - Command injection prevention

json ShellTools::exec(const std::string& command,
                      const std::string& cwd,
                      int timeout) {
    // SECURITY: Scan command for credential access attempts
    if (containsProtectedPathAccess(command)) {
        Logger::log(Logger::SECURITY, "Blocked shell command targeting protected path",
                   {{"command", command}, {"tool", "shell_exec"}});
        return {
            {"success", false},
            {"error", "Access denied: command targets protected files"},
            {"code", "PROTECTED_PATH"}
        };
    }

    // Additional checks for common exfiltration patterns
    if (isExfiltrationAttempt(command)) {
        Logger::log(Logger::SECURITY, "Blocked potential exfiltration attempt",
                   {{"command", command}, {"tool", "shell_exec"}});
        return {
            {"success", false},
            {"error", "Access denied: suspicious command pattern"},
            {"code", "EXFILTRATION_BLOCKED"}
        };
    }

    // Normal execution...
}

bool containsProtectedPathAccess(const std::string& command) {
    // Check for direct path access
    for (const auto& pattern : ProtectedPaths::PROTECTED_PATTERNS) {
        if (commandMatchesPattern(command, pattern)) return true;
    }

    // Check for common bypass attempts
    std::vector<std::string> suspiciousPatterns = {
        "security find-generic-password",  // macOS keychain dump
        "security dump-keychain",           // macOS keychain dump
        "cmdkey /list",                     // Windows credential dump
        "vaultcmd",                          // Windows vault
        "secret-tool",                       // Linux libsecret
        "gnome-keyring",                     // Linux keyring
        "kwallet",                           // KDE wallet
        "dbus-send.*secrets",               // D-Bus secret access
    };

    for (const auto& pattern : suspiciousPatterns) {
        if (std::regex_search(command, std::regex(pattern, std::regex::icase))) {
            return true;
        }
    }

    return false;
}

bool isExfiltrationAttempt(const std::string& command) {
    // Detect base64 encoding of sensitive paths
    // Detect curl/wget with credential paths
    // Detect nc/netcat with file redirection
    // Detect compression of keychain/credential directories

    std::vector<std::string> exfiltrationPatterns = {
        "base64.*keychain",
        "curl.*upload.*credential",
        "wget.*post.*keychain",
        "nc.*<.*keychain",
        "tar.*keychain",
        "zip.*credential",
        "scp.*keychain",
        "rsync.*credential",
    };

    for (const auto& pattern : exfiltrationPatterns) {
        if (std::regex_search(command, std::regex(pattern, std::regex::icase))) {
            return true;
        }
    }

    return false;
}
```

### Security Layers Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DEFENSE IN DEPTH                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: No Retrieval API                                                  │
│  ─────────────────────────                                                  │
│  • No function exists to read credentials back                              │
│  • Server cannot request credentials even if compromised                    │
│  • Credentials are write-only from network                                  │
│                                                                              │
│  LAYER 2: Split Key Encryption                                              │
│  ────────────────────────────                                               │
│  • K1 on machine, K2 on server                                              │
│  • Neither half useful alone                                                │
│  • Server theft = random bytes                                              │
│                                                                              │
│  LAYER 3: Protected Path Enforcement                                        │
│  ───────────────────────────────────                                        │
│  • fs_read blocks credential file access                                    │
│  • fs_list hides credential files from listings                             │
│  • shell_exec blocks commands targeting credentials                         │
│  • Pattern detection for bypass attempts                                    │
│                                                                              │
│  LAYER 4: Exfiltration Detection                                            │
│  ───────────────────────────────                                            │
│  • Block base64 encoding of sensitive paths                                 │
│  • Block curl/wget uploads of credentials                                   │
│  • Block compression of credential directories                              │
│  • Block network transfer commands with credential paths                    │
│                                                                              │
│  LAYER 5: Audit Logging                                                     │
│  ──────────────────────                                                     │
│  • All blocked attempts logged with full context                            │
│  • Alerts on security events                                                │
│  • Forensic trail for investigation                                         │
│                                                                              │
│  LAYER 6: Platform Secure Storage                                           │
│  ────────────────────────────────                                           │
│  • macOS: Keychain (hardware-backed on Apple Silicon)                       │
│  • Windows: DPAPI (user/machine key protected)                              │
│  • Linux: libsecret (encrypted keyring)                                     │
│                                                                              │
│  RESULT: Even with FULL server compromise + agent tool access,              │
│          attacker CANNOT exfiltrate stored credentials                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Configuration: Protected Paths

Administrators can extend protected paths via config:

```json
// /Library/Application Support/ScreenControl/security.json
{
  "protectedPaths": {
    "builtin": true,  // Use default protected patterns
    "custom": [
      "/etc/shadow",
      "/etc/passwd",
      "*.pem",
      "*.key",
      "*secret*"
    ]
  },
  "shellBlacklist": {
    "builtin": true,  // Use default blocked commands
    "custom": [
      "security",
      "cmdkey",
      "secret-tool"
    ]
  },
  "securityLogging": {
    "logBlocked": true,
    "alertOnBlocked": true,
    "relayToServer": true
  }
}
```

### Task Checklist Addition

**Phase 2c: Machine Unlock Security:**
- [ ] Implement AES-256-GCM encryption/decryption
- [ ] Implement key splitting (K1 local, K2 server)
- [ ] macOS: Keychain secure storage
- [ ] Windows: DPAPI secure storage
- [ ] Linux: libsecret secure storage
- [ ] Fort Knox mode (push credentials, never stored)
- [ ] Stored credentials mode (split key)
- [ ] Memory wiping after use (OPENSSL_cleanse)
- [ ] **NO credential retrieval API** (write-only by design)

**Phase 2d: Tool Hardening (Exfiltration Prevention):**
- [ ] Implement ProtectedPaths module
- [ ] fs_read: Block access to credential files
- [ ] fs_list: Hide credential files from listings
- [ ] shell_exec: Block commands targeting credentials
- [ ] shell_exec: Block keychain/credential dump commands
- [ ] shell_exec: Detect exfiltration patterns (base64, curl, tar)
- [ ] Security logging for all blocked attempts
- [ ] Configurable protected paths (security.json)
- [ ] Alert system for security events

**Phase 2e: Web Portal Unlock UI:**
- [ ] Unlock options UI (Fort Knox vs Stored)
- [ ] Credential setup wizard
- [ ] Clear stored credentials button
- [ ] Database: unlock_key_fragment column
- [ ] Audit logging for all unlock attempts
- [ ] Security event alerts in portal

### Phase 3: Modify Existing App

#### 3.1 Remove Control Server Connection from AppDelegate

**Remove from AppDelegate.m:**
```objc
// DELETE these - moving to service
@property NSURLSessionWebSocketTask *debugWebSocketTask;  // ← REMOVE
@property NSTimer *debugHeartbeatTimer;                   // ← REMOVE
- (void)connectToDebugServer;                             // ← REMOVE
- (void)sendDebugHeartbeat;                               // ← REMOVE
```

**Keep in AppDelegate.m:**
- Menu bar UI
- Settings window (now shows service status)
- Service control (start/stop buttons)

#### 3.2 Create GUI Bridge Server

New component - receives proxied requests from service:

```objc
// GUIBridgeServer.m - HTTP server on port 3457
@interface GUIBridgeServer : NSObject

- (void)startOnPort:(NSInteger)port;
- (void)stop;

// Tool handlers (called by service via HTTP)
- (NSDictionary *)handleScreenshot:(NSDictionary *)params;
- (NSDictionary *)handleClick:(NSDictionary *)params;
- (NSDictionary *)handleTypeText:(NSDictionary *)params;
- (NSDictionary *)handleGetClickableElements:(NSDictionary *)params;
- (NSDictionary *)handleAnalyzeWithOCR:(NSDictionary *)params;

@end
```

#### 3.3 Service Client

Helper for app to monitor service:

```objc
// ServiceClient.m
@interface ServiceClient : NSObject

+ (instancetype)sharedClient;
- (void)checkServiceStatus:(void(^)(BOOL running, NSString *status))completion;
- (void)getServiceHealth:(void(^)(NSDictionary *health))completion;

@end
```

#### 3.4 Update MCP Stdio Mode

StdioMCPBridge.m modifications:
```objc
// Route to appropriate handler
- (void)handleToolsCall:(NSString *)toolName params:(NSDictionary *)params {
    if ([self isServiceTool:toolName]) {
        // Shell, filesystem, system → route to service HTTP
        [self callService:toolName params:params completion:...];
    } else {
        // Screenshot, click, keyboard → execute locally
        [self executeGuiTool:toolName params:params];
    }
}
```

### Phase 4: Service Installation & Management

#### 4.1 Installer Script

```bash
#!/bin/bash
# install_service.sh

# Copy service binary
sudo mkdir -p /Library/PrivilegedHelperTools
sudo cp ScreenControlService /Library/PrivilegedHelperTools/com.screencontrol.service
sudo chmod 755 /Library/PrivilegedHelperTools/com.screencontrol.service
sudo chown root:wheel /Library/PrivilegedHelperTools/com.screencontrol.service

# Copy LaunchDaemon plist
sudo cp com.screencontrol.service.plist /Library/LaunchDaemons/
sudo chmod 644 /Library/LaunchDaemons/com.screencontrol.service.plist
sudo chown root:wheel /Library/LaunchDaemons/com.screencontrol.service.plist

# Create config directory
sudo mkdir -p "/Library/Application Support/ScreenControl"
sudo chmod 755 "/Library/Application Support/ScreenControl"

# Load service
sudo launchctl load /Library/LaunchDaemons/com.screencontrol.service.plist

echo "Service installed and started"
```

#### 4.2 Uninstaller Script

```bash
#!/bin/bash
# uninstall_service.sh

# Stop and unload service
sudo launchctl unload /Library/LaunchDaemons/com.screencontrol.service.plist

# Remove files
sudo rm /Library/LaunchDaemons/com.screencontrol.service.plist
sudo rm /Library/PrivilegedHelperTools/com.screencontrol.service

echo "Service uninstalled"
```

### Phase 5: Port Mapping & Communication

#### 5.1 Port Assignments

| Port | Component | Purpose | Binding |
|------|-----------|---------|---------|
| 3456 | Service HTTP Server | Main API (shell, fs, unlock) | 0.0.0.0 (or 127.0.0.1) |
| 3457 | App GUI Bridge Server | GUI operations proxy | 127.0.0.1 only |
| 3458 | App Test Server | Debug testing | 127.0.0.1 only |
| 3459 | App Browser WS Server | Browser extension | 127.0.0.1 only |

#### 5.2 Complete Request Flow

**Remote Command (via Control Server):**
```
screencontrol.knws.co.uk
         │
    [WebSocket]
         │
         ▼
ScreenControlService
         │
         ├─► shell_exec ──► fork/exec ──► result ──► WebSocket response
         │
         ├─► fs_read ──► C++ filesystem ──► result ──► WebSocket response
         │
         ├─► screenshot ──► HTTP to App:3457 ──► result ──► WebSocket response
         │
         └─► unlock ──► IOKit/CGSession ──► result ──► WebSocket response
```

**Local MCP (Claude Code):**
```
Claude Code
    │
  [stdio]
    │
    ▼
ScreenControl.app (StdioMCPBridge)
    │
    ├─► shell_exec ──► HTTP to Service:3456 ──► result ──► stdio response
    │
    ├─► fs_read ──► HTTP to Service:3456 ──► result ──► stdio response
    │
    └─► screenshot ──► Local execution ──► result ──► stdio response
```

### Phase 6: Testing Strategy

#### 6.1 Service Tests (Machine Can Be Locked)

- [ ] Service starts on boot
- [ ] WebSocket connects to control server
- [ ] Shell commands execute when machine locked
- [ ] File operations work when locked
- [ ] Machine unlock works
- [ ] Service survives app crash
- [ ] Service survives user logout

#### 6.2 App Tests (Machine Must Be Unlocked)

- [ ] GUI Bridge responds to service requests
- [ ] Screenshot works via proxy
- [ ] Click/keyboard work via proxy
- [ ] Menu bar shows correct service status
- [ ] MCP stdio routes correctly

#### 6.3 Integration Tests

- [ ] Full flow: Control server → Service → App → GUI op → Response
- [ ] Lock machine → Shell command via server → Success
- [ ] Lock machine → Unlock via server → Success
- [ ] Kill app → Service still connected → Restart app → GUI works

---

## File Changes Summary

### New Files (Cross-Platform Service)

The service lives in a **shared location** and builds for all three platforms:

```
service/                              ← NEW: Unified cross-platform service
├── CMakeLists.txt                    Cross-platform build (macOS/Windows/Linux)
├── README.md                         Build instructions for all platforms
│
├── src/
│   ├── core/                         100% SHARED
│   │   ├── websocket_client.cpp/h    OpenSSL WebSocket (all platforms)
│   │   ├── http_server.cpp/h         cpp-httplib (all platforms)
│   │   ├── stdio_bridge.cpp/h        MCP stdio mode
│   │   ├── command_router.cpp/h      Tool routing logic
│   │   ├── config.cpp/h              JSON config loading
│   │   └── logger.cpp/h              Logging + server relay
│   │
│   ├── tools/                        95% SHARED
│   │   ├── shell_tools.cpp/h         POSIX + Win32 (#ifdef)
│   │   ├── filesystem_tools.cpp/h    C++17 <filesystem> (100% shared)
│   │   └── system_tools.cpp/h        Mostly shared + platform bits
│   │
│   └── platform/                     PLATFORM-SPECIFIC
│       ├── macos/
│       │   ├── main_macos.cpp        Entry point + LaunchDaemon
│       │   ├── unlock_macos.cpp/h    IOKit/CGSession unlock
│       │   ├── power_macos.cpp/h     IOKit power management
│       │   └── keychain_macos.cpp/h  Keychain credential storage
│       │
│       ├── windows/
│       │   ├── main_windows.cpp      Entry point + SCM service
│       │   ├── unlock_windows.cpp/h  WTSApi unlock
│       │   ├── power_windows.cpp/h   Win32 power APIs
│       │   └── dpapi_windows.cpp/h   DPAPI credential storage
│       │
│       └── linux/
│           ├── main_linux.cpp        Entry point + systemd
│           ├── unlock_linux.cpp/h    D-Bus/PAM/logind unlock
│           ├── power_linux.cpp/h     systemd power APIs
│           └── secret_linux.cpp/h    libsecret credential storage
│
├── include/
│   ├── platform.h                    Platform detection macros
│   └── service.h                     Common service interface
│
├── libs/                             Header-only dependencies
│   ├── httplib.h                     cpp-httplib
│   └── json.hpp                      nlohmann/json
│
├── install/                          Platform installers
│   ├── macos/
│   │   ├── com.screencontrol.service.plist   LaunchDaemon config
│   │   ├── install.sh                        CLI installer
│   │   ├── uninstall.sh                      CLI uninstaller
│   │   ├── pkg/                              macOS .pkg installer
│   │   │   ├── build_pkg.sh                  Package builder script
│   │   │   ├── Distribution.xml              Installer UI definition
│   │   │   ├── component.plist               Component package config
│   │   │   ├── scripts/
│   │   │   │   ├── preinstall                Pre-install script
│   │   │   │   └── postinstall               Post-install (load service)
│   │   │   └── resources/
│   │   │       ├── welcome.html              Installer welcome text
│   │   │       ├── license.html              License agreement
│   │   │       └── conclusion.html           Post-install instructions
│   │   └── dmg/                              Optional DMG wrapper
│   │       └── build_dmg.sh                  DMG builder with app + pkg
│   │
│   ├── windows/
│   │   ├── install.bat                       CLI installer
│   │   ├── uninstall.bat                     CLI uninstaller
│   │   └── msi/                              Windows MSI installer (future)
│   │       └── ScreenControl.wxs             WiX installer definition
│   │
│   └── linux/
│       ├── screencontrol.service             systemd unit file
│       ├── install.sh                        CLI installer
│       ├── uninstall.sh                      CLI uninstaller
│       └── deb/                              Debian package (future)
│           └── DEBIAN/
│               ├── control
│               ├── postinst
│               └── prerm
│
└── build/                            Build outputs (gitignored)
    ├── macos/
    ├── windows/
    └── linux/
```

**Consolidating Existing Code:**

The existing `linux/` and `windows/ScreenControlService/` code will be **merged** into this unified structure:

| Current Location | New Location |
|------------------|--------------|
| `linux/tools/shell_tools.cpp` | `service/src/tools/shell_tools.cpp` |
| `linux/tools/filesystem_tools.cpp` | `service/src/tools/filesystem_tools.cpp` |
| `linux/control_server/websocket_client.cpp` | `service/src/core/websocket_client.cpp` |
| `linux/main.cpp` | `service/src/platform/linux/main_linux.cpp` |
| `windows/ScreenControlService/tools/*` | Merge into `service/src/tools/` |
| `windows/ScreenControlService/main.cpp` | `service/src/platform/windows/main_windows.cpp` |

**Build Commands:**

```bash
# macOS
cd service && mkdir build && cd build
cmake .. -DPLATFORM=macos
make

# Linux
cd service && mkdir build && cd build
cmake .. -DPLATFORM=linux
make

# Windows (Visual Studio)
cd service && mkdir build && cd build
cmake .. -G "Visual Studio 17 2022" -DPLATFORM=windows
cmake --build . --config Release
```

---

## macOS Installer Architecture (.pkg)

The macOS installer bundles both the **service** and **app** into a single signed, notarized .pkg file.

### Installer Contents

```
ScreenControl-1.0.0.pkg
├── ScreenControlService.pkg          Component: Service
│   └── Payload/
│       ├── Library/
│       │   ├── PrivilegedHelperTools/
│       │   │   └── com.screencontrol.service    Service binary
│       │   └── LaunchDaemons/
│       │       └── com.screencontrol.service.plist
│       └── Library/Application Support/ScreenControl/
│           └── config.json                       Default config
│
├── ScreenControlApp.pkg              Component: Menu Bar App
│   └── Payload/
│       └── Applications/
│           └── ScreenControl.app                 Menu bar app
│
└── Distribution.xml                  Installer definition
    ├── Welcome, License, Conclusion screens
    ├── Component choices (can install service-only or both)
    └── System requirements (macOS 12.0+)
```

### Build Process

```bash
#!/bin/bash
# build_pkg.sh

VERSION="1.0.0"
IDENTITY="Developer ID Installer: Your Name (TEAMID)"

# 1. Build service (from unified service/ directory)
cd service && mkdir -p build/macos && cd build/macos
cmake ../.. -DPLATFORM=macos
make
cd ../../..

# 2. Build app (Xcode)
xcodebuild -project macos/ScreenControl.xcodeproj \
           -scheme ScreenControl \
           -configuration Release \
           CONFIGURATION_BUILD_DIR=build/macos

# 3. Create component packages
pkgbuild --root build/macos/service-payload \
         --identifier com.screencontrol.service \
         --version $VERSION \
         --scripts service/install/macos/pkg/scripts \
         --install-location / \
         build/ScreenControlService.pkg

pkgbuild --root build/macos/app-payload \
         --identifier com.screencontrol.app \
         --version $VERSION \
         --install-location /Applications \
         build/ScreenControlApp.pkg

# 4. Create product archive (combines components)
productbuild --distribution service/install/macos/pkg/Distribution.xml \
             --resources service/install/macos/pkg/resources \
             --package-path build \
             --sign "$IDENTITY" \
             build/ScreenControl-$VERSION.pkg

# 5. Notarize with Apple
xcrun notarytool submit build/ScreenControl-$VERSION.pkg \
      --apple-id "you@email.com" \
      --password "@keychain:AC_PASSWORD" \
      --team-id "TEAMID" \
      --wait

# 6. Staple notarization ticket
xcrun stapler staple build/ScreenControl-$VERSION.pkg

echo "Done: build/ScreenControl-$VERSION.pkg"
```

### Distribution.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>ScreenControl</title>
    <organization>com.screencontrol</organization>
    <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>

    <!-- Minimum macOS version -->
    <os-requirement>
        <os-version min="12.0"/>
    </os-requirement>

    <!-- Welcome, License, Conclusion -->
    <welcome file="welcome.html"/>
    <license file="license.html"/>
    <conclusion file="conclusion.html"/>

    <!-- Installation choices -->
    <choices-outline>
        <line choice="service"/>
        <line choice="app"/>
    </choices-outline>

    <choice id="service" title="ScreenControl Service"
            description="Always-on background service (required)">
        <pkg-ref id="com.screencontrol.service"/>
    </choice>

    <choice id="app" title="ScreenControl Menu Bar App"
            description="Menu bar app for GUI operations (recommended)">
        <pkg-ref id="com.screencontrol.app"/>
    </choice>

    <pkg-ref id="com.screencontrol.service">ScreenControlService.pkg</pkg-ref>
    <pkg-ref id="com.screencontrol.app">ScreenControlApp.pkg</pkg-ref>
</installer-gui-script>
```

### Post-Install Script

```bash
#!/bin/bash
# postinstall - runs after files are copied

# Load the LaunchDaemon (starts service immediately)
launchctl load /Library/LaunchDaemons/com.screencontrol.service.plist

# Register app to start at login for current user (optional)
CURRENT_USER=$(stat -f "%Su" /dev/console)
if [ -n "$CURRENT_USER" ]; then
    sudo -u "$CURRENT_USER" osascript -e '
        tell application "System Events"
            make login item at end with properties {path:"/Applications/ScreenControl.app", hidden:false}
        end tell
    '
fi

# Set permissions
chmod 755 /Library/PrivilegedHelperTools/com.screencontrol.service
chown root:wheel /Library/PrivilegedHelperTools/com.screencontrol.service
chown root:wheel /Library/LaunchDaemons/com.screencontrol.service.plist

exit 0
```

### Pre-Install Script

```bash
#!/bin/bash
# preinstall - runs before files are copied

# Stop existing service if running
if launchctl list | grep -q "com.screencontrol.service"; then
    launchctl unload /Library/LaunchDaemons/com.screencontrol.service.plist 2>/dev/null
fi

# Quit existing app if running
osascript -e 'quit app "ScreenControl"' 2>/dev/null

exit 0
```

### Code Signing Requirements

For distribution outside the App Store:

| Item | Certificate | Notes |
|------|-------------|-------|
| Service binary | Developer ID Application | Signed + hardened runtime |
| App bundle | Developer ID Application | Signed + hardened runtime |
| .pkg installer | Developer ID Installer | Different cert than app |
| Notarization | Apple notary service | Required for Gatekeeper |

```bash
# Sign service binary
codesign --force --options runtime \
         --sign "Developer ID Application: Name (TEAMID)" \
         --timestamp \
         build/macos/com.screencontrol.service

# Sign app
codesign --force --options runtime --deep \
         --sign "Developer ID Application: Name (TEAMID)" \
         --timestamp \
         build/macos/ScreenControl.app

# Sign pkg (done in productbuild --sign)
```

---

**Legacy Directory Migration:**

After consolidation, the old platform-specific directories become deprecated:

| Old Location | Status | Action |
|--------------|--------|--------|
| `linux/` | Deprecated | Archive to `old/`, then remove |
| `windows/ScreenControlService/` | Deprecated | Archive to `old/`, then remove |
| `windows/ScreenControlTray/` | Keep | Tray app remains platform-specific |
| `macos/ScreenControl/` | Keep | Menu bar app remains platform-specific |

**Final Repository Structure:**

```
screen_control/
├── service/                    ← Cross-platform service (macOS/Win/Linux)
├── macos/ScreenControl/        ← macOS menu bar app (Objective-C)
├── windows/ScreenControlTray/  ← Windows tray app (C#)
├── linux/                      ← Linux tray app (if needed, GTK)
├── web/                        ← Control server (Next.js)
├── browser-extension/          ← Browser extensions
└── old/                        ← Archived legacy code
```

### Modified Files (App)

```
macos/ScreenControl/
├── AppDelegate.m                   REMOVE: WebSocket to server
│                                   ADD: Service status monitoring
├── GUIBridgeServer.m/h             NEW - GUI operations HTTP server (:3457)
├── ServiceClient.m/h               NEW - Service communication (localhost:3456)
├── LocalLLMBridge.m/h              NEW - Local LLM connection (master mode)
├── StdioMCPBridge.m               Route: GUI local, shell/fs to service
│                                   Support remote agent prefixes
└── RemoteAgentRouter.m/h           NEW - Detect prefix, relay via service
```

### Archived Files

```
old/
└── macos-all-in-one-legacy-YYYYMMDD.tar.gz
    └── macos/ScreenControl/        Complete legacy app
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Code signing for LaunchDaemon | Use proper Developer ID, or unsigned for dev |
| SIP restrictions | Service binary in /Library/PrivilegedHelperTools |
| Accessibility for unlock | May need user to grant System Events permission once |
| TCC permissions | Service may need Full Disk Access for some operations |
| Two processes coordination | Robust HTTP retry logic, health checks |
| App not running for GUI ops | Return clear error: "GUI unavailable - machine locked" |

---

## Success Criteria

1. **Single relay works**: Service is ONLY thing talking to control server
2. **Service runs independently**: Survives machine lock, user logout
3. **Machine unlock works**: Can unlock machine via control server
4. **Shell commands persist**: Execute commands when machine locked
5. **File operations work**: Read/write files when locked
6. **GUI proxy works**: Screenshot/click via service when app available
7. **MCP stdio works**: Claude Code still functions (via app OR service)
8. **Bidirectional relay works**: Outbound commands route through service to server
9. **Master mode works**: Local LLM can control other agents via prefixed tools
10. **Legacy archived**: Old code preserved on branch

---

## Task Checklist

### Phase 0: Archive
- [ ] Create `old/` directory
- [ ] Archive current macOS app to tarball
- [ ] Create and push archive branch

### Phase 1: Cross-Platform Service Infrastructure
- [ ] Create `service/` directory structure (unified for all platforms)
- [ ] Set up CMake build with platform detection
- [ ] Create `include/platform.h` with platform macros
- [ ] Consolidate existing Linux code into `service/src/`
- [ ] Consolidate existing Windows code into `service/src/`
- [ ] Create `service/src/platform/macos/main_macos.cpp`
- [ ] Create LaunchDaemon plist in `service/install/macos/`

### Phase 2: Shared Core (Consolidate & Extend)
- [ ] Merge websocket_client from Linux/Windows → `service/src/core/`
- [ ] Merge http_server from Linux/Windows → `service/src/core/`
- [ ] Merge shell_tools (unify POSIX + Win32 with #ifdef)
- [ ] Merge filesystem_tools (already C++17, 100% portable)
- [ ] Merge system_tools (unify with platform #ifdef)
- [ ] Add command_router.cpp (tool routing logic)
- [ ] Add stdio_bridge.cpp (MCP stdio mode)
- [ ] Add logger.cpp with server relay
- [ ] Add GUI proxy logic (inbound: server → app)
- [ ] Add relay endpoint (outbound: app → server → other agents)

### Phase 2b: macOS Platform-Specific
- [ ] Create unlock_macos.cpp (IOKit/CGSession)
- [ ] Create power_macos.cpp (IOKit power management)
- [ ] Create keychain_macos.cpp (credential storage)
- [ ] Test macOS service build and installation

### Phase 3: App Modifications
- [ ] Remove WebSocket from AppDelegate
- [ ] Create GUIBridgeServer (receives proxied GUI ops from service)
- [ ] Create ServiceClient (talks to service HTTP API)
- [ ] Update StdioMCPBridge routing (GUI local, shell/fs to service)
- [ ] Create LocalLLMBridge (master mode - stdio/SSE/HTTP to local LLM)
- [ ] Implement remote agent routing (detect prefix, relay via service)
- [ ] Update UI for service status

### Phase 4: Platform Installers

**macOS .pkg Installer (Service + App bundle):**
- [ ] Create `service/install/macos/pkg/` structure
- [ ] Write `Distribution.xml` (installer UI, choices)
- [ ] Write `preinstall` script (stop existing service if running)
- [ ] Write `postinstall` script (load LaunchDaemon, register app)
- [ ] Create installer resources (welcome, license, conclusion HTML)
- [ ] Write `build_pkg.sh` using `pkgbuild` + `productbuild`
- [ ] Sign pkg with Developer ID Installer certificate
- [ ] Notarize pkg with Apple (required for Gatekeeper)
- [ ] Optional: Create DMG wrapper with drag-to-install for app

**Windows Installer:**
- [ ] Update existing install.bat for unified service
- [ ] Test service registration with SCM

**Linux Installer:**
- [ ] Update existing install.sh for unified service
- [ ] Test systemd service registration

### Phase 5: Testing
- [ ] Service isolation tests (survives app crash, user logout)
- [ ] Lock/unlock cycle tests
- [ ] Inbound command tests (server → service → execute)
- [ ] Outbound relay tests (app → service → server → other agent)
- [ ] Service stdio tests (headless MCP mode)
- [ ] App stdio tests (Claude Code integration)
- [ ] Master mode tests (local LLM → control other agents)
- [ ] Full integration tests

---

## Reference: Code to Reuse

### From Linux (`linux/`)
- `main.cpp` - Service startup pattern, signal handling
- `tools/shell_tools.cpp` - fork/exec (POSIX, works on macOS)
- `tools/filesystem_tools.cpp` - C++17 filesystem (cross-platform)
- `server/http_server.cpp` - cpp-httplib usage
- `control_server/websocket_client.cpp` - OpenSSL WebSocket

### From Windows (`windows/ScreenControlService/`)
- Proxy pattern for GUI operations
- Service lifecycle management
- Tool routing logic

---

## Next Steps

1. **Approve this plan**
2. **Phase 0**: Archive legacy code, create branch
3. **Phase 1**: Create service project structure
4. **Phase 2**: Port tools from Linux, implement WebSocket client
5. **Phase 3**: Modify app, create GUI Bridge
6. **Phase 4**: Installation scripts
7. **Phase 5**: Testing
8. **Deploy**: Replace old architecture
