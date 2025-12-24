# Desktop Automation Guide

This guide covers the native desktop automation tools for controlling macOS, Windows, and Linux applications. These tools work independently of the browser extension and are essential for automating native apps, file dialogs, and system UI.

## Overview

Desktop automation tools provide:
- **Screenshots**: Capture the entire screen or specific app windows
- **Mouse control**: Click, move, scroll, and drag
- **Keyboard input**: Type text and press keys/shortcuts
- **Application management**: Launch, focus, and close apps
- **Clipboard access**: Read and write system clipboard

## Screenshot Tools

### screenshot

Captures a full desktop screenshot including all monitors.

```javascript
screenshot()
// Returns: { file_path: "/tmp/screenshot_123.png" }

screenshot({ format: "png" })  // Lossless
screenshot({ format: "jpeg" }) // Smaller file size (default)
screenshot({ return_base64: true }) // Return image data instead of path
```

**When to use**: Quick overview of entire screen state, debugging multi-monitor layouts, documentation.

### screenshot_app

Captures a specific application window.

```javascript
screenshot_app({ identifier: "Finder" })
screenshot_app({ identifier: "com.apple.mail" })  // Bundle ID also works
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `identifier` | string | App name or bundle ID |
| `format` | string | "jpeg" (default) or "png" |
| `return_base64` | boolean | Return base64 instead of file path |

**When to use**: Focus on single app without desktop clutter, documentation of app states.

### screenshot_grid

Takes a screenshot with a grid overlay and OCR text detection. See [Grid Tools Guide](grid-tools.md) for comprehensive documentation.

```javascript
screenshot_grid({ identifier: "Simulator" })
// Returns grid overlay image + elements array with detected text
```

**When to use**: Preparing for click operations, finding UI element positions, native app interaction.

## Mouse Tools

### click_grid

Click using grid references or OCR text from `screenshot_grid`. See [Grid Tools Guide](grid-tools.md).

```javascript
// Click by detected text
click_grid({ element_text: "Submit" })

// Click by grid cell
click_grid({ cell: "E7" })

// Click with offset
click_grid({ element_text: "Label", offset_y: 30 })
```

### click_relative

Click at pixel coordinates relative to a window's top-left corner.

```javascript
click_relative({ identifier: "Simulator", x: 100, y: 200 })
click_relative({ identifier: "Finder", x: 50, y: 80, button: "right" })
```

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `identifier` | string | from screenshot | App name or bundle ID |
| `x` | number | **required** | X pixels from window left |
| `y` | number | **required** | Y pixels from window top |
| `focus` | boolean | true | Auto-focus window before click |
| `button` | string | "left" | Mouse button ("left" or "right") |

**When to use**: Clicking icons, images, or UI elements not detected by OCR.

### click_absolute

Click at absolute screen coordinates. Rarely needed - prefer `click_grid` or `click_relative`.

```javascript
click_absolute({ x: 500, y: 300 })
click_absolute({ x: -1000, y: 200 }) // Secondary monitor to left
```

**When to use**: Manual coordinate calculation, advanced multi-monitor scenarios.

### click

Legacy tool using normalized 0-1 coordinates. Avoid - use `click_grid` or `click_relative` instead.

### doubleClick

Double-click at absolute coordinates.

```javascript
doubleClick({ x: 500, y: 300 })
```

**When to use**: Opening files in Finder, selecting words in text editors.

### moveMouse

Move cursor without clicking.

```javascript
moveMouse({ x: 500, y: 300 })
```

**When to use**: Triggering hover effects, tooltips, visual feedback.

### getMousePosition

Get current cursor position.

```javascript
getMousePosition()
// Returns: { x: 500, y: 300 }
```

**When to use**: Debugging click issues, verifying cursor movement.

### scroll

Scroll at a specific location.

```javascript
scroll({ deltaY: -100 })           // Scroll down
scroll({ deltaY: 100 })            // Scroll up
scroll({ x: 500, y: 300, deltaY: -50 })  // Scroll at position
scroll({ deltaX: -50 })            // Horizontal scroll
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `deltaX` | number | Horizontal scroll (positive = right) |
| `deltaY` | number | Vertical scroll (negative = down, positive = up) |
| `x` | number | X position to scroll at (optional) |
| `y` | number | Y position to scroll at (optional) |

### scrollMouse

Simple directional scrolling.

```javascript
scrollMouse({ direction: "down" })
scrollMouse({ direction: "up", amount: 5 })
```

**When to use**: Basic page scrolling, simpler than `scroll` for common cases.

### drag

Drag from one point to another.

```javascript
drag({ startX: 100, startY: 100, endX: 300, endY: 300 })
```

**When to use**: Moving files, slider controls, resizing windows, drag-and-drop.

## Keyboard Tools

### typeText

Type text using keyboard simulation.

```javascript
typeText({ text: "Hello, World!" })
typeText({ text: "user@example.com" })
```

**When to use**: Any text input field that's already focused. Works in any application.

**Note**: For iOS Simulator, if `typeText` doesn't work correctly, toggle hardware keyboard with `Cmd+K` and use `click_relative` to tap the on-screen keyboard keys instead.

### pressKey

Press a specific key or key combination.

```javascript
// Single keys
pressKey({ key: "enter" })
pressKey({ key: "tab" })
pressKey({ key: "escape" })

// Modifier combinations
pressKey({ key: "cmd+s" })     // Save
pressKey({ key: "cmd+c" })     // Copy
pressKey({ key: "cmd+v" })     // Paste
pressKey({ key: "cmd+shift+s" })  // Save As
pressKey({ key: "cmd+k" })     // Toggle Simulator keyboard
```

**Supported Keys**:
- **Navigation**: `up`, `down`, `left`, `right`, `home`, `end`, `pageup`, `pagedown`
- **Editing**: `delete`, `backspace`, `space`, `tab`, `enter`
- **Control**: `escape`, `f1`-`f12`
- **Modifiers**: `cmd`, `ctrl`, `alt`, `shift` (combine with `+`)

**When to use**: Form submission, keyboard shortcuts, navigation, special key actions.

## Application Management

### listApplications

List all running applications with their bundle IDs and window bounds.

```javascript
listApplications()
// Returns array of: { name, bundleId, windowBounds: { x, y, width, height } }
```

**When to use**: Finding app identifiers, seeing what's running, getting window positions.

### focusApplication

Bring an application to the front.

```javascript
focusApplication({ identifier: "Finder" })
focusApplication({ identifier: "com.apple.Safari" })
```

**When to use**: Before interacting with an app, switching between apps, ensuring clicks go to correct window.

### launchApplication

Start an application (or focus if already running).

```javascript
launchApplication({ identifier: "Notes" })
launchApplication({ identifier: "com.apple.TextEdit" })
```

**When to use**: Starting apps that aren't running, ensuring an app is available.

### closeApp

Close an application.

```javascript
closeApp({ identifier: "Notes" })
closeApp({ identifier: "Notes", force: true })  // Force quit
```

**When to use**: Cleanup after tasks, closing stuck apps.

## System Tools

### system_info

Get system information.

```javascript
system_info()
// Returns: { os, version, cpu, memory, hostname }
```

### clipboard_read

Read text from system clipboard.

```javascript
clipboard_read()
// Returns: { text: "clipboard contents" }
```

### clipboard_write

Write text to system clipboard.

```javascript
clipboard_write({ text: "text to copy" })
```

### wait

Pause execution for a specified duration.

```javascript
wait({ milliseconds: 1000 })  // Wait 1 second
wait({ milliseconds: 500 })   // Wait half second
```

**When to use**: After clicks that trigger loading, waiting for animations, giving time for UI transitions.

### window_list

List all open windows on the desktop.

```javascript
window_list()
// Returns detailed window info including positions across monitors
```

### checkPermissions

Verify accessibility permissions are granted.

```javascript
checkPermissions()
```

**When to use**: Debugging why clicks don't work, initial setup verification.

## OCR Tools

### analyzeWithOCR

Run OCR on a screen region.

```javascript
analyzeWithOCR()
```

**When to use**: Reading text from images, extracting text from non-standard UI. Note that `screenshot_grid` already includes OCR - use this for custom regions.

## Common Workflows

### Native App Interaction

```javascript
// Open and interact with Notes app
launchApplication({ identifier: "Notes" })
wait({ milliseconds: 1000 })
screenshot_grid({ identifier: "Notes" })
click_grid({ element_text: "New Note" })
typeText({ text: "My note content" })
pressKey({ key: "cmd+s" })
```

### File Dialog Navigation

```javascript
// Navigate a file save dialog
pressKey({ key: "cmd+s" })
wait({ milliseconds: 500 })
screenshot_grid()
typeText({ text: "document.txt" })
click_grid({ element_text: "Save" })
```

### Finder File Operations

```javascript
// Open Finder and navigate
launchApplication({ identifier: "Finder" })
wait({ milliseconds: 500 })
pressKey({ key: "cmd+shift+g" })  // Go to folder
typeText({ text: "/Users/me/Documents" })
pressKey({ key: "enter" })
```

### iOS Simulator Interaction

```javascript
// Toggle hardware keyboard for software keyboard input
focusApplication({ identifier: "Simulator" })
pressKey({ key: "cmd+k" })  // Show software keyboard
wait({ milliseconds: 300 })
screenshot_grid({ identifier: "Simulator" })
// Then use click_relative to tap keyboard keys
```

## Best Practices

1. **Always take a screenshot first**: Before clicking, use `screenshot_grid` to see current state and get element positions.

2. **Wait after navigation**: Use `wait()` after clicks that cause loading or navigation.

3. **Verify actions**: Take another screenshot after important actions to verify they succeeded.

4. **Use focus**: Most click tools auto-focus the window, but call `focusApplication` explicitly if needed.

5. **Handle keyboard correctly**: For iOS Simulator, toggle hardware keyboard off with `Cmd+K` to use software keyboard.

6. **Use appropriate click tool**:
   - `click_grid` with `element_text` for buttons and labels
   - `click_relative` for icons and images
   - `click_grid` with `cell` for known grid positions

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Click doesn't register | Check focus, verify coordinates with screenshot_grid |
| typeText enters wrong characters | For Simulator, use Cmd+K and tap keyboard keys |
| Screenshot is blank | Check Screen Recording permission in System Preferences |
| App not responding | Try focusApplication first, or use force quit |
| Wrong window clicked | Specify identifier parameter explicitly |
