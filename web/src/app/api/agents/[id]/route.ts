/**
 * Agent by ID API Route
 *
 * GET /api/agents/[id] - Get agent details
 * POST /api/agents/[id] - Send command to agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { agentRegistry, NetworkUtils } from '@/lib/control-server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const agent = agentRegistry.getAgent(id);

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: agent.id,
    machineId: agent.machineId,
    machineName: agent.machineName,
    customerId: agent.customerId,
    osType: agent.osType,
    osVersion: agent.osVersion,
    arch: agent.arch,
    agentVersion: agent.agentVersion,
    state: agent.state,
    powerState: agent.powerState,
    isScreenLocked: agent.isScreenLocked,
    currentTask: agent.currentTask,
    isInternal: agent.isInternal,
    connectedAt: agent.connectedAt,
    lastPing: agent.lastPing,
    lastActivity: agent.lastActivity,
  });
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;

  // Check if request is from internal network
  const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const isInternal = NetworkUtils.isInternalIP(clientIP);

  if (!isInternal) {
    return NextResponse.json(
      { error: 'Control operations are only allowed from internal network' },
      { status: 403 }
    );
  }

  const agent = agentRegistry.getAgent(id);

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { method, params } = body;

    if (!method) {
      return NextResponse.json(
        { error: 'Method required' },
        { status: 400 }
      );
    }

    const result = await agentRegistry.sendCommand(id, method, params || {});
    return NextResponse.json({ result });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error }, { status: 500 });
  }
}
