/**
 * Agent Logs API
 *
 * GET /api/agents/[id]/logs - Get command logs for an agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/[id]/logs
 * Get paginated command logs for a specific agent
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

  // Verify agent belongs to user
  const agent = await prisma.agent.findFirst({
    where: {
      id,
      ownerUserId: user.id,
    },
    select: { id: true },
  });

  if (!agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const method = searchParams.get('method');
  const status = searchParams.get('status');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  // Build where clause
  type CommandStatusType = 'PENDING' | 'SENT' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
  type LogWhereClause = {
    agentId: string;
    method?: string;
    status?: CommandStatusType;
    startedAt?: {
      gte?: Date;
      lte?: Date;
    };
  };

  const where: LogWhereClause = {
    agentId: id,
  };

  if (method) {
    where.method = method;
  }

  const validStatuses = ['PENDING', 'SENT', 'EXECUTING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED'];
  if (status && validStatuses.includes(status)) {
    where.status = status as CommandStatusType;
  }

  if (startDate || endDate) {
    where.startedAt = {};
    if (startDate) {
      where.startedAt.gte = new Date(startDate);
    }
    if (endDate) {
      where.startedAt.lte = new Date(endDate);
    }
  }

  // Fetch logs with pagination
  const [logs, total] = await Promise.all([
    prisma.commandLog.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        method: true,
        toolName: true,
        params: true,
        status: true,
        result: true,
        errorMessage: true,
        durationMs: true,
        ipAddress: true,
        startedAt: true,
        completedAt: true,
      },
    }),
    prisma.commandLog.count({ where }),
  ]);

  // Get method statistics
  const methodStats = await prisma.commandLog.groupBy({
    by: ['method'],
    where: { agentId: id },
    _count: true,
  });

  // Get status counts
  const statusStats = await prisma.commandLog.groupBy({
    by: ['status'],
    where: { agentId: id },
    _count: true,
  });

  return NextResponse.json({
    logs,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    },
    stats: {
      byMethod: methodStats.reduce((acc, curr) => {
        acc[curr.method] = curr._count;
        return acc;
      }, {} as Record<string, number>),
      byStatus: statusStats.reduce((acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      }, {} as Record<string, number>),
    },
  });
}
