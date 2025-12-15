# ScreenControl

**Native macOS agent for AI-powered desktop and browser automation via MCP (Model Context Protocol).**

## Overview

ScreenControl enables AI assistants (Claude, etc.) to control your Mac through:
- **Desktop automation**: Screenshots, mouse, keyboard, window management
- **Browser automation**: Read/interact with any tab by URL without switching (Playwright-like)
- **Filesystem & shell**: Full file system access and command execution

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code / Claude Desktop                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ stdio (MCP protocol)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ScreenControl.app --mcp-stdio                 │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Desktop Tools   │  │ Browser Tools   │  │ Filesystem/Shell│  │
│  │ (Accessibility) │  │ (WebSocket:3457)│  │                 │  │
│  └─────────────────┘  └────────┬────────┘  └─────────────────┘  │
└────────────────────────────────┼────────────────────────────────┘
                                 │ WebSocket
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Extension                              │
│                    (Firefox / Chrome / Safari)                    │
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

### Desktop Automation

| Tool | Description |
|------|-------------|
| `desktop_screenshot` | Take screenshots |
| `mouse_click` | Click at coordinates |
| `mouse_move` | Move mouse |
| `keyboard_type` | Type text |
| `keyboard_press` | Press keys |
| `window_focus` | Focus windows |
| `app_launch` | Launch applications |

### Browser Automation

| Tool | Description |
|------|-------------|
| `browser_getVisibleText` | Get text from any tab by URL |
| `browser_clickElement` | Click elements |
| `browser_fillElement` | Fill form fields |
| `browser_navigate` | Navigate to URL |
| `browser_screenshot` | Screenshot page |
| `browser_getTabs` | List open tabs |
| `browser_executeScript` | Run JavaScript |

### Filesystem & Shell

| Tool | Description |
|------|-------------|
| `fs_list` | List directory contents |
| `fs_read` | Read file contents |
| `fs_write` | Write files |
| `fs_search` | Search files by pattern |
| `shell_exec` | Execute commands |

## Running Modes

### 1. MCP stdio Mode (for AI clients)

```bash
/path/to/ScreenControl.app/Contents/MacOS/ScreenControl --mcp-stdio
```

This is what Claude Code launches. The app runs headless and communicates via stdin/stdout.

### 2. GUI Mode (for manual use)

```bash
open /path/to/ScreenControl.app
```

Runs as a menu bar app with status display and settings.

## Ports

| Port | Purpose |
|------|---------|
| 3456 | HTTP API (localhost only) |
| 3457 | WebSocket for browser extension |

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

## Legacy Node.js Proxy (Deprecated)

Previous versions used a Node.js proxy (`screencontrol-mcp.js`). This is now **obsolete** - the native app handles MCP stdio directly.

Old files are preserved in the `old/` directory for reference.

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
│       ├── AppDelegate.m   # Main app logic, tool definitions
│       ├── StdioMCPBridge.m # MCP stdio transport
│       └── BrowserWebSocketServer.m
├── extension/              # Browser extensions
│   ├── firefox/
│   ├── chrome/
│   ├── safari/
│   └── shared/
└── old/                    # Deprecated Node.js code
```

## License

MIT License

## Links

- **GitHub**: [github.com/datagram1/mcp-eyes](https://github.com/datagram1/mcp-eyes)
