/**
 * Agent by ID API Route
 *
 * GET /api/agents/[id] - Get agent details
 * PATCH /api/agents/[id] - Update agent state
 * DELETE /api/agents/[id] - Delete agent
 * POST /api/agents/[id] - Send command to agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { agentRegistry, NetworkUtils } from '@/lib/control-server';
// Note: agentRegistry is used for POST (sending commands) and PATCH (notifying connected agents)

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id] - Get agent details from database
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  const { id } = await context.params;

  const agent = await prisma.agent.findFirst({
    where: {
      id,
      ownerUserId: user.id,
    },
  });

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ agent });
}

/**
 * PATCH /api/agents/[id] - Update agent state
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  const { id } = await context.params;

  // Verify agent belongs to user
  const existingAgent = await prisma.agent.findFirst({
    where: {
      id,
      ownerUserId: user.id,
    },
  });

  if (!existingAgent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const { state, label, groupName, tags } = body;

    // Build update data
    type UpdateData = {
      state?: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
      activatedAt?: Date | null;
      label?: string;
      groupName?: string;
      tags?: string[];
    };

    const updateData: UpdateData = {};

    // Handle state changes
    if (state) {
      const validStates = ['PENDING', 'ACTIVE', 'BLOCKED', 'EXPIRED'];
      if (!validStates.includes(state)) {
        return NextResponse.json(
          { error: 'Invalid state' },
          { status: 400 }
        );
      }
      updateData.state = state;

      // Set activatedAt when activating
      if (state === 'ACTIVE' && existingAgent.state !== 'ACTIVE') {
        updateData.activatedAt = new Date();
      }
      // Clear activatedAt when deactivating
      if (state === 'PENDING' && existingAgent.state === 'ACTIVE') {
        updateData.activatedAt = null;
      }
    }

    // Handle other updates
    if (label !== undefined) updateData.label = label;
    if (groupName !== undefined) updateData.groupName = groupName;
    if (tags !== undefined) updateData.tags = tags;

    const agent = await prisma.agent.update({
      where: { id },
      data: updateData,
    });

    // Notify connected agent of state change via WebSocket if connected
    const connectedAgent = agentRegistry.getAgent(id);
    if (connectedAgent && state) {
      // The agent will be notified on next heartbeat
      // Or we could send a direct message here if needed
    }

    return NextResponse.json({ agent });
  } catch (err) {
    console.error('[Agent PATCH] Error:', err);
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/[id] - Delete agent
 */
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  }

  const { id } = await context.params;

  // Verify agent belongs to user
  const existingAgent = await prisma.agent.findFirst({
    where: {
      id,
      ownerUserId: user.id,
    },
  });

  if (!existingAgent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  await prisma.agent.delete({
    where: { id },
  });

  // Note: If agent is connected via WebSocket, it will be disconnected
  // on next heartbeat when the license check fails (agent not found)

  return NextResponse.json({ success: true });
}

/**
 * POST /api/agents/[id] - Send command to agent (internal network only)
 */
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
      { error: 'Agent not found or not connected' },
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
