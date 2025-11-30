# MCP Eyes Logging System

## Overview

MCP Eyes now includes a comprehensive logging system that captures crashes, errors, and operational data to help diagnose issues when they occur.

## Log File Location

The log file is automatically created at:
```
~/.mcp-eyes/mcp_eyes.log
```

This location is chosen to avoid permission issues and is easily accessible for debugging.

## What Gets Logged

### Session Information
- **Session Start**: Process information, memory usage, Node.js version, platform details
- **Session End**: Final memory usage, uptime statistics

### Tool Execution
- **Successful Operations**: Tool name, arguments, results
- **Failed Operations**: Tool name, arguments, error details with stack traces

### Application Interactions
- **Focus Operations**: Application details when focusing apps
- **Click Operations**: Coordinates, button type, target application
- **Screenshot Operations**: Dimensions, format, target application
- **Close Operations**: Application details, close method used

### Permission Checks
- **Screen Recording**: Authorization status
- **Accessibility**: Authorization status

### Server Events
- **Startup**: Server initialization and connection status
- **Shutdown**: Graceful shutdown events

### Error Handling
- **Uncaught Exceptions**: Full stack traces with context
- **Unhandled Promise Rejections**: Detailed error information
- **Process Warnings**: Node.js warnings
- **Crashes**: Complete system state at crash time

## Log Format

All log entries are in JSON format for easy parsing and analysis:

```json
{
  "timestamp": "2025-09-17T15:47:37.102Z",
  "level": 3,
  "message": "Tool execution failed: failingTool",
  "context": {
    "tool": "failingTool",
    "args": {"param1": "value1"},
    "result": null,
    "error": "Tool failed"
  },
  "stack": "Error: Tool failed\n    at ...",
  "pid": 19573,
  "hostname": "imp-42.electricimp.com",
  "sessionId": "session_1758124057096_b4srjdexy"
}
```

## Log Levels

- **0 (DEBUG)**: Detailed debugging information
- **1 (INFO)**: General operational information
- **2 (WARN)**: Warning messages
- **3 (ERROR)**: Error conditions
- **4 (FATAL)**: Critical errors and crashes

## Crash Detection

The system automatically captures:
- **Memory Usage**: RSS, heap total, heap used, external memory
- **Process Information**: PID, uptime, Node.js version
- **System Information**: Platform, architecture, hostname
- **Stack Traces**: Complete error stack traces
- **Context**: Additional context about what was happening

## Global Error Handlers

The logging system sets up global handlers for:
- `uncaughtException`: Catches unhandled exceptions
- `unhandledRejection`: Catches unhandled promise rejections
- `warning`: Catches Node.js warnings
- `SIGINT`/`SIGTERM`: Graceful shutdown handling
- `exit`: Process exit logging

## Usage in Development

When debugging issues:

1. **Check the log file** for detailed error information
2. **Look for FATAL level entries** to identify crashes
3. **Examine stack traces** to understand error locations
4. **Review tool execution logs** to see what operations were attempted
5. **Check permission status** to identify authorization issues

## Log File Management

- Log files are automatically created and managed
- Each session gets a unique session ID for tracking
- Log entries are appended to the file (no rotation by default)
- The system gracefully handles log file write failures by falling back to console output

## Integration

The logging system is automatically integrated into all MCP Eyes servers:
- **Basic Server** (`mcp-eyes-basic`)
- **Advanced Server** (`mcp-eyes`)
- **Main Server** (`index.ts`)

No additional configuration is required - logging starts automatically when any server starts.
