/**
 * MCP API Route
 *
 * POST /api/mcp - Handle MCP JSON-RPC requests
 *
 * This is the Streamable HTTP endpoint for AI/LLM clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRegistry, MCPMessage, MCPError } from '@/lib/control-server';

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
    const message: MCPMessage = await request.json();
    const agentId = request.nextUrl.searchParams.get('agentId');

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
          return jsonRPCError(message.id, -32602, 'Agent ID required');
        }
        return await forwardToAgent(agentId, message);

      case 'tools/call':
        if (!agentId) {
          return jsonRPCError(message.id, -32602, 'Agent ID required');
        }
        return await forwardToAgent(agentId, message);

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
  message: MCPMessage
): Promise<NextResponse> {
  const agent = agentRegistry.getAgent(agentId);

  if (!agent) {
    return jsonRPCError(message.id, -32602, `Agent not found: ${agentId}`);
  }

  try {
    const result = await agentRegistry.sendCommand(
      agentId,
      message.method!,
      message.params as Record<string, unknown>
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
