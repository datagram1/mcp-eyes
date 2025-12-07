/**
 * Activate Agent API
 *
 * POST /api/agents/[id]/activate - Activate a pending agent (PENDING → ACTIVE)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/agents/[id]/activate
 * Activate a pending agent and issue a license UUID
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

  // Check current state
  if (agent.state === 'ACTIVE') {
    return NextResponse.json(
      { error: 'Agent is already active' },
      { status: 400 }
    );
  }

  if (agent.state === 'BLOCKED') {
    return NextResponse.json(
      { error: 'Agent is blocked. Unblock it first before activating.' },
      { status: 400 }
    );
  }

  // Generate license UUID if not already assigned
  const licenseUuid = agent.licenseUuid || uuidv4();

  // Activate the agent
  const updatedAgent = await prisma.agent.update({
    where: { id },
    data: {
      state: 'ACTIVE',
      licenseUuid,
      activatedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Agent activated successfully',
    agent: {
      id: updatedAgent.id,
      state: updatedAgent.state,
      licenseUuid: updatedAgent.licenseUuid,
      activatedAt: updatedAgent.activatedAt,
    },
  });
}

/**
 * DELETE /api/agents/[id]/activate
 * Deactivate an active agent (ACTIVE → PENDING)
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

  if (agent.state !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'Agent is not active' },
      { status: 400 }
    );
  }

  // Deactivate the agent
  const updatedAgent = await prisma.agent.update({
    where: { id },
    data: {
      state: 'PENDING',
      // Keep licenseUuid for potential reactivation
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Agent deactivated successfully',
    agent: {
      id: updatedAgent.id,
      state: updatedAgent.state,
    },
  });
}
