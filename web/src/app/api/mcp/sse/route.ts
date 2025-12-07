/**
 * SSE Endpoint for MCP (Legacy Open WebUI Support)
 *
 * GET /api/mcp/sse - Establish SSE connection for receiving MCP events
 *
 * This endpoint provides backwards compatibility with Open WebUI and other
 * clients that use the SSE transport instead of Streamable HTTP.
 */

import { NextRequest } from 'next/server';
import { agentRegistry, trackAIConnection } from '@/lib/control-server';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get('agentId');
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';
  const userAgent = request.headers.get('user-agent') || undefined;

  // Generate a session ID for this SSE connection
  const sessionId = `sse_${uuidv4()}`;

  // Track AI connection in database
  let aiConnectionId: string | undefined;
  try {
    aiConnectionId = await trackAIConnection({
      sessionId,
      clientName: 'OpenWebUI',
      ipAddress: clientIP,
      userAgent,
    });
  } catch (err) {
    console.error('[SSE] Failed to track AI connection:', err);
  }

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const encoder = new TextEncoder();

      const sendEvent = (data: Record<string, unknown>) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send connection established event
      sendEvent({
        type: 'connection',
        sessionId,
        agentId,
        timestamp: new Date().toISOString(),
      });

      // If agent specified, check if online
      if (agentId) {
        const agent = agentRegistry.getAgent(agentId);
        if (agent) {
          sendEvent({
            type: 'agent_status',
            agentId,
            status: 'online',
            machineName: agent.machineName,
            osType: agent.osType,
          });
        } else {
          sendEvent({
            type: 'agent_status',
            agentId,
            status: 'offline',
          });
        }
      } else {
        // Send list of available agents
        const agents = agentRegistry.getAllAgents().map(a => ({
          id: a.dbId || a.id,
          machineName: a.machineName,
          osType: a.osType,
          state: a.state,
          powerState: a.powerState,
        }));
        sendEvent({
          type: 'agents_list',
          agents,
        });
      }

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        try {
          sendEvent({
            type: 'ping',
            timestamp: new Date().toISOString(),
          });
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Store cleanup function
      (request as unknown as { _cleanup?: () => void })._cleanup = () => {
        clearInterval(pingInterval);
      };
    },

    cancel() {
      // Cleanup on disconnect
      const cleanup = (request as unknown as { _cleanup?: () => void })._cleanup;
      if (cleanup) cleanup();
      console.log(`[SSE] Client disconnected: ${sessionId}`);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Session-Id': sessionId,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
