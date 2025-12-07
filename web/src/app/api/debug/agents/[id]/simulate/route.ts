/**
 * Debug Agent Simulation API Route
 *
 * POST /api/debug/agents/[id]/simulate - Simulate agent status changes
 *
 * Only available in debug mode (development or DEBUG_MODE=true)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { isDebugMode, isDebugUser } from '@/lib/debug';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/debug/agents/[id]/simulate - Simulate agent status
 *
 * Body: { status: 'ONLINE' | 'OFFLINE' }
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  // Check debug mode
  if (!isDebugMode()) {
    return NextResponse.json(
      { error: 'Debug mode not enabled' },
      { status: 403 }
    );
  }

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!isDebugUser(session.user.email)) {
    return NextResponse.json(
      { error: 'Debug access not allowed for this user' },
      { status: 403 }
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

  // Verify agent exists and belongs to user
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
    const { status } = body;

    // Validate status
    if (!status || !['ONLINE', 'OFFLINE'].includes(status)) {
      return NextResponse.json(
        { error: 'Status must be ONLINE or OFFLINE' },
        { status: 400 }
      );
    }

    // Update agent status
    const agent = await prisma.agent.update({
      where: { id },
      data: {
        status: status as 'ONLINE' | 'OFFLINE',
        lastSeenAt: status === 'ONLINE' ? new Date() : existingAgent.lastSeenAt,
        lastActivity: status === 'ONLINE' ? new Date() : existingAgent.lastActivity,
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        hostname: agent.hostname,
        status: agent.status,
        lastSeenAt: agent.lastSeenAt,
      },
    });
  } catch (err) {
    console.error('[Debug] Error simulating agent status:', err);
    return NextResponse.json(
      { error: 'Failed to simulate agent status' },
      { status: 500 }
    );
  }
}
