/**
 * Block Agent API
 *
 * POST /api/agents/[id]/block - Block an agent
 * DELETE /api/agents/[id]/block - Unblock an agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/agents/[id]/block
 * Block an agent - prevents it from connecting and receiving commands
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

  if (agent.state === 'BLOCKED') {
    return NextResponse.json(
      { error: 'Agent is already blocked' },
      { status: 400 }
    );
  }

  // Block the agent
  const updatedAgent = await prisma.agent.update({
    where: { id },
    data: {
      state: 'BLOCKED',
    },
  });

  // Note: Connected agent will be disconnected on next heartbeat
  // when license check returns 'blocked' status

  return NextResponse.json({
    success: true,
    message: 'Agent blocked successfully',
    agent: {
      id: updatedAgent.id,
      state: updatedAgent.state,
    },
  });
}

/**
 * DELETE /api/agents/[id]/block
 * Unblock an agent - allows it to reconnect
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

  if (agent.state !== 'BLOCKED') {
    return NextResponse.json(
      { error: 'Agent is not blocked' },
      { status: 400 }
    );
  }

  // Unblock the agent (return to PENDING state)
  const updatedAgent = await prisma.agent.update({
    where: { id },
    data: {
      state: 'PENDING',
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Agent unblocked successfully. It will need to be re-activated.',
    agent: {
      id: updatedAgent.id,
      state: updatedAgent.state,
    },
  });
}
