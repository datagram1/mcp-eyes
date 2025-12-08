# Agent Tool Advertisement Implementation Guide

## Overview

This document describes how agents should advertise their available tools to the control server via WebSocket. This allows dynamic tool discovery based on each agent's actual capabilities (e.g., some agents may not have browser extensions installed).

## Architecture

```
┌─────────────┐   tools/list    ┌─────────────┐    Cached     ┌──────────┐
│   Agent     │ ───────────────> │  Control    │  ──────────>  │   MCP    │
│  (macOS)    │ <─────────────── │   Server    │  <──────────  │  Proxy   │
└─────────────┘   {tools:[...]}  └─────────────┘   tools/list  └──────────┘
                                       │
                                       │ Stores in memory
                                       ▼
                                  ConnectedAgent.tools
```

## Current State (Server-Side) ✅

The control server is **already set up** to handle tool advertisement:

1. **Agent Registry** (`agent-registry.ts`):
   - `fetchAgentCapabilities(agentId)` - Sends `tools/list` command to agents
   - Called automatically during agent registration
   - Caches tools in `ConnectedAgent.tools` field

2. **MCP Endpoint** (`/mcp/[uuid]/route.ts`):
   - Modified to use cached tools from connected agents
   - Falls back to hardcoded tools if agent tools not available
   - Logs tool source for debugging

## What Needs to Be Done (Agent-Side) ❌

The macOS agent needs to be modified to respond to the `tools/list` command:

### 1. Add Handler for `tools/list` Command

In `AppDelegate.m`, modify the `executeToolFromWebSocket:` method:

```objective-c
- (NSDictionary *)executeToolFromWebSocket:(NSString *)toolName params:(NSDictionary *)params {
    NSLog(@"[Agent] Executing tool: %@ with params: %@", toolName, params);

    // Handle tools/list request
    if ([toolName isEqualToString:@"tools/list"]) {
        return @{
            @"tools": [self getAvailableTools]
        };
    }

    // ... existing tool execution code ...
}
```

### 2. Implement `getAvailableTools` Method

Create a method that returns the agent's available tools in MCP format:

```objective-c
- (NSArray *)getAvailableTools {
    NSMutableArray *tools = [NSMutableArray array];

    // ========================================
    // Desktop Tools (Always Available)
    // ========================================

    [tools addObject:@{
        @"name": @"desktop_screenshot",
        @"description": @"Take a screenshot of the entire desktop or a specific window",
        @"inputSchema": @{
            @"type": @"object",
            @"properties": @{
                @"agentId": @{@"type": @"string"},
                @"format": @{@"type": @"string", @"enum": @[@"png", @"jpeg"]},
                @"quality": @{@"type": @"number"},
            },
        },
    }];

    [tools addObject:@{
        @"name": @"mouse_click",
        @"description": @"Click at specific screen coordinates",
        @"inputSchema": @{
            @"type": @"object",
            @"properties": @{
                @"agentId": @{@"type": @"string"},
                @"x": @{@"type": @"number"},
                @"y": @{@"type": @"number"},
                @"button": @{@"type": @"string", @"enum": @[@"left", @"right", @"middle"]},
                @"clickCount": @{@"type": @"number"},
            },
            @"required": @[@"x", @"y"],
        },
    }];

    // ... Add all other desktop tools (mouse_move, mouse_drag, mouse_scroll,
    //     keyboard_type, keyboard_press, keyboard_shortcut, window_list,
    //     window_focus, app_launch, clipboard_read, clipboard_write, etc.)

    // ========================================
    // Browser Tools (Only if available)
    // ========================================

    if ([self.browserBridge isAvailable]) {
        NSLog(@"[Agent] Browser bridge available - advertising browser tools");

        [tools addObject:@{
            @"name": @"browser_navigate",
            @"description": @"Navigate browser to a URL",
            @"inputSchema": @{
                @"type": @"object",
                @"properties": @{
                    @"agentId": @{@"type": @"string"},
                    @"url": @{@"type": @"string"},
                },
                @"required": @[@"url"],
            },
        }];

        [tools addObject:@{
            @"name": @"browser_click",
            @"description": @"Click an element in the browser by selector or text",
            @"inputSchema": @{
                @"type": @"object",
                @"properties": @{
                    @"agentId": @{@"type": @"string"},
                    @"selector": @{@"type": @"string"},
                    @"text": @{@"type": @"string"},
                    @"index": @{@"type": @"number"},
                },
            },
        }];

        // ... Add all other browser tools (browser_fill, browser_screenshot,
        //     browser_get_text, browser_get_elements, browser_select, browser_wait,
        //     browser_back, browser_forward, browser_refresh, browser_tabs, browser_evaluate)
    } else {
        NSLog(@"[Agent] Browser bridge NOT available - skipping browser tools");
    }

    NSLog(@"[Agent] Advertising %lu tools to control server", (unsigned long)tools.count);
    return tools;
}
```

### 3. Check Browser Bridge Availability

Ensure you have a method to check if the browser bridge is available:

```objective-c
- (BOOL)isBrowserBridgeAvailable {
    // Check if browser WebSocket server is running
    if (!self.browserBridge || !self.browserBridge.isRunning) {
        return NO;
    }

    // Check if any browser extension is connected
    if (self.browserBridge.connectedClients.count == 0) {
        return NO;
    }

    return YES;
}
```

## MCP Tool Format

Each tool should be a dictionary with:

- **name** (string): Tool identifier (e.g., "browser_navigate")
- **description** (string): Human-readable description of what the tool does
- **inputSchema** (object): JSON Schema defining the tool's parameters
  - **type**: "object"
  - **properties**: Dict of parameter definitions
  - **required**: Array of required parameter names (optional)

Example:

```objective-c
@{
    @"name": @"browser_navigate",
    @"description": @"Navigate browser to a URL",
    @"inputSchema": @{
        @"type": @"object",
        @"properties": @{
            @"agentId": @{@"type": @"string", @"description": @"Target agent ID"},
            @"url": @{@"type": @"string", @"description": @"URL to navigate to"},
        },
        @"required": @[@"url"],
    },
}
```

## Testing

### 1. Check Agent Tool Advertisement

After implementing, check the control server logs when the agent connects:

```bash
sudo journalctl -u screencontrol -f
```

You should see:
```
[Registry] Cached X tools for {agent-name}
```

### 2. Verify Tools in MCP Response

When Claude queries for tools, check the logs:

```
[MCP Endpoint] USING AGENT TOOLS
  agentCount: 1
  toolCount: 42
  toolNames: ['desktop_screenshot', 'mouse_click', ..., 'browser_navigate', ...]
```

If browser bridge is not available:
```
[MCP Endpoint] USING AGENT TOOLS
  agentCount: 1
  toolCount: 27
  toolNames: ['desktop_screenshot', 'mouse_click', ...] (no browser tools)
```

### 3. Debug API

Use the debug API to check advertised tools:

```bash
curl -s -H "Authorization: Bearer YOUR_API_KEY" \
  "http://localhost:3002/api/debug/execute-tool?agentId=YOUR_AGENT_ID" | \
  jq -r '.tools[].name'
```

## Fallback Behavior

If the agent doesn't respond to `tools/list` or hasn't connected yet:

- The MCP endpoint falls back to a **hardcoded tool list**
- This ensures Claude always has tools available
- Logs will show: `USING DEFAULT TOOLS - No tools advertised by agents yet`

Once the agent advertises tools:

- MCP endpoint uses **agent's actual tools**
- Logs will show: `USING AGENT TOOLS - {count} tools from {n} agents`

## Benefits

1. **Dynamic Capabilities**: Each agent advertises only what it can actually do
2. **Browser Extension Optional**: Agents without browser extensions won't advertise browser tools
3. **Future-Proof**: Easy to add new tools without server changes
4. **Multi-Agent Aggregation**: Server aggregates tools from all online agents
5. **Graceful Degradation**: Falls back to hardcoded list if needed

## Troubleshooting

**Problem**: Tools not showing up

**Solution**:
1. Check agent is connected: `[Registry] Agent registered`
2. Check agent responded to tools/list: `[Registry] Cached X tools for {agent}`
3. Check MCP logs: Should show `USING AGENT TOOLS` not `USING DEFAULT TOOLS`

**Problem**: Browser tools showing even when extension not installed

**Solution**:
- Ensure `isBrowserBridgeAvailable` checks both WebSocket server AND connected clients
- Only add browser tools inside the `if` block when bridge is truly available

**Problem**: Tools disappearing after agent reconnect

**Solution**:
- Tools are cached in memory, not database
- Agent must re-advertise tools on each connection
- This is by design - ensures tools reflect current agent state

## Next Steps

1. Implement `getAvailableTools()` in agent
2. Add handler for `tools/list` command
3. Test with browser extension installed and uninstalled
4. Verify Claude can see the correct tool list
5. Monitor logs to ensure tool advertisement is working
