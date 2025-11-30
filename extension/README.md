# MCP Eyes Browser Extension

Browser extension that enables LLM-driven web automation with mcp_eyes.

## Overview

This extension bridges the gap between mcp_eyes (MCP server) and your web browser, allowing AI assistants to:

- **See the page**: Get all interactive elements (buttons, links, inputs) with their screen coordinates
- **Control naturally**: Move mouse and click at specific coordinates (appears human-like)
- **Control silently**: Inject JavaScript clicks/fills directly (faster, for non-bot-detection sites)
- **Read page content**: Extract text, form data, and page structure

## Supported Browsers

| Browser | Manifest Version | Status |
|---------|------------------|--------|
| Chrome | MV3 | Supported |
| Firefox | MV2 | Supported |
| Edge | MV3 (Chrome) | Supported (use Chrome extension) |
| Safari | AppleScript | Supported (no extension needed!) |

## Installation

### 1. Install the Extension

**Chrome/Edge:**
1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/chrome` folder

**Firefox:**
1. Open `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `extension/firefox/manifest.json`

### 2. Install the Native Messaging Host

The native messaging host allows the extension to communicate with mcp_eyes.

```bash
cd extension/native-host
./install.sh all <chrome-extension-id>
```

For Chrome, you'll need the extension ID (shown in `chrome://extensions` after loading).

For Firefox only:
```bash
./install.sh firefox
```

### 3. Verify Installation

The extension should now be connected. You can verify by checking the browser console for:
```
[MCP Eyes] Content script loaded
[MCP Eyes] Connected to native host
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Eyes Server                            │
│  (Your AI assistant communicates via MCP protocol)              │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Unix Socket / File Queue
┌─────────────────────────▼───────────────────────────────────────┐
│                  Native Messaging Host                           │
│  (mcp-eyes-bridge.js - translates between MCP and extension)   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Native Messaging (stdin/stdout JSON)
┌─────────────────────────▼───────────────────────────────────────┐
│                  Browser Extension                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Background  │◄─┤   Content   │◄─┤   Injected Script       │ │
│  │   Script    │  │   Script    │  │   (Page Context)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                      Web Page                                    │
│  (DOM, interactive elements, forms, etc.)                       │
└─────────────────────────────────────────────────────────────────┘
```

### Two Modes of Operation

**Natural Mode** (Default for bot-detection sites):
1. Extension reports element screen coordinates
2. mcp_eyes moves the actual mouse cursor to that position
3. mcp_eyes performs a real mouse click
4. Appears completely human to the website

**Silent Mode** (Fast automation):
1. Extension receives click/fill command
2. JavaScript is injected to perform the action
3. Faster but may trigger bot detection on some sites

## Available Tools

When using mcp_eyes with this extension, you get these tools:

| Tool | Description |
|------|-------------|
| `browser_getPageContext` | Get all interactive elements with screen coordinates |
| `browser_getInteractiveElements` | List clickable elements (buttons, links, inputs) |
| `browser_clickElement` | Click an element (silent mode) |
| `browser_fillInput` | Fill a text input (silent mode) |
| `browser_scroll` | Scroll the page |
| `browser_executeScript` | Run custom JavaScript |
| `browser_findClickTarget` | Find element by text, get coordinates for natural clicking |
| `browser_getTabs` | List all open browser tabs |

## Example Usage

### Natural Mode (Recommended)
```
User: "Add the blue widget to my cart on the current page"

AI uses: browser_findClickTarget(text: "Add to Cart")
→ Returns: screenRect: { centerX: 845, centerY: 412 }

AI uses: moveMouse(x: 0.845, y: 0.412)  // mcp_eyes moves real mouse
AI uses: click()                         // Real mouse click
```

### Silent Mode (Fast)
```
User: "Click the submit button"

AI uses: browser_clickElement(selector: "#submit-btn")
→ JavaScript click() is injected
```

## Troubleshooting

### Extension not connecting

1. Check that the native messaging host is installed:
   ```bash
   ls ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/  # Firefox
   ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/  # Chrome
   ```

2. Verify the manifest points to the correct script path

3. Check browser console for errors

### "Native host has exited" error

The native messaging host script may have an error. Check the log:
```bash
export MCP_EYES_DEBUG=1
cat /tmp/mcp-eyes-bridge.log
```

### Safari not working

Safari uses AppleScript instead of an extension. Make sure:
1. Safari > Develop > Allow JavaScript from Apple Events is enabled
2. mcp_eyes has accessibility permissions

## Development

### Debugging

Enable debug logging:
```bash
export MCP_EYES_DEBUG=1
```

View extension console:
- Chrome: Right-click extension icon → Inspect popup, or go to `chrome://extensions` and click "service worker"
- Firefox: `about:debugging` → This Firefox → Inspect

### Building

The extension doesn't require a build step - it's vanilla JavaScript. Just edit the files in `shared/` and copy to `chrome/` and `firefox/`:

```bash
cp shared/*.js chrome/
cp shared/*.js firefox/
```

## Security Notes

- The extension has access to all web pages (`<all_urls>` permission)
- It can execute arbitrary JavaScript in page contexts
- Native messaging only works with the registered mcp_eyes host
- Don't use this for automation on sites where such automation is prohibited
