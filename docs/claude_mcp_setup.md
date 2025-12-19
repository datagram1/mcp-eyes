# Claude Code MCP Setup Guide

This guide explains how to configure ScreenControl as an MCP (Model Context Protocol) server for Claude Code and Claude Desktop.

## Overview

ScreenControl provides 90 tools to Claude Code via the MCP protocol:
- **Desktop tools**: Screenshots, mouse, keyboard, window management
- **Browser tools**: Read/interact with any browser tab (requires extension)
- **Filesystem tools**: Read, write, search, patch files
- **Shell tools**: Execute commands, interactive sessions
- **System tools**: System info, clipboard, window list

## Configuration Files

Claude Code uses a hierarchy of configuration files:

| Location | Scope | Priority |
|----------|-------|----------|
| `.mcp.json` (project directory) | Project-specific | Highest |
| `~/.claude.json` | Global (all projects) | Lower |

**Recommendation**: Use the global `~/.claude.json` for ScreenControl so it's available in all projects.

## Quick Setup

### 1. Install ScreenControl.app

Copy the app to `/Applications`:
```bash
cp -R /path/to/ScreenControl.app /Applications/
```

### 2. Configure Claude Code

Add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "screencontrol": {
      "type": "stdio",
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"],
      "env": {}
    }
  }
}
```

Or for project-specific config, create `.mcp.json` in your project:
```json
{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}
```

### 3. Restart Claude Code

After updating the config:
1. Run `/mcp` to see server status
2. Select "Reconnect" if needed
3. Verify tools are available (should show 90 tools)

## Configuration Details

### Full Configuration Options

```json
{
  "mcpServers": {
    "screencontrol": {
      "type": "stdio",
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"],
      "env": {
        "SCREENCONTROL_LOG_LEVEL": "debug"
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `type` | Transport type. Use `stdio` for local MCP |
| `command` | Path to the ScreenControl executable |
| `args` | Command line arguments. Must include `--mcp-stdio` |
| `env` | Optional environment variables |

### Important Paths

| Path | Description |
|------|-------------|
| `/Applications/ScreenControl.app` | Recommended install location |
| `~/Library/Developer/Xcode/DerivedData/...` | Debug builds (avoid in production) |
| `/Users/richardbrown/dev/screen_control/dist/ScreenControl.app` | Development builds |

**Warning**: Always use `/Applications/ScreenControl.app` in your config, not Xcode DerivedData paths which can become stale.

## Multi-Instance Support

Multiple Claude Code instances can share browser tools through a single GUI app:

```
┌─────────────────────────────────────────────────────────────────┐
│  Claude Code #1              Claude Code #2                     │
│       ↓                           ↓                             │
│  StdioMCPBridge #1          StdioMCPBridge #2                   │
│       │                           │                             │
│       └───────────┬───────────────┘                             │
│                   │ HTTP POST :3457                             │
│                   ▼                                             │
│          ScreenControl.app (GUI)                                │
│          BrowserWebSocketServer :3457                           │
│                   │                                             │
│                   ▼ WebSocket                                   │
│          Browser Extension                                      │
└─────────────────────────────────────────────────────────────────┘
```

**How it works**:
1. Each Claude Code instance spawns its own `StdioMCPBridge` process
2. All instances share browser tools via the GUI app on port 3457
3. The GUI app maintains the WebSocket connection to the browser extension

**Requirements**:
- ScreenControl.app must be running (check menu bar for icon)
- Browser extension must be installed and connected

## Troubleshooting

### MCP Server Failed

```
Status: ✘ failed
```

**Check**:
1. Path exists: `ls /Applications/ScreenControl.app`
2. Binary is signed: `codesign -v /Applications/ScreenControl.app`
3. Run manually to see errors:
   ```bash
   /Applications/ScreenControl.app/Contents/MacOS/ScreenControl --mcp-stdio
   ```

### Only 39 Tools (Missing Browser Tools)

Browser tools require:
1. **ScreenControl.app running** (GUI mode, not just --mcp-stdio)
   - Look for googly eyes icon in menu bar
   - If not running: `open /Applications/ScreenControl.app`

2. **Browser extension connected**
   - Check extension is installed (Firefox/Chrome/Safari)
   - Verify connection: `curl -X POST http://127.0.0.1:3457/command -H "Content-Type: application/json" -d '{"action":"getTabs","payload":{}}'`

### Code Signature Invalid

If you see crashes with "SIGKILL (Code Signature Invalid)":
```bash
# Re-sign the app
codesign --force --deep --sign - /Applications/ScreenControl.app
```

### Config Not Loading

1. Check config syntax: `cat ~/.claude.json | jq .`
2. Verify mcpServers section exists
3. Check for duplicate entries
4. Look in project `.mcp.json` for overrides

## Verifying Setup

### Check MCP Status
In Claude Code, run `/mcp`:
```
Screencontrol MCP Server
Status: ✓ connected
Tools: 90 tools
```

### Test Browser Tools
```bash
curl -s -X POST http://127.0.0.1:3457/command \
  -H "Content-Type: application/json" \
  -d '{"action":"getTabs","payload":{}}' | jq .
```

### Check Running Processes
```bash
# GUI app
pgrep -fl "ScreenControl.app"

# MCP stdio processes (one per Claude Code instance)
ps aux | grep "mcp-stdio"

# Port usage
lsof -i :3457  # Browser bridge
lsof -i :3458  # StdioMCPBridge local (optional)
lsof -i :3459  # ScreenControlService (remote mode)
```

## Permissions (macOS)

ScreenControl requires these permissions in System Preferences > Privacy & Security:

| Permission | Required For |
|------------|--------------|
| Screen Recording | Screenshots |
| Accessibility | Mouse, keyboard, window management |

Grant permissions to both:
- `/Applications/ScreenControl.app`
- The terminal running Claude Code (iTerm2, Terminal, etc.)

## Example Configurations

### Minimal (Local Only)
```json
{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    }
  }
}
```

### With Debug Logging
```json
{
  "mcpServers": {
    "screencontrol": {
      "type": "stdio",
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"],
      "env": {
        "SCREENCONTROL_LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Multiple MCP Servers
```json
{
  "mcpServers": {
    "screencontrol": {
      "command": "/Applications/ScreenControl.app/Contents/MacOS/ScreenControl",
      "args": ["--mcp-stdio"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## Related Documentation

- [README.md](../README.md) - Project overview and architecture
- [BROWSER_TOOLS_ARCHITECTURE.md](../BROWSER_TOOLS_ARCHITECTURE.md) - Browser tools internals
- [linux_agent_docs.md](linux_agent_docs.md) - Linux agent setup
- [windows_agent_install.md](windows_agent_install.md) - Windows agent setup

---

**Last Updated**: December 18, 2025
