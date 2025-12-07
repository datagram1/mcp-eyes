/**
 * Wake Agent API
 *
 * POST /api/agents/[id]/wake - Wake a sleeping agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { agentRegistry } from '@/lib/control-server';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/agents/[id]/wake
 * Wake a sleeping agent to make it active for commands
 */
export async function POST(
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

  // Check if agent is online
  if (agent.status !== 'ONLINE') {
    return NextResponse.json(
      { error: 'Agent is offline and cannot be woken' },
      { status: 400 }
    );
  }

  // Check if agent is sleeping
  if (agent.powerState !== 'SLEEP') {
    return NextResponse.json(
      { error: 'Agent is not sleeping', powerState: agent.powerState },
      { status: 400 }
    );
  }

  // Parse optional reason from request body
  let reason = 'user_request';
  try {
    const body = await request.json();
    if (body.reason) reason = body.reason;
  } catch {
    // No body or invalid JSON is fine
  }

  // Try to wake the agent via WebSocket
  const woken = agentRegistry.wakeAgent(id, reason);

  if (!woken) {
    // Agent might not be connected via WebSocket even if DB says ONLINE
    // This can happen if the server restarted
    return NextResponse.json(
      { error: 'Agent not connected to WebSocket server' },
      { status: 503 }
    );
  }

  // Update power state in database
  await prisma.agent.update({
    where: { id },
    data: { powerState: 'ACTIVE' },
  });

  return NextResponse.json({
    success: true,
    message: 'Agent woken successfully',
    powerState: 'ACTIVE',
  });
}
