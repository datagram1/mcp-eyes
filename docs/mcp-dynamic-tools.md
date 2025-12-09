# MCP Dynamic Tool Updates

## Overview

ScreenControl implements the official MCP (Model Context Protocol) `notifications/tools/list_changed` feature, allowing clients like Claude web to automatically receive updates when the available tool list changes.

## Implementation

### Architecture

The dynamic tool update system consists of three main components:

1. **MCP Capabilities Declaration** - Server advertises support for `listChanged` notifications
2. **SSE Connection Manager** - Tracks active client connections for broadcasting
3. **Broadcast Integration** - Triggers notifications when agent tools change

### Components

#### 1. MCP Capabilities (`/mcp/{uuid}/route.ts`)

The server declares support for tool list change notifications:

```typescript
const MCP_CAPABILITIES = {
  tools: {
    listChanged: true  // Enables dynamic tool updates
  },
  resources: {},
  prompts: {},
};
```

This capability is included in the server's initialization response to MCP clients.

#### 2. SSE Connection Manager (`/lib/mcp-sse-manager.ts`)

Manages Server-Sent Events connections from MCP clients:

```typescript
class MCPSSEManager {
  private connections: Map<string, SSEConnection>;

  // Register new SSE connection
  addConnection(sessionId: string, connection: SSEConnection): void

  // Remove disconnected client
  removeConnection(sessionId: string): void

  // Broadcast notification to all clients on an endpoint
  broadcastToEndpoint(endpointUuid: string, notification: Record<string, unknown>): void

  // Get count of active connections
  getConnectionCount(endpointUuid?: string): number
}
```

**Key Features:**
- Maintains map of active SSE connections
- Each connection includes controller, encoder, and endpoint UUID
- Automatically handles failed sends (removes dead connections)
- Provides logging for debugging connection issues

#### 3. GET Handler Integration (`/mcp/{uuid}/route.ts`)

When a client opens an SSE connection via HTTP GET:

```typescript
start(controller) {
  // Register this connection with SSE manager
  sseManager.addConnection(sessionId, {
    sessionId,
    controller,
    encoder,
    connectionId: validation.connectionId,
    endpointUuid: uuid,
    connectedAt: new Date(),
  });

  // ... send initial notifications ...
},
```

And cleanup on disconnect:

```typescript
(request as any)._cleanup = () => {
  clearInterval(pingInterval);
  sseManager.removeConnection(sessionId);
};
```

#### 4. Agent Registry Integration (`/lib/control-server/agent-registry.ts`)

When agent tools are cached, broadcast to all active MCP connections:

```typescript
// After caching tools
agent.tools = toolsResult.tools || [];
console.log(`[Registry] Cached ${agent.tools.length} tools for ${agent.machineName}`);

// Broadcast to all active MCP connections
try {
  const mcpConnections = await prisma.mcpConnection.findMany({
    where: { status: 'ACTIVE' },
  });
  console.log(`[Registry] Found ${mcpConnections.length} active MCP connections`);
  for (const conn of mcpConnections) {
    broadcastMCPNotification(conn.endpointUuid, 'notifications/tools/list_changed');
  }
} catch (error) {
  console.error('[Registry] Failed to broadcast tool changes:', error);
}
```

### Notification Format

The notification sent to clients follows the MCP JSON-RPC specification:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

Clients receive this via the SSE stream as:

```
data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}

```

### Client Workflow

1. **Initial Connection:**
   - Client opens HTTP GET to `/mcp/{uuid}` with SSE headers
   - Server registers connection in `sseManager`
   - Server sends `notifications/initialized`

2. **Tool Changes:**
   - Agent reconnects or tools are refreshed
   - Agent registry caches new tool list
   - Server broadcasts `notifications/tools/list_changed` to all SSE connections
   - Client receives notification via SSE stream
   - Client calls `tools/list` to fetch updated tool list

3. **Disconnection:**
   - Client closes SSE connection
   - Server removes from `sseManager`
   - No more broadcasts sent to that client

## Logging

The implementation includes comprehensive logging for debugging:

```
[Registry] Cached 87 tools for Richard's MacBook Pro (470)
[Registry] Attempting to broadcast tools_changed notification to MCP clients
[Registry] Found 1 active MCP connections
[MCP SSE] Broadcast notifications/tools/list_changed to 1 client(s) on endpoint {uuid}
```

## Benefits

1. **No Reconnection Required** - Clients don't need to disconnect and reconnect to see new tools
2. **Immediate Updates** - Tool changes are pushed in real-time to connected clients
3. **MCP Compliant** - Follows official Model Context Protocol specification
4. **Efficient** - Only broadcasts to active connections, no polling needed

## Testing

To verify the feature is working:

1. **Check Capabilities:**
   ```bash
   curl http://localhost:3000/mcp/{uuid}
   ```

   Should show `"tools":{"listChanged":true}` in capabilities

2. **Monitor Broadcasts:**
   ```bash
   journalctl -u screencontrol -f | grep -E 'Attempting to broadcast|Found.*MCP'
   ```

   Should show broadcast attempts when agents reconnect

3. **Test with Claude Web:**
   - Connect to ScreenControl MCP server
   - Restart agent to trigger tool refresh
   - Claude should automatically see updated tools without reconnecting

## Architecture Notes

- **SSE Manager vs Database:**
  - Database (`McpConnection`) tracks MCP connection records
  - SSE Manager tracks only **active SSE streams** currently connected
  - Broadcast finds all ACTIVE connections in DB, then sends to their SSE streams

- **Why Both?**
  - Database provides persistence and authorization
  - SSE Manager provides in-memory access to live connections
  - A connection can exist in DB but have no active SSE stream

- **Broadcast Behavior:**
  - If no SSE streams are active, notification is not delivered
  - When client reconnects, they can call `tools/list` to get current state
  - No messages are queued for offline clients

## Files Modified

1. `/var/www/html/screencontrol/web/src/lib/mcp-sse-manager.ts` - NEW file
2. `/var/www/html/screencontrol/web/src/app/mcp/[uuid]/route.ts` - Modified
3. `/var/www/html/screencontrol/web/src/lib/control-server/agent-registry.ts` - Modified

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP Streamable HTTP Transport](https://spec.modelcontextprotocol.io/specification/transports/streamable-http/)
- [MCP Notifications](https://spec.modelcontextprotocol.io/specification/basic/lifecycle/#notifications)
