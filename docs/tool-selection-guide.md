# Tool Selection Guide

This guide helps AI assistants choose the right ScreenControl tool for each task. Tools are organized by category with decision trees for common scenarios.

## Quick Reference

| Task | First Choice | Fallback |
|------|--------------|----------|
| Click button on web page | `browser_clickElement` | `screenshot_grid` + `click_grid` |
| Click button in native app | `screenshot_grid` + `click_grid` | `click_relative` |
| Fill web form | `browser_fillElement` | `click_grid` + `typeText` |
| Read web page content | `browser_getVisibleText` | `screenshot_grid` OCR |
| Take screenshot | `screenshot` or `screenshot_app` | `browser_screenshot` for web |
| Navigate to URL | `browser_navigate` | `browser_createTab` |
| Type text anywhere | `typeText` | Individual key taps |
| Press keyboard shortcut | `pressKey` | - |

## Decision Trees

### Clicking on UI Elements

```
Need to click something?
│
├─ Is it on a web page?
│   │
│   ├─ Browser extension connected?
│   │   │
│   │   ├─ YES → browser_clickElement(selector) or browser_clickByText(text)
│   │   │        ✓ Fastest, most reliable
│   │   │        ✓ Works in background tabs
│   │   │
│   │   └─ NO or BLOCKED → Go to "Native App" flow below
│   │
│   └─ Don't know? → Use browser_listConnected to check
│
├─ Is it in a native app (Finder, Mail, Simulator, etc.)?
│   │
│   ├─ 1. Take screenshot with grid:
│   │      screenshot_grid({ identifier: "AppName" })
│   │
│   ├─ 2. View the image to see grid overlay and OCR results
│   │
│   └─ 3. Choose click method:
│       │
│       ├─ OCR detected the text you want to click?
│       │   └─ click_grid({ element_text: "Button Text" })
│       │      ✓ Most accurate for text
│       │      ✓ Works even if button moved slightly
│       │
│       ├─ Target is an icon/image with no text?
│       │   └─ click_relative({ identifier: "App", x: 150, y: 300 })
│       │      ✓ Use centerX/centerY from elements array
│       │      ✓ Or estimate from grid overlay
│       │
│       └─ Know the exact grid cell?
│           └─ click_grid({ cell: "E7" })
│              ✓ Good for static UI layouts
│
└─ Is it on secondary monitor?
    └─ Same flow - grid tools handle multi-monitor automatically
```

### Taking Screenshots

```
Need a screenshot?
│
├─ For clicking/interaction?
│   └─ screenshot_grid
│      ✓ Includes grid overlay
│      ✓ OCR text detection
│      ✓ Records window position for click_grid
│
├─ Just for viewing/documentation?
│   │
│   ├─ Full desktop → screenshot
│   ├─ Specific app → screenshot_app({ identifier: "AppName" })
│   └─ Web page → browser_screenshot
│
└─ Web page for debugging?
    └─ browser_screenshot
       ✓ Captures browser viewport
       ✓ Works in background tabs with url parameter
```

### Entering Text

```
Need to type text?
│
├─ Web form field?
│   │
│   ├─ Extension working?
│   │   └─ browser_fillElement({ selector: "input", value: "text" })
│   │      ✓ Directly fills field
│   │      ✓ Works in background tabs
│   │
│   └─ Extension blocked?
│       └─ 1. click_grid({ element_text: "input placeholder" })
│          2. typeText({ text: "your text" })
│
├─ Native app text field?
│   └─ 1. click_grid({ element_text: "Field Label" }) - focus the field
│      2. typeText({ text: "your text" })
│
├─ iOS Simulator keyboard?
│   └─ 1. screenshot_grid({ identifier: "Simulator" })
│      2. For each character: click_relative({ x: keyX, y: keyY })
│      See grid-tools.md for keyboard positions
│
└─ Need special keys (Enter, Tab, Escape)?
    └─ pressKey({ key: "enter" })
```

### Reading Content

```
Need to read page content?
│
├─ Web page?
│   │
│   ├─ browser_getVisibleText({ url: "..." })
│   │   ✓ All visible text
│   │   ✓ Works in background tabs
│   │
│   ├─ browser_searchVisibleText({ query: "...", url: "..." })
│   │   ✓ Check if specific text exists
│   │
│   └─ Site blocks extension?
│       └─ screenshot_grid → View OCR results in elements array
│
├─ Native app?
│   └─ screenshot_grid → OCR in elements array
│      Or analyzeWithOCR for specific region
│
└─ File on disk?
    └─ fs_read({ path: "/path/to/file" })
```

### Application Management

```
Need to work with applications?
│
├─ Find what's running
│   └─ listApplications
│      Returns: name, bundle ID, window bounds
│
├─ Switch to an app
│   └─ focusApplication({ identifier: "AppName" })
│      ✓ Handles multi-monitor
│      ✓ Case-insensitive matching
│
├─ Start an app
│   └─ launchApplication({ identifier: "AppName" })
│      ✓ Also focuses if already running
│
├─ Close an app
│   └─ closeApp({ identifier: "AppName", force: false })
│      Use force: true for stuck apps
│
└─ Get current focused app
    └─ currentApp
```

### Browser Tab Management

```
Working with browser tabs?
│
├─ List all tabs
│   └─ browser_getTabs
│      Returns: tabId, url, title for each tab
│
├─ Get active tab
│   └─ browser_getActiveTab
│
├─ Switch to tab
│   └─ browser_focusTab({ tabId: 123 })
│
├─ Open new tab
│   └─ browser_createTab({ url: "https://..." })
│
├─ Close tab
│   └─ browser_closeTab({ tabId: 123 })
│
└─ Find tab by URL
    └─ browser_findTabByUrl({ pattern: "github.com" })
```

## Tool Categories Reference

### Screenshot Tools
| Tool | Best For |
|------|----------|
| `screenshot` | Full desktop, quick overview |
| `screenshot_app` | Single app window |
| `screenshot_grid` | **Interaction** - includes grid + OCR |
| `browser_screenshot` | Web page viewport |

### Click Tools
| Tool | Best For |
|------|----------|
| `browser_clickElement` | Web pages (when extension works) |
| `click_grid` | Native apps, text-based targets |
| `click_relative` | Icons, images, pixel-precise clicks |
| `click_absolute` | Rare - manual coordinate calculation |

### Form/Input Tools
| Tool | Best For |
|------|----------|
| `browser_fillElement` | Web form fields |
| `typeText` | Any focused input |
| `pressKey` | Special keys, shortcuts |

### Browser Navigation
| Tool | Best For |
|------|----------|
| `browser_navigate` | Go to URL in current tab |
| `browser_createTab` | Open URL in new tab |
| `browser_go_back` | History navigation |
| `browser_go_forward` | History navigation |

### Content Reading
| Tool | Best For |
|------|----------|
| `browser_getVisibleText` | Web page text (fast) |
| `browser_searchVisibleText` | Check text exists |
| `browser_getInteractiveElements` | Find buttons/inputs |
| `analyzeWithOCR` | Native app text |

### System Tools
| Tool | Best For |
|------|----------|
| `system_info` | OS, CPU, memory info |
| `clipboard_read` | Get copied text |
| `clipboard_write` | Copy text |
| `wait` | Pause for animations/loading |
| `window_list` | All open windows |

### Filesystem Tools
| Tool | Best For |
|------|----------|
| `fs_read` | Read file contents |
| `fs_write` | Create/update files |
| `fs_list` | Directory contents |
| `fs_search` | Find files by pattern |
| `fs_grep` | Search in files |

### Shell Tools
| Tool | Best For |
|------|----------|
| `shell_exec` | Run command, get output |
| `shell_start_session` | Interactive commands |
| `shell_send_input` | Send to session |
| `shell_stop_session` | End session |

## Common Patterns

### Web Form Submission

```javascript
// Pattern 1: Browser extension (preferred)
browser_fillElement({ selector: "#email", value: "user@example.com" })
browser_fillElement({ selector: "#password", value: "secret" })
browser_clickElement({ selector: "button[type='submit']" })

// Pattern 2: Extension blocked
screenshot_grid({ identifier: "Firefox" })
click_grid({ element_text: "Email" })
typeText({ text: "user@example.com" })
pressKey({ key: "tab" })
typeText({ text: "secret" })
click_grid({ element_text: "Sign In" })
```

### Native App Workflow

```javascript
// Open app and interact
launchApplication({ identifier: "Notes" })
wait({ milliseconds: 1000 })
screenshot_grid({ identifier: "Notes" })
click_grid({ element_text: "New Note" })
typeText({ text: "My note content" })
pressKey({ key: "cmd+s" })  // Save
```

### Multi-Tab Web Research

```javascript
// Open multiple tabs
browser_createTab({ url: "https://docs.example.com" })
browser_createTab({ url: "https://api.example.com" })

// Work with tabs by URL (no need to switch)
const docs = browser_getVisibleText({ url: "docs.example.com" })
const api = browser_getVisibleText({ url: "api.example.com" })
```

## Troubleshooting Tool Selection

| Symptom | Likely Issue | Solution |
|---------|--------------|----------|
| browser_* returns error | Extension blocked | Use screenshot_grid + click_grid |
| click_grid misses target | OCR didn't detect text | Use click_relative with pixel coords |
| Click goes to wrong window | Multi-monitor issue | Ensure focus: true (default) |
| typeText enters wrong field | Field not focused | Click field first with click_grid |
| Screenshot blank | Permission issue | Check Screen Recording permission |
