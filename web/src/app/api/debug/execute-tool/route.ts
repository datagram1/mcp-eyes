/**
 * Debug Tool Execution API
 *
 * Only accessible when DEBUG_MODE=true with valid DEBUG_API_KEY
 * Allows direct tool execution on connected agents for testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRegistry } from '@/lib/control-server';

export const dynamic = 'force-dynamic';

function checkDebugAuth(request: NextRequest): boolean {
  // Only allow in debug mode
  if (process.env.DEBUG_MODE !== 'true') {
    return false;
  }

  // Check API key
  const authHeader = request.headers.get('Authorization');
  const apiKey = process.env.DEBUG_API_KEY;

  if (!apiKey || !authHeader) {
    return false;
  }

  // Support both "Bearer <key>" and direct key
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  return token === apiKey;
}

export async function POST(request: NextRequest) {
  // Security: Check debug auth
  if (!checkDebugAuth(request)) {
    return NextResponse.json(
      { error: 'Access denied - requires DEBUG_MODE=true and valid DEBUG_API_KEY' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { agentId, tool, arguments: toolArgs } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    if (!tool) {
      return NextResponse.json(
        { error: 'Missing tool parameter' },
        { status: 400 }
      );
    }

    // Get the agent
    const agent = agentRegistry.getAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: `Agent not found: ${agentId}` },
        { status: 404 }
      );
    }

    // Execute the tool
    console.log(`[Debug API] Executing tool ${tool} on agent ${agent.machineName || agent.machineId}`);

    const result = await agentRegistry.sendCommand(
      agentId,
      'tools/call',
      {
        name: tool,
        arguments: toolArgs || {},
      },
      {
        ipAddress: 'debug-api',
      }
    );

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        dbId: agent.dbId,
        hostname: agent.machineName,
        status: agent.socket.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
        state: agent.state,
        powerState: agent.powerState,
      },
      tool,
      result,
    });
  } catch (error) {
    console.error('[Debug API] Error executing tool:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Security: Check debug auth
  if (!checkDebugAuth(request)) {
    return NextResponse.json(
      { error: 'Access denied - requires DEBUG_MODE=true and valid DEBUG_API_KEY' },
      { status: 403 }
    );
  }

  // List connected agents and available tools
  const agents = agentRegistry.getAllAgents();
  const stats = agentRegistry.getStats();

  return NextResponse.json({
    stats,
    agents: agents.map(agent => ({
      id: agent.id,
      dbId: agent.dbId,
      hostname: agent.machineName,
      machineId: agent.machineId,
      osType: agent.osType,
      status: agent.socket.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
      state: agent.state,
      powerState: agent.powerState,
      ipAddress: agent.remoteAddress,
      tools: agent.tools?.length || 0,
      connectedAt: agent.connectedAt,
      lastPing: agent.lastPing,
    })),
    exampleRequest: {
      method: 'POST',
      url: '/api/debug/execute-tool',
      headers: {
        'Authorization': `Bearer ${process.env.DEBUG_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        agentId: 'agent-id-or-database-id',
        tool: 'desktop_screenshot',
        arguments: {
          format: 'png',
        },
      },
    },
  });
}
