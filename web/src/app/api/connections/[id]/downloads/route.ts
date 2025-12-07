/**
 * Download History API Route
 *
 * GET /api/connections/[id]/downloads - Get download history for a connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connections/[id]/downloads
 * Get download history for a connection
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

  // Verify connection belongs to user
  const connection = await prisma.mcpConnection.findFirst({
    where: {
      id,
      userId: user.id,
    },
    select: {
      id: true,
      endpointUuid: true,
    },
  });

  if (!connection) {
    return NextResponse.json(
      { error: 'Connection not found' },
      { status: 404 }
    );
  }

  // Parse query params
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  // Fetch download history (customerId is the endpointUuid)
  const [downloads, total] = await Promise.all([
    prisma.installerDownload.findMany({
      where: {
        userId: user.id,
        customerId: connection.endpointUuid,
      },
      orderBy: {
        downloadedAt: 'desc',
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        platform: true,
        variant: true,
        version: true,
        ipAddress: true,
        userAgent: true,
        downloadedAt: true,
      },
    }),
    prisma.installerDownload.count({
      where: {
        userId: user.id,
        customerId: connection.endpointUuid,
      },
    }),
  ]);

  // Get platform breakdown stats
  const platformStats = await prisma.installerDownload.groupBy({
    by: ['platform'],
    where: {
      userId: user.id,
      customerId: connection.endpointUuid,
    },
    _count: true,
  });

  return NextResponse.json({
    downloads,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + downloads.length < total,
    },
    stats: {
      total,
      byPlatform: platformStats.reduce((acc, curr) => {
        acc[curr.platform] = curr._count;
        return acc;
      }, {} as Record<string, number>),
    },
  });
}
