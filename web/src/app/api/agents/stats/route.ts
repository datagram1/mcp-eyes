/**
 * Agent Statistics API
 *
 * GET /api/agents/stats - Get aggregate statistics for user's agents
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/stats
 * Get aggregate statistics for user's agents
 */
export async function GET(request: NextRequest) {
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

  // Get all statistics in parallel
  const [
    totalCount,
    onlineCount,
    byStatus,
    byState,
    byOS,
    byPowerState,
    recentlyActive,
    commandStats,
  ] = await Promise.all([
    // Total agents
    prisma.agent.count({
      where: { ownerUserId: user.id },
    }),

    // Online agents
    prisma.agent.count({
      where: { ownerUserId: user.id, status: 'ONLINE' },
    }),

    // By status
    prisma.agent.groupBy({
      by: ['status'],
      where: { ownerUserId: user.id },
      _count: true,
    }),

    // By state
    prisma.agent.groupBy({
      by: ['state'],
      where: { ownerUserId: user.id },
      _count: true,
    }),

    // By OS type
    prisma.agent.groupBy({
      by: ['osType'],
      where: { ownerUserId: user.id },
      _count: true,
    }),

    // By power state
    prisma.agent.groupBy({
      by: ['powerState'],
      where: { ownerUserId: user.id },
      _count: true,
    }),

    // Recently active (last 24 hours)
    prisma.agent.count({
      where: {
        ownerUserId: user.id,
        lastActivity: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Command statistics (last 7 days)
    prisma.commandLog.groupBy({
      by: ['status'],
      where: {
        agent: { ownerUserId: user.id },
        startedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      _count: true,
    }),
  ]);

  // Transform grouped data into objects
  const statusMap = byStatus.reduce((acc, curr) => {
    acc[curr.status] = curr._count;
    return acc;
  }, {} as Record<string, number>);

  const stateMap = byState.reduce((acc, curr) => {
    acc[curr.state] = curr._count;
    return acc;
  }, {} as Record<string, number>);

  const osMap = byOS.reduce((acc, curr) => {
    acc[curr.osType] = curr._count;
    return acc;
  }, {} as Record<string, number>);

  const powerStateMap = byPowerState.reduce((acc, curr) => {
    acc[curr.powerState] = curr._count;
    return acc;
  }, {} as Record<string, number>);

  const commandStatsMap = commandStats.reduce((acc, curr) => {
    acc[curr.status] = curr._count;
    return acc;
  }, {} as Record<string, number>);

  return NextResponse.json({
    summary: {
      total: totalCount,
      online: onlineCount,
      offline: totalCount - onlineCount,
      active: stateMap.ACTIVE || 0,
      pending: stateMap.PENDING || 0,
      blocked: stateMap.BLOCKED || 0,
      recentlyActive,
    },
    byStatus: statusMap,
    byState: stateMap,
    byOS: osMap,
    byPowerState: powerStateMap,
    commands: {
      last7Days: {
        byStatus: commandStatsMap,
        total: Object.values(commandStatsMap).reduce((a, b) => a + b, 0),
      },
    },
  });
}
