# ScreenControl Agent Tools Reference

This document provides a complete reference of all tools available in the ScreenControl agent.

## Overview

The ScreenControl agent provides **85+ tools** organized into four categories:
- **GUI Tools** - Desktop automation (mouse, keyboard, windows, screenshots)
- **Browser Tools** - Browser automation via extension
- **Filesystem Tools** - File and directory operations
- **Shell Tools** - Command execution and sessions

## Tool Categories

---

## GUI Tools (22 tools)

Desktop automation tools for controlling the mouse, keyboard, windows, and taking screenshots.

| Tool Name | Description |
|-----------|-------------|
| `listApplications` | List all running applications |
| `focusApplication` | Focus/activate a specific application window |
| `launchApplication` | Launch an application by name or bundle ID |
| `closeApp` | Close/quit an application |
| `screenshot` / `desktop_screenshot` | Take a screenshot of the entire desktop |
| `screenshot_app` | Take a screenshot of a specific application window |
| `click` | Click at relative screen coordinates |
| `click_absolute` | Click at absolute screen coordinates |
| `doubleClick` | Double-click at coordinates |
| `clickElement` | Click a UI element by accessibility reference |
| `moveMouse` | Move mouse to specific coordinates |
| `scroll` | Scroll at current position |
| `scrollMouse` | Scroll at specific coordinates |
| `drag` | Drag from one position to another |
| `getClickableElements` | Get list of clickable UI elements |
| `getUIElements` | Get UI element hierarchy for an application |
| `getMousePosition` | Get current mouse cursor position |
| `typeText` | Type text using keyboard |
| `pressKey` | Press a specific key (Enter, Tab, Escape, etc.) |
| `analyzeWithOCR` | Analyze screenshot with OCR text recognition |
| `checkPermissions` | Check accessibility permissions status |
| `wait` | Wait for a specified duration |

### MCP Advertised Names

When accessed via MCP, these tools use standardized names:

| MCP Name | Internal Name | Description |
|----------|---------------|-------------|
| `desktop_screenshot` | `screenshot` | Take a screenshot of the entire desktop or a specific window |
| `mouse_click` | `click` | Click at specific screen coordinates |
| `mouse_move` | `moveMouse` | Move mouse to specific screen coordinates |
| `mouse_drag` | `drag` | Drag mouse from one position to another |
| `mouse_scroll` | `scroll` | Scroll the mouse wheel |
| `keyboard_type` | `typeText` | Type text using the keyboard |
| `keyboard_press` | `pressKey` | Press a specific key |
| `keyboard_shortcut` | - | Execute a keyboard shortcut (e.g., Cmd+C) |
| `window_list` | `listApplications` | List all open windows |
| `window_focus` | `focusApplication` | Focus a specific window |
| `window_move` | - | Move a window to specific coordinates |
| `window_resize` | - | Resize a window |
| `app_launch` | `launchApplication` | Launch an application |
| `app_quit` | `closeApp` | Quit an application |
| `clipboard_read` | - | Read text from clipboard |
| `clipboard_write` | - | Write text to clipboard |

---

## Browser Tools (51 tools)

Browser automation tools that work through the ScreenControl browser extension. These tools require the browser extension to be installed and connected.

### Tab Management

| Tool Name | Description |
|-----------|-------------|
| `browser_listConnected` | List all browsers with connected extensions |
| `browser_setDefaultBrowser` | Set the default browser for commands |
| `browser_getTabs` | Get list of all open tabs |
| `browser_getActiveTab` | Get the currently active tab |
| `browser_focusTab` | Focus/switch to a specific tab |
| `browser_createTab` | Create a new tab |
| `browser_closeTab` | Close a specific tab |
| `browser_findTabByUrl` | Find a tab by URL pattern |

### Navigation

| Tool Name | Description |
|-----------|-------------|
| `browser_navigate` | Navigate to a URL |
| `browser_go_back` | Navigate back in history |
| `browser_go_forward` | Navigate forward in history |

### Page Inspection

| Tool Name | Description |
|-----------|-------------|
| `browser_getPageInfo` | Get page metadata (title, URL, etc.) |
| `browser_inspectCurrentPage` | Get detailed page inspection data |
| `browser_getInteractiveElements` | Get all interactive elements on page |
| `browser_getPageContext` | Get page context and state |
| `browser_getVisibleText` | Get all visible text on page |
| `browser_searchVisibleText` | Search for text on page |
| `browser_getUIElements` | Get UI element hierarchy |
| `browser_get_visible_html` | Get the visible HTML content |
| `browser_listInteractiveElements` | List all interactive elements |

### Element Interaction

| Tool Name | Description |
|-----------|-------------|
| `browser_clickElement` | Click an element by selector |
| `browser_clickByText` | Click an element by its text content |
| `browser_clickMultiple` | Click multiple elements |
| `browser_clickElementWithDebug` | Click with debug information |
| `browser_fillElement` | Fill an input element |
| `browser_fillFormField` | Fill a form field by name/id |
| `browser_fillWithFallback` | Fill with fallback strategies |
| `browser_fillFormNative` | Fill using native browser methods |
| `browser_scrollTo` | Scroll to an element or position |
| `browser_hover` | Hover over an element |
| `browser_drag` | Drag an element |
| `browser_press_key` | Press a key in the browser |
| `browser_upload_file` | Upload a file to an input |

### Form Handling

| Tool Name | Description |
|-----------|-------------|
| `browser_getFormData` | Get form data from page |
| `browser_selectOption` | Select an option from dropdown |
| `browser_getFormStructure` | Get form structure and fields |
| `browser_answerQuestions` | Auto-fill form questions |
| `browser_getDropdownOptions` | Get options from a dropdown |
| `browser_openDropdownNative` | Open dropdown using native methods |

### Waiting & Synchronization

| Tool Name | Description |
|-----------|-------------|
| `browser_waitForSelector` | Wait for an element to appear |
| `browser_waitForPageLoad` | Wait for page to fully load |
| `browser_isElementVisible` | Check if element is visible |
| `browser_findElementWithDebug` | Find element with debug info |

### JavaScript & Console

| Tool Name | Description |
|-----------|-------------|
| `browser_executeScript` | Execute JavaScript on page |
| `browser_getConsoleLogs` | Get browser console logs |
| `browser_getNetworkRequests` | Get network request history |

### Storage & Cookies

| Tool Name | Description |
|-----------|-------------|
| `browser_getLocalStorage` | Get local storage data |
| `browser_getCookies` | Get cookies for current page |

### Screenshots & Export

| Tool Name | Description |
|-----------|-------------|
| `browser_screenshot` | Take a screenshot of the browser |
| `browser_save_as_pdf` | Save page as PDF |

### Watch Mode

| Tool Name | Description |
|-----------|-------------|
| `browser_setWatchMode` | Enable/disable watch mode for changes |

---

## Filesystem Tools (9 tools)

File and directory operations for reading, writing, and searching files.

| Tool Name | Description |
|-----------|-------------|
| `fs_list` | List files and directories at a path |
| `fs_read` | Read file contents (with size limit) |
| `fs_read_range` | Read file segment by line range |
| `fs_write` | Create or overwrite a file |
| `fs_delete` | Delete a file or directory |
| `fs_move` | Move or rename a file/directory |
| `fs_search` | Find files by glob pattern |
| `fs_grep` | Search within files (regex) |
| `fs_patch` | Apply focused transformations to a file |

### Parameters

#### `fs_list`
- `path` (string): Directory path to list
- `recursive` (boolean): Whether to list recursively
- `maxDepth` (integer): Maximum depth for recursive listing (default: 3)

#### `fs_read`
- `path` (string): File path to read
- `maxBytes` (integer): Maximum bytes to read (default: 131072 / 128KB)

#### `fs_read_range`
- `path` (string): File path to read
- `startLine` (integer): Starting line number (1-based)
- `endLine` (integer): Ending line number (inclusive)

#### `fs_write`
- `path` (string): File path to write
- `content` (string): Content to write
- `createDirs` (boolean): Create parent directories (default: true)
- `mode` (string): "overwrite", "append", or "create_if_missing"

#### `fs_delete`
- `path` (string): Path to delete
- `recursive` (boolean): Recursive delete for directories

#### `fs_move`
- `fromPath` (string): Source path
- `toPath` (string): Destination path

#### `fs_search`
- `basePath` (string): Base directory for search
- `glob` (string): Glob pattern (e.g., "*.txt", "**/*.js")
- `maxResults` (integer): Maximum results (default: 200)

#### `fs_grep`
- `basePath` (string): Base directory for search
- `pattern` (string): Regex pattern to search
- `glob` (string): Optional glob filter
- `maxMatches` (integer): Maximum matches (default: 200)

#### `fs_patch`
- `path` (string): File path to patch
- `operations` (array): Array of patch operations
- `dryRun` (boolean): Preview without modifying

---

## Shell Tools (4 tools)

Command execution and interactive shell session management.

| Tool Name | Description |
|-----------|-------------|
| `shell_exec` | Run a command and return output when finished |
| `shell_start_session` | Start an interactive/long-running session |
| `shell_send_input` | Send input to a running session |
| `shell_stop_session` | Stop/terminate a running session |

### Parameters

#### `shell_exec`
- `command` (string): Shell command to execute
- `cwd` (string): Working directory (optional)
- `timeoutSeconds` (number): Maximum execution time (default: 600)
- `captureStderr` (boolean): Capture stderr (default: true)

#### `shell_start_session`
- `command` (string): Shell command to execute
- `cwd` (string): Working directory (optional)
- `env` (object): Additional environment variables
- `captureStderr` (boolean): Capture stderr (default: true)

#### `shell_send_input`
- `sessionId` (string): Session identifier
- `input` (string): Input to send

#### `shell_stop_session`
- `sessionId` (string): Session identifier
- `signal` (string): Signal to send ("TERM", "KILL", "INT", etc.)

---

## Tool Availability

### Always Available
- GUI tools (desktop automation)
- Filesystem tools
- Shell tools

### Conditionally Available
- Browser tools - Only available when the browser extension is connected

The agent dynamically advertises available tools based on current capabilities. When a browser extension is not connected, browser tools are not advertised to prevent errors.

---

## Usage Examples

### Taking a Screenshot
```json
{
  "tool": "desktop_screenshot",
  "params": {
    "format": "png"
  }
}
```

### Clicking at Coordinates
```json
{
  "tool": "mouse_click",
  "params": {
    "x": 500,
    "y": 300,
    "button": "left"
  }
}
```

### Navigating Browser
```json
{
  "tool": "browser_navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

### Reading a File
```json
{
  "tool": "fs_read",
  "params": {
    "path": "/path/to/file.txt",
    "maxBytes": 65536
  }
}
```

### Executing a Command
```json
{
  "tool": "shell_exec",
  "params": {
    "command": "ls -la",
    "cwd": "/home/user",
    "timeoutSeconds": 30
  }
}
```

---

## Version History

- **v1.0** - Initial release with GUI, Browser, Filesystem, and Shell tools
- **v1.1** - Added dynamic tool advertisement based on browser extension availability
- **v1.2** - Fixed tool naming mismatch (desktop_screenshot vs screenshot)
