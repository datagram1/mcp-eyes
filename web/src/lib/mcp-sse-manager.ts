/**
 * MCP SSE Connection Manager
 * 
 * Manages Server-Sent Events connections for MCP notifications.
 * Allows broadcasting notifications/tools/list_changed to connected clients.
 */

// SSE Connection interface
interface SSEConnection {
  sessionId: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
  connectionId: string;
  endpointUuid: string;
  connectedAt: Date;
}

class MCPSSEManager {
  private connections: Map<string, SSEConnection> = new Map();

  addConnection(sessionId: string, connection: SSEConnection): void {
    this.connections.set(sessionId, connection);
    console.log(`[MCP SSE] Client connected: ${sessionId} (total: ${this.connections.size})`);
  }

  removeConnection(sessionId: string): void {
    this.connections.delete(sessionId);
    console.log(`[MCP SSE] Client disconnected: ${sessionId} (total: ${this.connections.size})`);
  }

  broadcastToEndpoint(endpointUuid: string, notification: Record<string, unknown>): void {
    const connected = this.getConnectionCount(endpointUuid);
    const method = (notification as { method?: string }).method ?? 'unknown';

    if (connected === 0) {
      console.log(`[MCP SSE] No connected clients for ${endpointUuid}; skipping broadcast of ${method}`);
      return;
    }

    let sent = 0;
    for (const [sessionId, conn] of this.connections.entries()) {
      if (conn.endpointUuid === endpointUuid) {
        try {
          const event = 'data: ' + JSON.stringify(notification) + '\n\n';
          conn.controller.enqueue(conn.encoder.encode(event));
          sent++;
        } catch (error) {
          console.error(`[MCP SSE] Failed to send to ${sessionId}:`, error);
          this.connections.delete(sessionId);
        }
      }
    }
    if (sent > 0) {
      console.log(`[MCP SSE] Broadcast ${method} to ${sent}/${connected} client(s) on endpoint ${endpointUuid}`);
    }
  }

  getConnectionCount(endpointUuid?: string): number {
    if (!endpointUuid) return this.connections.size;
    return Array.from(this.connections.values()).filter(c => c.endpointUuid === endpointUuid).length;
  }
}

// Global SSE manager instance
export const sseManager = new MCPSSEManager();

/**
 * Broadcast MCP notification to all connected clients on an endpoint
 * This is used to notify clients when tools/resources/prompts change
 */
export function broadcastMCPNotification(endpointUuid: string, method: string): void {
  const notification = {
    jsonrpc: '2.0' as const,
    method,
  };
  sseManager.broadcastToEndpoint(endpointUuid, notification);
}
