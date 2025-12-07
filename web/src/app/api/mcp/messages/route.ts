/**
 * Messages Endpoint for MCP SSE Transport (Legacy Open WebUI Support)
 *
 * POST /api/mcp/messages - Send MCP messages via SSE transport
 *
 * This endpoint receives JSON-RPC messages and forwards them to agents.
 * Used in conjunction with /api/mcp/sse for bidirectional communication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRegistry, MCPMessage, MCPError, trackAIConnection } from '@/lib/control-server';

// Server info for MCP initialize response
const SERVER_INFO = {
  name: 'ScreenControl',
  version: '1.0.0',
};

const CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
};

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id') ||
      request.nextUrl.searchParams.get('sessionId');
    const agentId = request.nextUrl.searchParams.get('agentId') ||
      request.headers.get('x-agent-id');
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const message: MCPMessage = await request.json();

    // Track activity if we have a session
    if (sessionId) {
      try {
        await trackAIConnection({
          sessionId,
          ipAddress: clientIP,
        });
      } catch {
        // Ignore tracking errors
      }
    }

    // Handle different MCP methods
    switch (message.method) {
      case 'initialize':
        return jsonRPCResponse(message.id, {
          protocolVersion: '2024-11-05',
          capabilities: CAPABILITIES,
          serverInfo: SERVER_INFO,
        });

      case 'initialized':
        return jsonRPCResponse(message.id, {});

      case 'tools/list':
        if (!agentId) {
          // Return aggregated tools from all connected agents
          const tools: unknown[] = [];
          const agents = agentRegistry.getAllAgents();

          for (const agent of agents) {
            try {
              const result = await agentRegistry.sendCommand(
                agent.id,
                'tools/list',
                {},
                { ipAddress: clientIP }
              );
              if (result && typeof result === 'object' && 'tools' in result) {
                const agentTools = (result as { tools: unknown[] }).tools;
                // Prefix tool names with agent name to avoid conflicts
                for (const tool of agentTools) {
                  if (tool && typeof tool === 'object' && 'name' in tool) {
                    tools.push({
                      ...tool,
                      name: `${agent.machineName || agent.machineId}__${(tool as { name: string }).name}`,
                      description: `[${agent.machineName || 'Agent'}] ${(tool as { description?: string }).description || ''}`,
                    });
                  }
                }
              }
            } catch {
              // Skip agents that fail
            }
          }

          return jsonRPCResponse(message.id, { tools });
        }
        return await forwardToAgent(agentId, message, clientIP);

      case 'tools/call':
        if (!agentId) {
          // Try to route based on tool name prefix (agent__tool)
          const toolName = (message.params as { name?: string })?.name || '';
          const match = toolName.match(/^(.+?)__(.+)$/);
          if (match) {
            const [, agentName, actualToolName] = match;
            // Find agent by name
            const agents = agentRegistry.getAllAgents();
            const targetAgent = agents.find(
              a => a.machineName === agentName || a.machineId === agentName
            );
            if (targetAgent) {
              // Rewrite params with actual tool name
              const newParams = { ...(message.params as object), name: actualToolName };
              const newMessage = { ...message, params: newParams };
              return await forwardToAgent(targetAgent.id, newMessage as MCPMessage, clientIP);
            }
          }
          return jsonRPCError(message.id, -32602, 'Agent ID required');
        }
        return await forwardToAgent(agentId, message, clientIP);

      case 'resources/list':
        return jsonRPCResponse(message.id, { resources: [] });

      case 'prompts/list':
        return jsonRPCResponse(message.id, { prompts: [] });

      case 'ping':
        return jsonRPCResponse(message.id, {
          pong: true,
          timestamp: new Date().toISOString(),
        });

      default:
        return jsonRPCError(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return jsonRPCError(undefined, -32700, `Parse error: ${error}`);
  }
}

/**
 * Forward a request to an agent
 */
async function forwardToAgent(
  agentId: string,
  message: MCPMessage,
  clientIP: string
): Promise<NextResponse> {
  const agent = agentRegistry.getAgent(agentId);

  if (!agent) {
    return jsonRPCError(message.id, -32602, `Agent not found: ${agentId}`);
  }

  try {
    const result = await agentRegistry.sendCommand(
      agentId,
      message.method!,
      message.params as Record<string, unknown>,
      { ipAddress: clientIP }
    );

    return jsonRPCResponse(message.id, result);
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return jsonRPCError(message.id, -32603, error);
  }
}

/**
 * Create a JSON-RPC success response
 */
function jsonRPCResponse(
  id: string | number | undefined,
  result: unknown
): NextResponse {
  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    result,
  });
}

/**
 * Create a JSON-RPC error response
 */
function jsonRPCError(
  id: string | number | undefined,
  code: number,
  message: string,
  data?: unknown
): NextResponse {
  const error: MCPError = { code, message };
  if (data !== undefined) {
    error.data = data;
  }

  return NextResponse.json({
    jsonrpc: '2.0',
    id,
    error,
  });
}
