# Grid Tools Guide

The grid tools (`screenshot_grid`, `click_grid`, `click_relative`) provide a visual interaction system for controlling native applications, iOS Simulator, and websites where browser extensions are blocked.

## Overview

Grid tools solve the problem of clicking on UI elements when:
- Browser extension is blocked by the website
- Interacting with native macOS/Windows/Linux applications
- Controlling iOS Simulator or other emulators
- Elements don't have accessible selectors

## Tool Decision Tree

```
Need to click something?
│
├─ Web page + browser extension working?
│   └─ YES → Use browser_clickElement (fastest, most reliable)
│
├─ Native app OR browser extension blocked?
│   │
│   ├─ 1. Call screenshot_grid to see the screen + get OCR elements
│   │
│   └─ 2. Choose click method:
│       │
│       ├─ OCR detected your target text?
│       │   └─ Use click_grid(element_text='Button Text')
│       │
│       ├─ Target is an icon/image (no text)?
│       │   └─ Use click_relative(x=pixels, y=pixels)
│       │
│       └─ Know the grid cell from overlay?
│           └─ Use click_grid(cell='E7')
```

## screenshot_grid

Takes a screenshot with a visual grid overlay and performs OCR to detect text elements.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `identifier` | string | focused app | App name or bundle ID to capture |
| `window_title` | string | null | Window title substring for multi-window apps |
| `columns` | number | 20 | Grid columns (5-40) |
| `rows` | number | 15 | Grid rows (5-30) |
| `return_base64` | boolean | false | Return base64 instead of file path |

### Response

```json
{
  "file_path": "/tmp/screenshot_Simulator_grid_123.png",
  "windowX": 1735,
  "windowY": 1141,
  "windowBounds": { "x": 1735, "y": 1141, "width": 456, "height": 972 },
  "imageWidth": 456,
  "imageHeight": 972,
  "columns": 20,
  "rows": 15,
  "cellWidth": 22.8,
  "cellHeight": 64.8,
  "element_count": 28,
  "elements": [
    {
      "text": "Add item",
      "cell": "F13",
      "centerX": 115,
      "centerY": 819.5,
      "column": 6,
      "row": 13,
      "confidence": 0.5,
      "bounds": { "x": 82, "y": 813, "width": 66, "height": 12 }
    }
  ]
}
```

### Example Usage

```javascript
// Take screenshot of Simulator with grid
screenshot_grid({ identifier: "Simulator" })

// Screenshot specific Firefox window (not DevTools)
screenshot_grid({ identifier: "Firefox", window_title: "GitHub" })

// Full desktop screenshot with custom grid
screenshot_grid({ columns: 30, rows: 20 })
```

## click_grid

Click using references from screenshot_grid output.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `element_text` | string | - | Text to search for (case-insensitive) |
| `cell` | string | - | Grid cell reference (e.g., 'E7') |
| `element` | number | - | Element index from elements array |
| `offset_x` | number | 0 | Horizontal pixel offset after position calculation |
| `offset_y` | number | 0 | Vertical pixel offset (use to click below text) |
| `identifier` | string | from screenshot | App to click in |
| `window_title` | string | from screenshot | Window title to match |
| `focus` | boolean | true | Auto-focus window before clicking |
| `button` | string | "left" | Mouse button (left/right) |

### Click Modes

**1. By Element Text (Preferred)**
```javascript
// Clicks center of detected "Submit" text
click_grid({ element_text: "Submit" })

// Click "Deploy" with offset to hit button below text
click_grid({ element_text: "Deploy Schema Changes", offset_y: 30 })
```

**2. By Grid Cell**
```javascript
// Click center of cell E7
click_grid({ cell: "E7" })

// Click with offset from cell
click_grid({ cell: "J10", offset_x: 20, offset_y: -10 })
```

**3. By Element Index**
```javascript
// Click the first detected element
click_grid({ element: 0 })

// Click the 5th element in the array
click_grid({ element: 4 })
```

### Response

```json
{
  "success": true,
  "clickMode": "element_precise",
  "matchedElement": {
    "text": "Add item",
    "cell": "F13",
    "centerX": 115,
    "centerY": 819.5
  },
  "clickedAt": { "x": 1850, "y": 1960.5 },
  "windowBounds": { "x": 1735, "y": 1141, "width": 456, "height": 972 },
  "focusPerformed": true,
  "focusTarget": "Simulator"
}
```

## click_relative

Click at pixel coordinates relative to a window. Essential for icons, images, and UI elements that OCR misses.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | number | **required** | X pixels from window left edge |
| `y` | number | **required** | Y pixels from window top edge |
| `identifier` | string | from screenshot | App name or bundle ID |
| `focus` | boolean | true | Auto-focus window before clicking |
| `button` | string | "left" | Mouse button (left/right) |

### How It Works

1. Gets window bounds for the specified app
2. Adds window offset to relative coordinates: `absoluteX = windowX + x`
3. Auto-focuses the window (unless `focus: false`)
4. Performs click at absolute screen position

### Example Usage

```javascript
// Click at pixel (100, 200) within Simulator window
click_relative({ identifier: "Simulator", x: 100, y: 200 })

// Click iOS keyboard key 'M' (estimated from screenshot)
click_relative({ identifier: "Simulator", x: 342, y: 795 })

// Click tab bar icon in iOS app
click_relative({ identifier: "Simulator", x: 365, y: 875 })
```

### Response

```json
{
  "success": true,
  "relativeCoords": { "x": 100, "y": 200 },
  "absoluteCoords": { "x": 1835, "y": 1341 },
  "windowBounds": { "x": 1735, "y": 1141, "width": 456, "height": 972 },
  "focusPerformed": true,
  "identifier": "Simulator"
}
```

## Complete Workflow Example: iOS Simulator

### Adding an Item with Keyboard Input

```javascript
// 1. Take screenshot to see current state
screenshot_grid({ identifier: "Simulator" })

// 2. Click "Add item" button (detected by OCR)
click_grid({ element_text: "Add item", identifier: "Simulator" })

// 3. Wait for keyboard to appear
wait({ milliseconds: 500 })

// 4. Screenshot to see keyboard
screenshot_grid({ identifier: "Simulator" })

// 5. If keyboard shows numbers, click "ABC" to switch to letters
click_grid({ element_text: "ABC", identifier: "Simulator" })

// 6. Type "Milk" by tapping individual keys
// M key (row 13, rightmost letter)
click_relative({ identifier: "Simulator", x: 342, y: 795 })
// i key (row 11)
click_relative({ identifier: "Simulator", x: 319, y: 683 })
// l key (row 12)
click_relative({ identifier: "Simulator", x: 387, y: 739 })
// k key (row 12)
click_relative({ identifier: "Simulator", x: 330, y: 739 })

// 7. Tap blue checkmark to confirm
click_relative({ identifier: "Simulator", x: 365, y: 850 })
```

### iOS Keyboard Key Positions

When typing on iOS Simulator keyboard (QWERTY layout):

| Row | Y Position | Keys |
|-----|------------|------|
| 11 | ~683 | Q W E R T Y U I O P |
| 12 | ~739 | A S D F G H J K L |
| 13 | ~795 | (shift) Z X C V B N M (backspace) |
| 14 | ~850 | 123 (space) (return) |

**Tip**: Toggle hardware keyboard off with `Cmd+K` to show software keyboard.

## Multi-Monitor Support

Grid tools are designed to work correctly on multi-monitor setups:

- **Negative X coordinates**: Secondary monitors to the left have negative X values
- **Window tracking**: `screenshot_grid` records window position, `click_grid` uses it
- **Auto-focus**: Ensures clicks go to the correct window even on different monitors
- **Cursor warp**: Always moves cursor to target position before clicking

### Example: Secondary Monitor

```javascript
// Screenshot app on secondary monitor (negative X)
screenshot_grid({ identifier: "Firefox" })
// Response includes windowX: -1920 (monitor to the left)

// click_grid automatically handles the negative coordinates
click_grid({ element_text: "Deploy", identifier: "Firefox" })
```

## Troubleshooting

### Click Not Registering

1. **Check focus**: Ensure `focus: true` (default) or call `focusApplication` first
2. **Verify coordinates**: Use `screenshot_grid` to confirm element position
3. **Multi-monitor**: Window may be on different monitor than expected
4. **Permissions**: Check accessibility permissions in System Preferences

### OCR Missing Text

1. **Low contrast**: Some text may not be detected
2. **Small text**: Increase screenshot resolution or use visual estimation
3. **Icons**: Use `click_relative` with pixel coordinates instead

### iOS Simulator Keyboard

1. **Keyboard not showing**: Press `Cmd+K` to toggle hardware keyboard off
2. **Wrong characters**: Type slowly, allow time between key taps
3. **Focus issues**: Click text field first, wait for keyboard to appear

## Performance Tips

1. **Cache window position**: After `screenshot_grid`, subsequent `click_grid` calls use stored position
2. **Skip focus when safe**: Use `focus: false` if window is already focused
3. **Batch operations**: Take one screenshot, click multiple elements
4. **Use element_text**: Faster than manual coordinate calculation
