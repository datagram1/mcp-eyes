# MCP Eyes Safari Extension

This folder contains the Safari Web Extension source files for MCP Eyes.

## Building the Safari Extension

Safari Web Extensions must be packaged through Xcode. Follow these steps:

### 1. Create Xcode Project

```bash
# In Terminal, navigate to the extension/safari folder
cd /path/to/mcp-eyes/extension/safari

# Use Safari's extension converter (requires Xcode installed)
xcrun safari-web-extension-converter . --project-location ../safari-xcode --app-name "MCP Eyes" --bundle-identifier com.mcpeyes.safari
```

### 2. Open and Build in Xcode

1. Open the generated Xcode project in `../safari-xcode/`
2. Select your development team in Signing & Capabilities
3. Build the project (Cmd+B)
4. Run the app (Cmd+R)

### 3. Enable in Safari

1. Open Safari > Preferences > Extensions
2. Enable "MCP Eyes" extension
3. Grant required permissions when prompted

## Files

- `manifest.json` - Extension manifest (Safari Web Extension format)
- `background.js` - Background script handling WebSocket connection to MCP Eyes
- `content.js` - Content script injected into web pages
- `injected.js` - Page-level script for DOM manipulation

## Requirements

- macOS 11.0+ (Big Sur)
- Safari 14.0+
- Xcode 12.0+

## Notes

- Safari requires extensions to be signed with a valid Apple Developer certificate
- For development, you can enable "Allow Unsigned Extensions" in Safari's Develop menu
- The extension connects to the MCP Eyes browser bridge on `ws://127.0.0.1:3457`
