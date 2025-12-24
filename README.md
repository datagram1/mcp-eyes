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

**Multi-Instance Support**: Multiple Claude Code instances can share browser tools through a single GUI app.

```
┌─────────────────────────────────────────────────────────────────┐
│     Claude Code Instance 1        Claude Code Instance 2        │
│           ▼                              ▼                      │
│    StdioMCPBridge #1              StdioMCPBridge #2             │
│           │                              │                      │
│           └──────────────┬───────────────┘                      │
│                          │ HTTP POST :3457/command              │
│                          ▼                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              ScreenControl.app (GUI)                    │   │
│   │                                                         │   │
│   │  ┌─────────────────┐  ┌─────────────────────────────┐  │   │
│   │  │ Desktop Tools   │  │ BrowserWebSocketServer:3457 │  │   │
│   │  │ (Accessibility) │  │  - Accepts browser WS conn  │  │   │
│   │  │                 │  │  - Handles HTTP /command    │  │   │
│   │  └─────────────────┘  └─────────────┬───────────────┘  │   │
│   └─────────────────────────────────────┼───────────────────┘   │
│                                         │ WebSocket             │
│                                         ▼                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Browser Extension                    │   │
│   │                    (Firefox / Chrome / Safari)          │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- GUI app owns the browser WebSocket connection on port 3457
- Each Claude Code instance spawns its own `StdioMCPBridge` process
- StdioMCPBridge checks port 3457 for browser tool availability (not local port 3458)
- Browser commands are forwarded via HTTP POST to the GUI app
- All instances share the same browser extension connection

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
│   │   ├── update/             # Auto-update system
│   │   ├── tools/              # Tool implementations
│   │   │   ├── filesystem_tools.cpp  # fs_* tools
│   │   │   ├── shell_tools.cpp       # shell_* tools
│   │   │   └── system_tools.cpp      # system_* tools
│   │   ├── platform/           # Platform-specific code
│   │   │   ├── linux/          # Linux entry point
│   │   │   ├── macos/          # macOS entry point
│   │   │   └── windows/        # Windows entry point + Credential Provider
│   │   └── libs/               # Header-only libraries (httplib, json)
│   └── install/                # Installation scripts per platform
│       ├── linux/
│       ├── macos/
│       └── windows/
│
├── boot/                       # Rescue Boot USB system (Alpine Linux)
│   ├── Dockerfile              # Build environment
│   ├── build.sh                # Build script
│   └── build/build-iso.sh      # ISO generation
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
│   ├── claude_mcp_setup.md     # Claude Code MCP configuration guide
│   ├── linux_agent_docs.md     # Full Linux agent documentation
│   └── windows_agent_install.md # Windows installation guide
│
└── old/                        # Deprecated code (archived)
```

## Quick Start

### macOS

#### Option 1: Download Release
Download `ScreenControl.app` from [Releases](https://github.com/datagram1/screen_control/releases) and copy to `/Applications`.

#### Option 2: Build from Source
```bash
cd macos
xcodebuild -project ScreenControl.xcodeproj -scheme ScreenControl -configuration Release build

# Copy to Applications
cp -R ~/Library/Developer/Xcode/DerivedData/ScreenControl-*/Build/Products/Release/ScreenControl.app /Applications/

# Sign the app
codesign --force --deep --sign - /Applications/ScreenControl.app
```

#### Configure Claude Code

Add to `~/.claude.json` (global) or `.mcp.json` (project):
```json
{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}
```

#### Verify Setup
1. Run `/mcp` in Claude Code to check connection status
2. Should show 90 tools (39 without browser extension)

For detailed configuration options, see [docs/claude_mcp_setup.md](docs/claude_mcp_setup.md).

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

#### Windows-Specific Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `machine_lock` | `POST /machine/lock` | Lock the Windows workstation |
| `machine_unlock` | `POST /machine/unlock` | Unlock with credentials (requires Credential Provider) |

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

### v1.6 (December 2024)

- **Grid-Based Click Tools**: New visual interaction system for native apps and blocked websites
  - `screenshot_grid` - Takes screenshot with grid overlay (A-T columns, 1-15 rows) + OCR text detection
  - `click_grid` - Click by grid cell, element index, or text match with optional offset
  - `click_relative` - Click at pixel coordinates relative to window (auto-converts to absolute)
  - Window coordinate tracking - remembers window position from screenshot for accurate clicks
  - Multi-window support via `window_title` parameter for apps like Firefox with DevTools

- **Multi-Monitor Improvements**: Reliable clicking on secondary monitors
  - Always warp cursor before clicking for consistent behavior
  - Auto-focus window before click operations
  - Support for negative X coordinates (monitors to the left)
  - Case-insensitive app name matching for `focusApplication`

- **Comprehensive Tool Descriptions**: LLM-friendly documentation in tool schemas
  - Decision trees for choosing between similar tools
  - "WHEN TO USE" guidance for every tool
  - Categorized tools by function (screenshot, click, browser, filesystem, etc.)

- **iOS Simulator Support**: Tested workflow for controlling iOS apps
  - Toggle hardware keyboard (Cmd+K) to show software keyboard
  - Tap individual keys using `click_relative` with pixel coordinates
  - Works with any iOS app in Simulator

- **VNC-Style Screen Streaming**: Real-time screen viewing (control server)
  - Low-latency MJPEG streaming from agents to web dashboard
  - Configurable quality and frame rate
  - Multi-display support

See [docs/grid-tools.md](docs/grid-tools.md) for detailed grid tool documentation.

### v1.5 (December 2024)

- **Rescue Boot USB System**: Alpine Linux-based bootable rescue environment
  - Boot from USB to diagnose and repair broken operating systems
  - Filesystem support: ext4, NTFS, HFS+, FAT32, XFS, Btrfs, exFAT
  - Disk tools: parted, gdisk, smartctl, ddrescue, testdisk
  - Bootloader repair: GRUB, Windows BCD (chntpw), EFI boot manager
  - Automatic ScreenControl agent connection via token pairing
  - Build with Docker: `cd boot && ./build.sh`

- **Auto-Update System**: Agents can update themselves automatically
  - Configurable update channels: stable, beta, dev
  - Update modes: auto, download-only, manual, scheduled
  - Version checking and gradual rollout support
  - Dashboard control for per-agent update settings

- **Per-Agent Browser Preference**: Set default browser per agent
  - Configure preferred browser in agent settings (Chrome, Firefox, Safari, Edge)
  - Browser tools automatically target the configured browser
  - Synced from control server to agent on connection

- **Windows Lock/Unlock Tools**: Platform-specific machine control
  - `machine_lock` - Lock the Windows workstation
  - `machine_unlock` - Unlock with password (requires Credential Provider)
  - Tools only advertised on Windows agents

- **macOS .pkg Installer**: Signed installer package
  - Code-signed app and installer for macOS
  - CI/CD pipeline builds signed .pkg releases
  - Notarization support for Gatekeeper

- **Browser Targeting Improvements**:
  - Tools correctly routed based on target browser
  - Multi-browser support in single session

### v1.4 (December 2024)

- **Multi-instance browser tools**: Multiple Claude Code instances can now share browser tools
  - StdioMCPBridge checks GUI app on port 3457 for browser availability
  - Fixes issue where only first Claude Code instance saw browser_* tools
  - All instances share the same browser extension connection via GUI app
- **Improved architecture documentation**: Updated diagrams showing multi-instance flow

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

## Rescue Boot USB

ScreenControl includes an Alpine Linux-based bootable rescue system for diagnosing and repairing broken operating systems.

### Building the Rescue ISO

```bash
cd boot

# Build without pre-configured tenant (requires token pairing at boot)
./build.sh

# Build with pre-configured tenant
TENANT_ID=your-customer-id ./build.sh
```

### Rescue System Features

- **Filesystem Support**: ext4, NTFS, HFS+, FAT32, XFS, Btrfs, exFAT
- **Disk Tools**: parted, gdisk, smartctl, ddrescue, testdisk, chntpw
- **Auto-Connect**: Agent connects to ScreenControl server on boot
- **Token Pairing**: Run `screencontrol-pair <TOKEN>` to connect to your tenant

### Writing to USB

```bash
# Linux/macOS
sudo dd if=boot/dist/screencontrol-rescue-1.0.0-x86_64.iso of=/dev/sdX bs=4M status=progress

# Windows: Use Rufus or balenaEtcher
```

See [boot/README.md](boot/README.md) for full documentation.

## License

MIT License

## Links

- **GitHub**: [github.com/datagram1/screen_control](https://github.com/datagram1/screen_control)
