# ScreenControl

**Cross-platform agents for AI-powered desktop and browser automation via MCP (Model Context Protocol).**

Supports **macOS**, **Linux** (x86_64 & ARM64), and **Windows**.

## Overview

ScreenControl enables AI assistants (Claude, etc.) to control your computer through:
- **Desktop automation**: Screenshots, mouse, keyboard, window management
- **System tools**: System info, window list, clipboard access
- **Browser automation**: Read/interact with any tab by URL without switching (Playwright-like)
- **Filesystem & shell**: Full file system access and command execution

Supports both **local** (Claude Code/Desktop via stdio) and **remote** (Claude Web via control server) access.

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Fully supported | Native Objective-C app with MCP stdio support |
| Linux (x86_64) | Fully supported | Cross-platform C++ service |
| Linux (ARM64) | Fully supported | Tested on Ubuntu 24.04 ARM |
| Windows | Beta | Cross-platform C++ service + .NET tray app |

## Architecture

### Cross-Platform Service Architecture

The project uses a **unified cross-platform C++ service** (`service/`) that compiles for Linux, Windows, and macOS. This service handles:
- HTTP REST API on port 3459 (localhost only)
- WebSocket connection to control server
- All non-GUI tools (filesystem, shell, system)
- GUI tool proxying to tray/desktop app

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ScreenControl Architecture                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────┐     ┌─────────────────────────────┐  │
│   │   ScreenControlService  │     │    GUI Application          │  │
│   │   (cross-platform C++)  │────▶│    (platform-specific)      │  │
│   │                         │     │                             │  │
│   │   - HTTP Server :3459   │     │   - GUI Bridge :3460        │  │
│   │   - WebSocket client    │     │   - Screenshot capture      │  │
│   │   - Filesystem tools    │     │   - Mouse/keyboard control  │  │
│   │   - Shell execution     │     │   - Window management       │  │
│   │   - System tools        │     │   - OCR analysis            │  │
│   └─────────────────────────┘     └─────────────────────────────┘  │
│              │                                                       │
│              │ WebSocket (wss://)                                   │
│              ▼                                                       │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │              ScreenControl Control Server                    │  │
│   │           (Cloud - receives commands from AI)                │  │
│   └─────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Local Mode (Claude Code / Claude Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code / Claude Desktop                 │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ stdio (MCP protocol)
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ScreenControl.app --mcp-stdio                │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Desktop Tools   │  │ Browser Tools   │  │ Filesystem/Shell│ │
│  │ (Accessibility) │  │ (WebSocket:3457)│  │                 │ │
│  └─────────────────┘  └────────┬────────┘  └─────────────────┘ │
└────────────────────────────────┼───────────────────────────────┘
                                 │ WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Extension                            │
│                    (Firefox / Chrome / Safari)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Remote Mode (Claude Web via Control Server)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude Web                              │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ MCP over SSE/HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Control Server (web/)                        │
│                    - Next.js application                        │
│                    - Agent registry & tool routing              │
│                    - OAuth authentication                       │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ WebSocket
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ScreenControl Agent                          │
│                    - Connects to control server                 │
│                    - Advertises tools dynamically               │
│                    - Executes tool calls locally                │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
screen_control/
├── service/                    # Cross-platform C++ service (Linux/Windows/macOS)
│   ├── CMakeLists.txt          # CMake build configuration
│   ├── src/
│   │   ├── core/               # Config, logging, security, crypto
│   │   ├── server/             # HTTP REST API server
│   │   ├── control_server/     # WebSocket client for control server
│   │   ├── tools/              # Tool implementations
│   │   │   ├── filesystem_tools.cpp  # fs_* tools
│   │   │   ├── shell_tools.cpp       # shell_* tools
│   │   │   └── system_tools.cpp      # system_* tools
│   │   ├── platform/           # Platform-specific code
│   │   │   ├── linux/          # Linux entry point
│   │   │   ├── macos/          # macOS entry point
│   │   │   └── windows/        # Windows entry point
│   │   └── libs/               # Header-only libraries (httplib, json)
│   └── install/                # Installation scripts per platform
│       ├── linux/
│       ├── macos/
│       └── windows/
│
├── macos/                      # Native macOS app (Objective-C)
│   └── ScreenControl/
│       ├── AppDelegate.m       # Main app, GUI mode
│       ├── StdioMCPBridge.m    # MCP stdio transport
│       └── ...
│
├── extension/                  # Browser extensions
│   ├── firefox/
│   ├── chrome/
│   └── safari/
│
├── web/                        # Control server (Next.js)
│   ├── src/
│   │   ├── app/mcp/            # MCP endpoints
│   │   └── lib/control-server/ # Agent registry, WebSocket
│   └── prisma/                 # Database schema
│
├── docs/                       # Documentation
│   ├── linux_agent_docs.md     # Full Linux agent documentation
│   └── windows_agent_install.md # Windows installation guide
│
└── old/                        # Deprecated code (archived)
```

## Quick Start

### macOS

#### Build
```bash
cd macos
xcodebuild -project ScreenControl.xcodeproj -scheme ScreenControl -configuration Debug build
```

#### Configure Claude Code
Add to `~/.config/claude-code/config.json`:
```json
{
  "mcpServers": {
    "screencontrol": {
      "command": "/path/to/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}
```

### Linux

#### One-Line Install
```bash
curl -fsSL https://raw.githubusercontent.com/anthropics/screen_control/main/service/install/linux/install.sh | sudo bash
```

#### Build from Source
```bash
# Install dependencies (Ubuntu/Debian)
sudo apt install build-essential cmake pkg-config libssl-dev

# Build
cd service
mkdir build && cd build
cmake ..
make -j$(nproc)

# Install
sudo cp bin/ScreenControlService /opt/screencontrol/
sudo cp ../install/linux/screencontrol.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now screencontrol
```

#### Configure
```bash
# Create config
sudo mkdir -p /etc/screencontrol
cat << 'EOF' | sudo tee /etc/screencontrol/config.json
{
  "httpPort": 3459,
  "controlServerUrl": "wss://your-control-server.com/ws",
  "agentName": "My Linux Agent"
}
EOF

# Restart service
sudo systemctl restart screencontrol
```

### Windows

#### Build
```bash
cd service
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022"
cmake --build . --config Release
```

#### Install
```bash
# Copy binary
copy build\bin\Release\ScreenControlService.exe C:\ScreenControl\

# Install as service (run as Administrator)
sc create ScreenControl binPath= "C:\ScreenControl\ScreenControlService.exe"
sc start ScreenControl
```

## API Reference

### Service Tools (Always Available)

These tools work in all modes (headless, GUI, local, remote):

#### System Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `system_info` | `GET /system/info` | System information (OS, CPU, memory, hostname) |
| `wait` | `POST /wait` | Wait for specified milliseconds |
| `clipboard_read` | `GET /clipboard/read` | Read from clipboard |
| `clipboard_write` | `POST /clipboard/write` | Write to clipboard |

#### Filesystem Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `fs_list` | `POST /fs/list` | List directory contents |
| `fs_read` | `POST /fs/read` | Read file contents |
| `fs_read_range` | `POST /fs/read_range` | Read specific line range (`start_line`, `end_line`) |
| `fs_write` | `POST /fs/write` | Write content to file |
| `fs_search` | `POST /fs/search` | Search files by glob pattern |
| `fs_grep` | `POST /fs/grep` | Search file contents with regex |
| `fs_delete` | `POST /fs/delete` | Delete files or directories |
| `fs_move` | `POST /fs/move` | Move or rename files |
| `fs_patch` | `POST /fs/patch` | Apply patches to files |

#### Shell Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `shell_exec` | `POST /shell/exec` | Execute shell commands |
| `shell_session_list` | `GET /shell/session/list` | List active shell sessions |
| `shell_session_start` | `POST /shell/session/start` | Start interactive shell session |
| `shell_session_input` | `POST /shell/session/input` | Send input to session (`session_id`) |
| `shell_session_read` | `POST /shell/session/read` | Read session output |
| `shell_session_stop` | `POST /shell/session/stop` | Stop shell session |

### GUI Tools (Require Desktop/Tray App)

These tools are proxied to the GUI application:

| Tool | Description |
|------|-------------|
| `screenshot` | Capture entire screen |
| `screenshot_app` | Capture specific application |
| `click` | Click at coordinates |
| `doubleClick` | Double-click at coordinates |
| `moveMouse` | Move mouse cursor |
| `drag` | Drag from one point to another |
| `scroll` | Scroll mouse wheel |
| `typeText` | Type text |
| `pressKey` | Press keyboard key |
| `getMousePosition` | Get cursor position |
| `listApplications` | List running applications |
| `focusApplication` | Focus an application |
| `launchApplication` | Launch an application |
| `closeApp` | Close an application |
| `window_list` | List open windows |
| `analyzeWithOCR` | Analyze screen with OCR |

### Browser Tools (Require Extension)

| Tool | Description |
|------|-------------|
| `browser_getVisibleText` | Get text from any tab by URL |
| `browser_searchVisibleText` | Search text in any tab |
| `browser_clickElement` | Click elements by selector |
| `browser_fillElement` | Fill form fields |
| `browser_navigate` | Navigate to URL |
| `browser_screenshot` | Screenshot page |
| `browser_getTabs` | List open tabs |
| `browser_getActiveTab` | Get active tab info |
| `browser_focusTab` | Focus a specific tab |
| `browser_createTab` | Create new tab |
| `browser_closeTab` | Close a tab |
| `browser_getInteractiveElements` | Get interactive elements |
| `browser_executeScript` | Run JavaScript |

## Ports

| Port | Purpose |
|------|---------|
| 3459 | HTTP API (service, localhost only) |
| 3460 | GUI Bridge (tray app, localhost only) |
| 3457 | Browser extension WebSocket |
| 3000 | Control server (web/) |

## macOS Permissions

Grant these permissions to ScreenControl.app:
1. **Screen Recording**: System Preferences → Privacy → Screen Recording
2. **Accessibility**: System Preferences → Privacy → Accessibility

## Troubleshooting

### Service won't start
```bash
# Check status
sudo systemctl status screencontrol

# View logs
sudo journalctl -u screencontrol -f

# Test manually
/opt/screencontrol/ScreenControlService -v
```

### GUI tools not working
```bash
# Check if tray app is running
curl http://localhost:3460/health

# Service will return error if tray unavailable
curl http://localhost:3459/screenshot
# Response: {"error": "Tray app unavailable"}
```

### MCP server not loading
- Verify path in config.json is correct
- Check app builds successfully
- Restart Claude Code after config changes

## Recent Changes

### v1.3 (December 2024)

- **Unified cross-platform service**: Single C++ codebase compiles for Linux, Windows, and macOS
- **Fixed fs_read_range**: Now supports both `start_line`/`end_line` and `startLine`/`endLine`
- **Fixed fs_grep**: Now handles single file paths, not just directories
- **Fixed shell sessions**: Sessions stay alive, support both `session_id` and `sessionId`
- **Added shell session list**: New `GET /shell/session/list` endpoint
- **Improved security**: Centralized command filtering or protected path blocking

### v1.2 (December 2024)

- **macOS sandbox disabled**: Filesystem tools work without restrictions
- **Windows beta release**: Tray app with WebSocket control server
- **Agent name display**: Dashboard shows friendly name or machine name
- **Dynamic tool refresh**: Real-time notifications when tool lists change

### v1.1 (December 2024)

- **Linux agent released**: Native C++ agent with headless and GUI support
- **ARM64 support**: Tested on Ubuntu 24.04 ARM
- **One-line installer**: Easy Linux deployment

### v1.0 (December 2024)

- **System tools**: `system_info`, `window_list`, `clipboard_read`, `clipboard_write`
- **Remote access**: Claude Web access via control server
- **Token-safe screenshots**: File paths by default, optional base64
- **URL-based tab targeting**: Playwright-like browser automation

## License

MIT License

## Links

- **GitHub**: [github.com/anthropics/screen_control](https://github.com/anthropics/screen_control)
