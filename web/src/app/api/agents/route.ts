/**
 * Agents API Route
 *
 * GET /api/agents - List all agents (from database)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Check authentication
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get user
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

  // Parse query parameters for filtering
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status'); // ONLINE, OFFLINE
  const state = searchParams.get('state'); // PENDING, ACTIVE, BLOCKED, EXPIRED
  const osType = searchParams.get('osType'); // MACOS, WINDOWS, LINUX
  const search = searchParams.get('search'); // Search by hostname

  // Build where clause
  type AgentWhereClause = {
    ownerUserId: string;
    status?: 'ONLINE' | 'OFFLINE' | 'SUSPENDED';
    state?: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
    osType?: 'WINDOWS' | 'MACOS' | 'LINUX';
    hostname?: { contains: string; mode: 'insensitive' };
  };

  const where: AgentWhereClause = {
    ownerUserId: user.id,
  };

  if (status === 'ONLINE' || status === 'OFFLINE') {
    where.status = status;
  }
  if (state && ['PENDING', 'ACTIVE', 'BLOCKED', 'EXPIRED'].includes(state)) {
    where.state = state as AgentWhereClause['state'];
  }
  if (osType && ['MACOS', 'WINDOWS', 'LINUX'].includes(osType)) {
    where.osType = osType as AgentWhereClause['osType'];
  }
  if (search) {
    where.hostname = { contains: search, mode: 'insensitive' };
  }

  // Fetch agents from database
  const agents = await prisma.agent.findMany({
    where,
    orderBy: [
      { status: 'asc' }, // ONLINE first
      { lastSeenAt: 'desc' },
    ],
    select: {
      id: true,
      agentKey: true,
      hostname: true,
      machineId: true,
      customerId: true,
      licenseUuid: true,
      osType: true,
      osVersion: true,
      arch: true,
      agentVersion: true,
      status: true,
      state: true,
      powerState: true,
      isScreenLocked: true,
      hasDisplay: true,
      currentTask: true,
      ipAddress: true,
      firstSeenAt: true,
      lastSeenAt: true,
      lastActivity: true,
      activatedAt: true,
      label: true,
      groupName: true,
      tags: true,
    },
  });

  // Get aggregate stats
  const [totalCount, onlineCount, byState, byOS] = await Promise.all([
    prisma.agent.count({ where: { ownerUserId: user.id } }),
    prisma.agent.count({ where: { ownerUserId: user.id, status: 'ONLINE' } }),
    prisma.agent.groupBy({
      by: ['state'],
      where: { ownerUserId: user.id },
      _count: true,
    }),
    prisma.agent.groupBy({
      by: ['osType'],
      where: { ownerUserId: user.id },
      _count: true,
    }),
  ]);

  return NextResponse.json({
    agents,
    stats: {
      total: totalCount,
      online: onlineCount,
      offline: totalCount - onlineCount,
      byState: byState.reduce((acc, curr) => {
        acc[curr.state] = curr._count;
        return acc;
      }, {} as Record<string, number>),
      byOS: byOS.reduce((acc, curr) => {
        acc[curr.osType] = curr._count;
        return acc;
      }, {} as Record<string, number>),
    },
  });
}
