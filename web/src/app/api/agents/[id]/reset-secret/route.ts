/**
 * Reset Agent Secret API Route
 *
 * POST /api/agents/[id]/reset-secret - Reset the agent's secret hash
 *
 * This allows an agent with a changed API key to re-register.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

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

  // Reset the agent secret hash
  await prisma.agent.update({
    where: { id },
    data: {
      agentSecretHash: null,
    },
  });

  console.log(`[Agent Reset Secret] Secret reset for agent ${existingAgent.hostname || existingAgent.machineId} by user ${session.user.email}`);

  return NextResponse.json({
    success: true,
    message: 'Agent secret has been reset. The agent can now re-register with a new API key.',
  });
}
