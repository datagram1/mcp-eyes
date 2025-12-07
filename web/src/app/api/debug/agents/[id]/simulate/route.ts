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
    const { action, status } = body;

    // Handle different simulation actions
    if (action === 'expiration') {
      // Simulate license expiration
      const agent = await prisma.agent.update({
        where: { id },
        data: {
          state: 'EXPIRED',
        },
      });

      console.log(`[Debug] Agent ${id} expired: ${existingAgent.state} -> EXPIRED (simulated by ${user.id})`);

      return NextResponse.json({
        success: true,
        action: 'expiration',
        previousState: existingAgent.state,
        agent: {
          id: agent.id,
          hostname: agent.hostname,
          state: agent.state,
        },
      });
    }

    if (action === 'renewal') {
      // Simulate license renewal
      const agent = await prisma.agent.update({
        where: { id },
        data: {
          state: 'ACTIVE',
          activatedAt: new Date(),
        },
      });

      console.log(`[Debug] Agent ${id} renewed: ${existingAgent.state} -> ACTIVE (simulated by ${user.id})`);

      return NextResponse.json({
        success: true,
        action: 'renewal',
        previousState: existingAgent.state,
        agent: {
          id: agent.id,
          hostname: agent.hostname,
          state: agent.state,
          activatedAt: agent.activatedAt,
        },
      });
    }

    // Handle status simulation (ONLINE/OFFLINE)
    if (status) {
      if (!['ONLINE', 'OFFLINE'].includes(status)) {
        return NextResponse.json(
          { error: 'Status must be ONLINE or OFFLINE' },
          { status: 400 }
        );
      }

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
    }

    return NextResponse.json(
      { error: 'Must provide action (expiration, renewal) or status (ONLINE, OFFLINE)' },
      { status: 400 }
    );
  } catch (err) {
    console.error('[Debug] Error simulating agent:', err);
    return NextResponse.json(
      { error: 'Failed to simulate agent' },
      { status: 500 }
    );
  }
}
