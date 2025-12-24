# Multi-Monitor Support

ScreenControl fully supports multi-monitor setups on macOS, Windows, and Linux. This guide explains how the coordinate system works and best practices for multi-monitor automation.

## Overview

Multi-monitor support is built into all click and screenshot tools:
- **Negative X coordinates** for monitors to the left of the primary display
- **Automatic window tracking** between screenshot and click operations
- **Cursor warping** ensures clicks land on the correct monitor
- **Auto-focus** brings windows to the front before clicking

## Coordinate System

### Primary Monitor

The primary monitor's top-left corner is at coordinates (0, 0).

```
Primary Monitor (1920x1080)
┌─────────────────────────┐
│(0,0)              (1919,0)│
│                           │
│                           │
│(0,1079)         (1919,1079)│
└─────────────────────────┘
```

### Secondary Monitors

Secondary monitors extend the coordinate space:

**Monitor to the RIGHT** (positive X):
```
Primary (1920x1080)          Secondary (1920x1080)
┌─────────────────┐          ┌─────────────────┐
│(0,0)            │          │(1920,0)         │
│                 │          │                 │
│                 │          │                 │
└─────────────────┘          └─────────────────┘
```

**Monitor to the LEFT** (negative X):
```
Secondary (1920x1080)        Primary (1920x1080)
┌─────────────────┐          ┌─────────────────┐
│(-1920,0)        │          │(0,0)            │
│                 │          │                 │
│                 │          │                 │
└─────────────────┘          └─────────────────┘
```

**Monitor ABOVE** (negative Y):
```
Secondary (1920x1080)
┌─────────────────┐
│(0,-1080)        │
│                 │
└─────────────────┘
Primary (1920x1080)
┌─────────────────┐
│(0,0)            │
│                 │
└─────────────────┘
```

## Using Grid Tools on Multiple Monitors

### screenshot_grid

The `screenshot_grid` tool automatically captures the correct window regardless of which monitor it's on and records the window position for subsequent clicks.

```javascript
// Screenshot app on secondary monitor
screenshot_grid({ identifier: "Firefox" })
```

Response includes window bounds with monitor position:
```json
{
  "windowX": -1200,
  "windowY": 100,
  "windowBounds": { "x": -1200, "y": 100, "width": 1400, "height": 900 }
}
```

### click_grid

Uses stored window position from the last `screenshot_grid` call. Works automatically across monitors.

```javascript
// Take screenshot (records window position)
screenshot_grid({ identifier: "Firefox" })

// Click element (uses stored position automatically)
click_grid({ element_text: "Submit" })
```

### click_relative

Specify pixel coordinates relative to window - automatically converts to absolute screen coordinates.

```javascript
// Click at (100, 200) within Firefox window
// Works correctly even if Firefox is on secondary monitor at X=-1200
click_relative({ identifier: "Firefox", x: 100, y: 200 })

// Converts to absolute: x = -1200 + 100 = -1100
```

## Finding Windows Across Monitors

### listApplications

Returns window bounds including monitor position:

```javascript
listApplications()
// Returns:
// [
//   {
//     name: "Firefox",
//     bundleId: "org.mozilla.firefox",
//     windowBounds: { x: -1200, y: 100, width: 1400, height: 900 }
//   },
//   {
//     name: "Finder",
//     bundleId: "com.apple.finder",
//     windowBounds: { x: 200, y: 50, width: 800, height: 600 }
//   }
// ]
```

### window_list

More detailed window information:

```javascript
window_list()
// Returns all windows with position, size, and monitor info
```

## Auto-Focus Behavior

Click tools automatically focus the target window before clicking, which is critical for multi-monitor setups:

```javascript
// Even if Firefox is on secondary monitor and not focused
click_grid({ element_text: "Deploy", identifier: "Firefox" })
// 1. Focuses Firefox (brings to front)
// 2. Moves cursor to correct absolute position
// 3. Performs click
```

To skip focus (e.g., if window is already focused):
```javascript
click_grid({ element_text: "Deploy", focus: false })
click_relative({ identifier: "Firefox", x: 100, y: 200, focus: false })
```

## Common Multi-Monitor Scenarios

### App on Secondary Monitor

```javascript
// 1. Take screenshot (automatically finds window on any monitor)
screenshot_grid({ identifier: "Simulator" })

// 2. Click using OCR text
click_grid({ element_text: "Add item" })

// 3. Or click by pixel coordinates
click_relative({ identifier: "Simulator", x: 200, y: 400 })
```

### Multiple Windows of Same App

Use `window_title` to target specific windows:

```javascript
// Firefox with multiple windows (main + DevTools)
screenshot_grid({ identifier: "Firefox", window_title: "GitHub" })
click_grid({ element_text: "Code" })
```

### Switching Between Monitors

```javascript
// App on monitor 1
focusApplication({ identifier: "Firefox" })
screenshot_grid({ identifier: "Firefox" })
click_grid({ element_text: "Submit" })

// App on monitor 2
focusApplication({ identifier: "Simulator" })
screenshot_grid({ identifier: "Simulator" })
click_grid({ element_text: "Add item" })
```

## Technical Details

### Coordinate Conversion

When you call `click_relative`:

1. **Get window bounds**: Retrieves current window position (e.g., x=-1200, y=100)
2. **Add relative offset**: absoluteX = windowX + relativeX
3. **Warp cursor**: Moves cursor to absolute position
4. **Perform click**: Clicks at cursor location

```
Window at (-1200, 100)
click_relative(x=150, y=250)

absoluteX = -1200 + 150 = -1050
absoluteY = 100 + 250 = 350

Click at absolute (-1050, 350)
```

### Cursor Warping

Unlike simple coordinate-based clicking, ScreenControl physically moves the cursor to the target position before clicking. This ensures:
- Click lands on correct monitor
- Correct window receives the click event
- Works even with overlapping windows

### Window Position Tracking

`screenshot_grid` stores window position in a session-level cache:
- Position is updated with each screenshot
- `click_grid` uses cached position if no identifier specified
- Explicit identifier re-fetches window bounds

## Best Practices

1. **Always take a fresh screenshot**: Window may have moved between operations
   ```javascript
   screenshot_grid({ identifier: "App" })  // Get current position
   click_grid({ element_text: "Button" })  // Use fresh coordinates
   ```

2. **Use explicit identifiers**: Don't rely on "focused app" in multi-monitor setups
   ```javascript
   // Good - explicit target
   click_grid({ element_text: "Submit", identifier: "Firefox" })

   // Risky - may click wrong window
   click_grid({ element_text: "Submit" })
   ```

3. **Verify with screenshots**: Take screenshots to confirm correct window is targeted
   ```javascript
   screenshot_grid({ identifier: "Firefox" })
   // View image to confirm correct window
   click_grid({ element_text: "Deploy" })
   screenshot_grid({ identifier: "Firefox" })  // Verify action
   ```

4. **Handle window moves**: If user moves windows, re-screenshot before clicking
   ```javascript
   // Window may have moved since last screenshot
   screenshot_grid({ identifier: "App" })  // Refresh position
   click_grid({ element_text: "Button" })
   ```

## Troubleshooting

### Click Goes to Wrong Monitor

**Cause**: Window position changed since last screenshot.
**Solution**: Take a fresh `screenshot_grid` before clicking.

### Click Goes to Wrong Window

**Cause**: Multiple windows, wrong one targeted.
**Solution**: Use `identifier` parameter explicitly. Use `window_title` for multi-window apps.

### Window Not Found

**Cause**: App identifier doesn't match or app not running.
**Solution**: Use `listApplications()` to get correct identifier/bundle ID.

### Cursor Doesn't Move

**Cause**: Accessibility permissions not granted.
**Solution**: Check System Preferences > Security & Privacy > Accessibility.

### Click Registers But Nothing Happens

**Cause**: Window lost focus between cursor move and click.
**Solution**: Ensure `focus: true` (default) or call `focusApplication` first.

## Platform Notes

### macOS

- Uses CGDisplayBounds for monitor detection
- Supports Retina displays with proper scaling
- Mission Control and Spaces are handled correctly

### Windows

- Uses GetMonitorInfo for multi-monitor detection
- Supports different DPI settings per monitor
- Works with virtual desktop switching

### Linux

- Uses X11/Xrandr for monitor detection
- Supports most display managers
- Wayland support varies by compositor
