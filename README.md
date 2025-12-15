# ScreenControl

**Cross-platform agents for AI-powered desktop and browser automation via MCP (Model Context Protocol).**

Supports **macOS**, **Linux** (x86_64 & ARM64), with Windows coming soon.

## Overview

ScreenControl enables AI assistants (Claude, etc.) to control your computer through:
- **Desktop automation**: Screenshots, mouse, keyboard, window management
- **System tools**: System info, window list, clipboard access
- **Browser automation**: Read/interact with any tab by URL without switching (Playwright-like)
- **Filesystem & shell**: Full file system access and command execution

Supports both **local** (Claude Code/Desktop via stdio) and **remote** (Claude Web via control server) access.

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Fully supported | Native Objective-C app |
| Linux (x86_64) | Fully supported | Native C++ agent, X11/Wayland |
| Linux (ARM64) | Fully supported | Tested on Ubuntu 24.04 ARM |
| Windows | Coming soon | In development |

## Architecture

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
│                    ScreenControl.app (GUI mode)                 │
│                    - Connects to control server                 │
│                    - Advertises 91 tools dynamically            │
│                    - Executes tool calls locally                │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Build the macOS App

```bash
cd macos
xcodebuild -project ScreenControl.xcodeproj -scheme ScreenControl -configuration Debug build
```

### 2. Install Browser Extension

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `extension/firefox/manifest.json`

**Chrome/Edge:**
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/chrome`

### 3. Configure Claude Code / Claude Desktop

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

**Example with Xcode DerivedData path:**
```json
{
  "mcpServers": {
    "screencontrol": {
      "command": "/Users/yourname/Library/Developer/Xcode/DerivedData/ScreenControl-xxx/Build/Products/Debug/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}
```

### 4. Restart Claude Code

After updating the config, restart Claude Code to load the MCP server.

## Linux Quick Start

### One-Line Install

```bash
curl -fsSL https://raw.githubusercontent.com/datagram1/mcp-eyes/main/linux/install.sh | sudo bash
```

### Manual Build

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt install build-essential cmake pkg-config \
    libx11-dev libxext-dev libxtst-dev libxrandr-dev libgtk-3-dev xclip grim

# Build
cd linux/screencontrol
mkdir build && cd build
cmake .. -DBUILD_GUI=ON
make -j$(nproc)

# Install
sudo cp screencontrol /usr/local/bin/
```

### Configure & Run

```bash
# Create config
sudo mkdir -p /etc/screencontrol
sudo nano /etc/screencontrol/debug-config.json
# Add your control server details (see docs/linux_agent_docs.md)

# Run as service
sudo systemctl start screencontrol-agent
sudo systemctl enable screencontrol-agent
```

See [Linux Agent Documentation](docs/linux_agent_docs.md) for full details.

## Available Tools (91 total)

### Desktop Automation

| Tool | Description |
|------|-------------|
| `screenshot` / `desktop_screenshot` | Take screenshots (`return_base64: true` for image data) |
| `screenshot_app` | Screenshot specific app (`return_base64: true` for image data) |
| `click` / `click_absolute` | Click at coordinates |
| `doubleClick` | Double-click at coordinates |
| `moveMouse` | Move mouse cursor |
| `drag` | Drag from one position to another |
| `scroll` / `scrollMouse` | Scroll the mouse wheel |
| `typeText` | Type text |
| `pressKey` | Press keyboard keys |
| `getClickableElements` | Get clickable UI elements |
| `getUIElements` | Get all UI elements |
| `getMousePosition` | Get current mouse position |
| `analyzeWithOCR` | Analyze screen with OCR |

### Application Management

| Tool | Description |
|------|-------------|
| `listApplications` | List running applications |
| `focusApplication` | Focus an application window |
| `launchApplication` | Launch an application |
| `closeApp` | Close an application |
| `checkPermissions` | Check accessibility permissions |

### System Tools

| Tool | Description |
|------|-------------|
| `system_info` | Get system information (OS, CPU, memory, hostname, uptime) |
| `window_list` | List all open windows with app, title, and bounds |
| `clipboard_read` | Read text from system clipboard |
| `clipboard_write` | Write text to system clipboard |
| `wait` | Wait for specified milliseconds |

### Browser Automation

| Tool | Description |
|------|-------------|
| `browser_getVisibleText` | Get text from any tab by URL |
| `browser_searchVisibleText` | Search text in any tab |
| `browser_clickElement` | Click elements by selector or index |
| `browser_fillElement` | Fill form fields |
| `browser_navigate` | Navigate to URL |
| `browser_screenshot` | Screenshot page (`return_base64: true` for image data) |
| `browser_getTabs` | List open tabs |
| `browser_getActiveTab` | Get active tab info |
| `browser_focusTab` | Focus a specific tab |
| `browser_createTab` | Create new tab |
| `browser_closeTab` | Close a tab |
| `browser_getInteractiveElements` | Get elements (`verbose: true` for full list) |
| `browser_executeScript` | Run JavaScript |
| `browser_go_back` / `browser_go_forward` | Browser history navigation |

### Filesystem Tools

| Tool | Description |
|------|-------------|
| `fs_list` | List directory contents |
| `fs_read` | Read file contents |
| `fs_read_range` | Read specific line range |
| `fs_write` | Write files |
| `fs_delete` | Delete files/directories |
| `fs_move` | Move/rename files |
| `fs_search` | Search files by pattern |
| `fs_grep` | Search file contents |
| `fs_patch` | Apply patches to files |

### Shell Tools

| Tool | Description |
|------|-------------|
| `shell_exec` | Execute shell commands |
| `shell_start_session` | Start interactive shell session |
| `shell_send_input` | Send input to shell session |
| `shell_read_output` | Read shell session output |
| `shell_end_session` | End shell session |

## Key Features

### URL-Based Tab Targeting (Playwright-like)

Browser tools support targeting any open tab by URL **without switching tabs**:

```
"Get the text from the tab at https://example.com"
```

The AI will call:
```json
{
  "name": "browser_getVisibleText",
  "arguments": {
    "url": "https://example.com"
  }
}
```

This extracts content from the matching tab without disturbing your active tab.

**Supported tools with URL targeting:**
- `browser_getVisibleText` - Read text from any tab
- `browser_searchVisibleText` - Search text in any tab
- `browser_getUIElements` - Get interactive elements from any tab
- `browser_clickElement` - Click elements in any tab
- `browser_fillElement` - Fill forms in any tab

### Token-Safe Responses

Large MCP tool responses (screenshots, element lists) can consume significant context tokens. ScreenControl implements token-safe defaults with optional full data retrieval.

#### Screenshots

By default, screenshots are saved to `/tmp` as JPEG files and return a file path (~100 tokens). Claude Code can use the `Read` tool to view the image when needed.

| Parameter | Values | Description |
|-----------|--------|-------------|
| `format` | `jpeg` (default), `png` | Image format. JPEG is smaller (~60-80% reduction), PNG is lossless |
| `return_base64` | `false` (default), `true` | Return base64 instead of file path |

| Mode | Response | Token Usage | Compatibility |
|------|----------|-------------|---------------|
| Default | File path in `/tmp` | ~100 tokens | Claude Code (use Read tool) |
| `return_base64: true` | MCP ImageContent | ~8-25k tokens | Claude Code + Claude Desktop/Web |

**Example - Token-safe (default, JPEG):**
```json
{
  "file_path": "/tmp/screenshot_browser_1734567890.jpg",
  "format": "jpg",
  "size_bytes": 85432,
  "message": "Screenshot saved to file. Use the Read tool to view the image."
}
```

**Example - Full image data for Claude Desktop/Web:**
```json
// Tool call with return_base64: true
// Returns MCP ImageContent format:
{
  "type": "image",
  "data": "iVBORw0KGgo...",
  "mimeType": "image/jpeg"
}
```

#### Interactive Elements

By default, element lists return a summary with counts and key elements (~1k tokens). Use `verbose: true` for full details when needed.

| Parameter | Response | Token Usage |
|-----------|----------|-------------|
| Default | Summary with counts + key elements | ~1k tokens |
| `verbose: true` | Full element list | ~10k+ tokens |

## Running Modes

### 1. MCP stdio Mode (for Claude Code/Desktop)

```bash
/path/to/ScreenControl.app/Contents/MacOS/ScreenControl --mcp-stdio
```

This is what Claude Code launches. The app runs headless and communicates via stdin/stdout.

### 2. GUI Mode (for manual use and remote access)

```bash
open /path/to/ScreenControl.app
```

Runs as a menu bar app with status display and settings. In GUI mode, the app can also connect to a remote control server for Claude Web access.

## Control Server (web/)

The `web/` directory contains the Next.js control server that enables Claude Web to access ScreenControl agents remotely.

### Features

- **Agent Registry**: Manages connected ScreenControl agents
- **Dynamic Tool Discovery**: Agents advertise their tools; server caches and routes calls
- **MCP over SSE/HTTP**: Exposes tools to Claude Web via Server-Sent Events
- **OAuth Authentication**: Secure access control
- **Multi-Agent Support**: Route commands to specific agents by ID

### Server Architecture

```
web/
├── src/
│   ├── app/
│   │   ├── api/              # REST API endpoints
│   │   └── mcp/[uuid]/       # MCP endpoint per agent
│   └── lib/
│       ├── control-server/   # Agent registry, WebSocket handler
│       └── oauth/            # Authentication
├── prisma/                   # Database schema
└── package.json
```

### Deploying the Control Server

```bash
cd web
npm install
npm run build
npm start
```

The server listens for:
- Agent WebSocket connections (agents connect from ScreenControl.app GUI)
- MCP SSE connections (Claude Web connects via MCP protocol)

## Ports

| Port | Purpose |
|------|---------|
| 3456 | HTTP API (localhost only, local mode) |
| 3457 | WebSocket for browser extension |
| 3000 | Control server (remote mode) |

## macOS Permissions

Grant these permissions to ScreenControl.app (or Claude Code if running via stdio):

1. **Screen Recording**: System Preferences → Privacy → Screen Recording
2. **Accessibility**: System Preferences → Privacy → Accessibility

## Troubleshooting

### Browser extension not connecting
- Ensure ScreenControl is running
- Check that extension is loaded and enabled
- Refresh browser tabs after installing extension

### Permission errors
- Grant Screen Recording permission
- Grant Accessibility permission
- Restart the app after granting permissions

### MCP server not loading in Claude Code
- Verify the path in config.json is correct
- Check the app builds successfully
- Restart Claude Code after config changes

### Remote tools showing "Unknown tool"
- Ensure the agent advertises all expected tools (check server logs for tool count)
- Delete `~/Library/Application Support/ScreenControl/tools.json` to reset tool config
- Restart ScreenControl.app to re-advertise tools

## Development

### Building

```bash
cd macos
xcodebuild -project ScreenControl.xcodeproj -scheme ScreenControl -configuration Debug build
```

### Project Structure

```
screen_control/
├── macos/                  # Native macOS app (Objective-C)
│   └── ScreenControl/
│       ├── AppDelegate.m   # Main app logic, GUI mode tools
│       ├── StdioMCPBridge.m # MCP stdio transport, local mode tools
│       ├── MCPServer.m     # Core tool implementations
│       └── BrowserWebSocketServer.m
├── linux/                  # Native Linux agent (C++)
│   ├── screencontrol/
│   │   ├── main.cpp        # Entry point, WebSocket client
│   │   ├── server/         # HTTP API endpoints
│   │   └── tools/          # Tool implementations
│   ├── install.sh          # One-line installer script
│   └── README.md
├── extension/              # Browser extensions
│   ├── firefox/
│   ├── chrome/
│   ├── safari/
│   └── shared/
├── web/                    # Control server (Next.js)
│   ├── src/
│   │   ├── app/mcp/        # MCP endpoints
│   │   └── lib/control-server/
│   └── prisma/
├── docs/                   # Documentation
│   └── linux_agent_docs.md # Linux agent full documentation
└── old/                    # Deprecated Node.js code
```

## Recent Changes

### v1.1 (December 2024)

- **Linux agent released**: Native C++ agent with full headless and GUI support
- **ARM64 support**: Linux agent works on ARM64 (tested on Ubuntu 24.04 ARM)
- **One-line installer**: `curl | bash` installer for easy Linux deployment
- **X11 & Wayland**: Screenshot support for both display servers
- **15+ headless tools**: Filesystem, shell, system, clipboard tools work without display

### v1.0 (December 2024)

- **Added system tools**: `system_info`, `window_list`, `clipboard_read`, `clipboard_write`
- **Remote access**: Claude Web can now access all 91 tools via control server
- **Token-safe screenshots**: Default to file paths, optional base64 for Claude Web
- **Dynamic tool advertisement**: Agents advertise tools to server, eliminating version mismatches
- **URL-based tab targeting**: Playwright-like browser automation without tab switching

## License

MIT License

## Links

- **GitHub**: [github.com/datagram1/mcp-eyes](https://github.com/datagram1/mcp-eyes)
