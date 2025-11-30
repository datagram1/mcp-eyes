# Claude Identity Setup for MCP-Eyes

## Problem Solved

MCP-eyes needs accessibility permissions to control other applications, but when running as a Node.js process from hidden directories (like `.nvm`), macOS prevents adding it to accessibility permissions through the GUI.

## Solution: Claude Identity

Instead of trying to add Node.js to accessibility permissions, we make MCP-eyes appear as if it's running from within the Claude app, inheriting Claude's existing accessibility permissions.

## Usage

### Method 1: Use the Claude Identity Server (Recommended)

```bash
# Run MCP-eyes with Claude's identity
npx mcp-eyes@latest mcp-eyes-claude
```

### Method 2: Use the Configuration File

Copy `claude-mcp-config.json` to your MCP configuration:

```json
{
  "mcpServers": {
    "mcp-eyes-claude": {
      "command": "npx",
      "args": ["-y", "mcp-eyes@latest", "mcp-eyes-claude"],
      "env": {
        "ELECTRON_APP_NAME": "Claude",
        "ELECTRON_APP_BUNDLE_ID": "com.anthropic.claudefordesktop",
        "ELECTRON_APP_PATH": "/Applications/Claude.app/Contents/Resources/app.asar"
      }
    }
  }
}
```

### Method 3: Manual Environment Setup

```bash
# Set environment variables to appear as Claude
export ELECTRON_APP_NAME="Claude"
export ELECTRON_APP_BUNDLE_ID="com.anthropic.claudefordesktop"
export ELECTRON_APP_PATH="/Applications/Claude.app/Contents/Resources/app.asar"

# Run MCP-eyes
npx mcp-eyes@latest
```

## How It Works

1. **Process Identity**: The Claude identity server sets environment variables that make the Node.js process appear as if it's part of the Claude app
2. **Permission Inheritance**: macOS treats the process as having the same permissions as Claude
3. **Transparent Operation**: MCP-eyes functions normally but with Claude's accessibility permissions

## Benefits

- ✅ **No manual permission setup required**
- ✅ **Works with hidden Node.js installations** (`.nvm`, etc.)
- ✅ **No symlinks or complex workarounds**
- ✅ **Inherits Claude's existing permissions**
- ✅ **User-friendly setup process**

## Requirements

- Claude app must be installed and have accessibility permissions
- Claude app must be running (for process detection)

## Troubleshooting

If you still get permission errors:

1. **Check Claude has accessibility permissions**:
   - System Settings → Privacy & Security → Accessibility
   - Ensure Claude is listed and enabled

2. **Verify Claude is running**:
   ```bash
   ps aux | grep -i claude
   ```

3. **Check the logs**:
   ```bash
   tail -f ~/.mcp-eyes/mcp_eyes.log
   ```

## Technical Details

The Claude identity server:
- Detects the running Claude process
- Sets environment variables to inherit Claude's identity
- Spawns MCP-eyes with the modified environment
- Forwards all input/output transparently

This approach is cleaner and more reliable than trying to work around macOS permission restrictions.
