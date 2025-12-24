# Browser Automation Guide

This guide covers browser automation using the ScreenControl browser extension. The extension enables direct interaction with web pages through Chrome, Firefox, Safari, and Edge.

## Overview

The browser extension provides:
- **Direct page interaction**: Click, fill, and read web elements
- **Tab management**: Create, switch, close tabs
- **Background tab support**: Work with tabs without switching to them
- **Form automation**: Fill forms, select dropdowns, submit data
- **Page inspection**: Get page content, structure, and state

## Prerequisites

### Extension Installation

The browser extension must be installed and connected:

1. Install the extension from the appropriate store or load unpacked
2. Navigate to a web page
3. The extension connects automatically to the ScreenControl service

### Checking Connection

```javascript
browser_listConnected()
// Returns: { connected: ["chrome", "firefox"] }

browser_listConnected({ browser: "chrome" })
// Check specific browser
```

### Setting Default Browser

```javascript
browser_setDefaultBrowser({ browser: "firefox" })
```

If not set, the first connected browser is used.

## Tab Management

### browser_getTabs

List all open tabs.

```javascript
browser_getTabs()
// Returns: [{ tabId, url, title, active }, ...]

browser_getTabs({ browser: "firefox" })
```

### browser_getActiveTab

Get information about the currently active tab.

```javascript
browser_getActiveTab()
// Returns: { tabId, url, title }
```

### browser_focusTab

Switch to a specific tab by ID.

```javascript
browser_focusTab({ tabId: 123 })
```

### browser_createTab

Open a new tab with a URL.

```javascript
browser_createTab({ url: "https://github.com" })
// Returns: { tabId, url }
```

### browser_closeTab

Close a tab by ID.

```javascript
browser_closeTab({ tabId: 123 })
```

### browser_findTabByUrl

Find a tab by URL pattern.

```javascript
browser_findTabByUrl({ pattern: "github.com" })
// Returns matching tab info
```

## Navigation

### browser_navigate

Navigate the active tab to a URL.

```javascript
browser_navigate({ url: "https://example.com" })
```

**When to use**: Faster than clicking address bar + typing. Primary way to open URLs.

### browser_go_back

Navigate back in history.

```javascript
browser_go_back()
```

### browser_go_forward

Navigate forward in history.

```javascript
browser_go_forward()
```

## Clicking Elements

### browser_clickElement

Click an element by CSS selector or text content. **Primary method for web page clicking.**

```javascript
// By CSS selector
browser_clickElement({ selector: "button.submit" })
browser_clickElement({ selector: "#login-btn" })
browser_clickElement({ selector: "[data-action='save']" })

// By text content
browser_clickElement({ text: "Sign In" })

// In background tab (by URL)
browser_clickElement({ selector: "button", url: "github.com" })

// In specific tab
browser_clickElement({ selector: "button", tabId: 123 })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `selector` | string | CSS selector to find element |
| `text` | string | Text content to find |
| `url` | string | URL pattern to target background tab |
| `tabId` | number | Specific tab ID to target |
| `browser` | string | Target browser (chrome, firefox, safari, edge) |

**When to use**: Any clickable element on web pages - buttons, links, form elements.

### browser_clickByText

Click an element by its visible text content.

```javascript
browser_clickByText({ text: "Submit" })
```

**When to use**: When you know the button/link text but not the CSS selector.

### browser_clickMultiple

Click all elements matching a selector.

```javascript
browser_clickMultiple({ selector: "input[type='checkbox']" })
```

**When to use**: Batch operations like checking multiple checkboxes.

### browser_clickElementWithDebug

Click with detailed debug output.

```javascript
browser_clickElementWithDebug({ selector: "button" })
```

**When to use**: Debugging why clicks fail.

## Form Filling

### browser_fillElement

Fill a form field by CSS selector. **Primary form filling method.**

```javascript
browser_fillElement({ selector: "#email", value: "user@example.com" })
browser_fillElement({ selector: "input[name='password']", value: "secret" })

// In background tab
browser_fillElement({ selector: "#search", value: "query", url: "google.com" })
```

**Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| `selector` | string | CSS selector for input field |
| `value` | string | Value to enter |
| `url` | string | URL pattern for background tab |
| `tabId` | number | Specific tab ID |

### browser_fillFormField

Fill a specific form field.

```javascript
browser_fillFormField({ fieldName: "email", value: "user@example.com" })
```

### browser_fillWithFallback

Fill using multiple fallback methods.

```javascript
browser_fillWithFallback({ selector: "#input", value: "text" })
```

**When to use**: When standard fill fails on stubborn inputs.

### browser_fillFormNative

Fill using native input events.

```javascript
browser_fillFormNative({ selector: "#input", value: "text" })
```

**When to use**: Fields that reject programmatic input (some React/Vue forms).

### browser_selectOption

Select a dropdown option.

```javascript
browser_selectOption({ selector: "select#country", value: "US" })
browser_selectOption({ selector: "select#country", text: "United States" })
```

### browser_getDropdownOptions

Get available options from a dropdown.

```javascript
browser_getDropdownOptions({ selector: "select#country" })
// Returns: [{ value: "US", text: "United States" }, ...]
```

### browser_openDropdownNative

Open dropdown using native click (for custom dropdowns).

```javascript
browser_openDropdownNative({ selector: ".custom-select" })
```

### browser_answerQuestions

Intelligently fill forms by matching questions to answers.

```javascript
browser_answerQuestions({
  answers: {
    "email": "user@example.com",
    "name": "John Doe",
    "country": "United States"
  }
})
```

**When to use**: Complex forms where you provide answers and it finds matching fields.

## Reading Page Content

### browser_getVisibleText

Get all visible text from a page.

```javascript
browser_getVisibleText()
browser_getVisibleText({ url: "github.com" })  // Background tab
```

**When to use**: Reading page content, finding text to search for, understanding page structure.

### browser_searchVisibleText

Check if specific text exists on the page.

```javascript
browser_searchVisibleText({ query: "Success" })
// Returns: { found: true/false }

browser_searchVisibleText({ query: "Error", url: "myapp.com" })
```

**When to use**: Verification that actions succeeded, checking for error messages.

### browser_getPageInfo

Get basic page information.

```javascript
browser_getPageInfo()
// Returns: { url, title }
```

### browser_getPageContext

Get structured page summary for AI understanding.

```javascript
browser_getPageContext()
```

### browser_inspectCurrentPage

Deep page inspection.

```javascript
browser_inspectCurrentPage()
```

**When to use**: Comprehensive page analysis, debugging.

## Finding Elements

### browser_getInteractiveElements

Get clickable and fillable elements on the page.

```javascript
browser_getInteractiveElements()
// Returns summary by default

browser_getInteractiveElements({ verbose: true })
// Full element details (WARNING: high token count)

browser_getInteractiveElements({ url: "github.com" })
// Background tab
```

**When to use**: Finding elements to interact with, understanding page structure, getting selectors.

### browser_getUIElements

Similar to getInteractiveElements.

```javascript
browser_getUIElements()
browser_getUIElements({ verbose: true })
```

### browser_listInteractiveElements

Alias for getInteractiveElements.

### browser_findElementWithDebug

Find element with debug information.

```javascript
browser_findElementWithDebug({ selector: "button.missing" })
```

**When to use**: Understanding why selectors don't match.

### browser_isElementVisible

Check if an element is visible.

```javascript
browser_isElementVisible({ selector: "#modal" })
// Returns: { visible: true/false }
```

## Form Structure

### browser_getFormStructure

Analyze form structure before filling.

```javascript
browser_getFormStructure()
// Returns form fields, types, required status
```

**When to use**: Understanding form fields before filling.

### browser_getFormData

Get current form values.

```javascript
browser_getFormData()
```

**When to use**: Reading filled form state, verifying input.

## Waiting

### browser_waitForSelector

Wait for an element to appear.

```javascript
browser_waitForSelector({ selector: ".loading-complete" })
```

**When to use**: After actions that load content, before interacting with dynamic elements.

### browser_waitForPageLoad

Wait for page to finish loading.

```javascript
browser_waitForPageLoad()
```

**When to use**: After navigation, ensuring page is ready for interaction.

## Page Interaction

### browser_hover

Hover over an element.

```javascript
browser_hover({ selector: ".dropdown-trigger" })
```

**When to use**: Triggering hover menus, tooltips, hover states.

### browser_drag

Drag an element to a position.

```javascript
browser_drag({ selector: ".draggable", toX: 300, toY: 400 })
```

**When to use**: Drag-and-drop in web apps, sortable lists, sliders.

### browser_press_key

Press a keyboard key in the browser.

```javascript
browser_press_key({ key: "Enter" })
browser_press_key({ key: "Tab" })
```

**When to use**: Keyboard navigation, shortcuts, key-triggered actions.

### browser_scrollTo

Scroll to a position or element.

```javascript
browser_scrollTo({ y: 500 })
browser_scrollTo({ selector: "#footer" })
```

### browser_executeScript

Run JavaScript in the page context.

```javascript
browser_executeScript({ script: "document.title" })
browser_executeScript({ script: "window.scrollTo(0, 1000)" })
```

**When to use**: Custom interactions, reading page state, complex operations. Use carefully.

## Screenshots and Files

### browser_screenshot

Screenshot the browser viewport.

```javascript
browser_screenshot()
browser_screenshot({ format: "png" })
browser_screenshot({ return_base64: true })
```

**When to use**: Visual verification, capturing page appearance.

### browser_save_as_pdf

Save page as PDF.

```javascript
browser_save_as_pdf()
```

**When to use**: Generating reports, saving pages for records.

### browser_upload_file

Upload a file via file input.

```javascript
browser_upload_file({ selector: "input[type='file']", path: "/path/to/file.pdf" })
```

## Debugging

### browser_getConsoleLogs

Get browser console logs.

```javascript
browser_getConsoleLogs()
```

**When to use**: Debugging, checking for JavaScript errors.

### browser_getNetworkRequests

Get network requests made by the page.

```javascript
browser_getNetworkRequests()
```

**When to use**: Debugging API calls, monitoring traffic.

### browser_getLocalStorage

Read localStorage data.

```javascript
browser_getLocalStorage()
```

### browser_getCookies

Get page cookies.

```javascript
browser_getCookies()
```

**When to use**: Session debugging, authentication state.

## Page Monitoring

### browser_setWatchMode

Enable/disable monitoring for page changes.

```javascript
browser_setWatchMode({ enabled: true })
```

**When to use**: Watching for dynamic updates.

### browser_get_visible_html

Get page HTML source.

```javascript
browser_get_visible_html()
```

**When to use**: Inspecting page structure, debugging selectors.

## Common Workflows

### Login Form

```javascript
// Navigate to login page
browser_navigate({ url: "https://app.example.com/login" })
browser_waitForPageLoad()

// Fill credentials
browser_fillElement({ selector: "#email", value: "user@example.com" })
browser_fillElement({ selector: "#password", value: "password123" })

// Submit
browser_clickElement({ selector: "button[type='submit']" })

// Verify login success
browser_waitForSelector({ selector: ".dashboard" })
const text = browser_getVisibleText()
```

### Multi-Tab Research

```javascript
// Open multiple research tabs
browser_createTab({ url: "https://docs.example.com" })
browser_createTab({ url: "https://api.example.com/docs" })
browser_createTab({ url: "https://github.com/example/repo" })

// Read from tabs without switching
const docs = browser_getVisibleText({ url: "docs.example.com" })
const api = browser_getVisibleText({ url: "api.example.com" })
const readme = browser_getVisibleText({ url: "github.com" })
```

### Form with File Upload

```javascript
// Fill form fields
browser_fillElement({ selector: "#title", value: "My Document" })
browser_fillElement({ selector: "#description", value: "Description here" })

// Select category
browser_selectOption({ selector: "#category", text: "Reports" })

// Upload file
browser_upload_file({ selector: "input[type='file']", path: "/path/to/report.pdf" })

// Submit
browser_clickElement({ selector: "button.submit" })
```

### Handling Dynamic Content

```javascript
// Click button that loads content
browser_clickElement({ selector: ".load-more" })

// Wait for new content to appear
browser_waitForSelector({ selector: ".new-item" })

// Or wait for loading indicator to disappear
browser_waitForSelector({ selector: ".loading", visible: false })

// Then interact with new content
browser_clickElement({ selector: ".new-item:first-child" })
```

## When Extension is Blocked

Some websites block browser extensions. When browser_* tools return errors:

1. **Use grid tools instead**:
   ```javascript
   screenshot_grid({ identifier: "Firefox" })
   click_grid({ element_text: "Submit" })
   typeText({ text: "input value" })
   ```

2. **Signs of blocking**:
   - browser_clickElement returns "blocked" error
   - browser_getVisibleText returns empty or error
   - Form fills don't work

3. **See [Grid Tools Guide](grid-tools.md)** for native desktop approach.

## Best Practices

1. **Use background tab operations**: Pass `url` parameter to work with tabs without switching.

2. **Verify actions succeeded**: Use `browser_searchVisibleText` or `browser_waitForSelector` after important actions.

3. **Handle dynamic pages**: Use wait tools after clicks that trigger loading.

4. **Get selectors first**: Use `browser_getInteractiveElements` to find correct selectors.

5. **Fallback to grid tools**: If extension is blocked, use `screenshot_grid` + `click_grid`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Extension not connected" | Check extension is installed and enabled |
| Click doesn't work | Try different selector, or use grid tools |
| Fill doesn't work | Use browser_fillWithFallback or browser_fillFormNative |
| Element not found | Use browser_waitForSelector first |
| Page blocks extension | Use screenshot_grid + click_grid fallback |
| Wrong tab targeted | Use explicit tabId or url parameter |
