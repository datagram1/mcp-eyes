/**
 * Connection Logs API
 *
 * GET /api/connections/[id]/logs - Get request logs for a connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connections/[id]/logs
 * Get paginated request logs for a specific connection
 */
export async function GET(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
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

    // First verify the connection belongs to this user
    const connection = await prisma.mcpConnection.findFirst({
      where: {
        id,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Parse query params for filtering/pagination
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const method = searchParams.get('method');
    const success = searchParams.get('success');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause
    type LogWhereClause = {
      connectionId: string;
      method?: string;
      success?: boolean;
      createdAt?: {
        gte?: Date;
        lte?: Date;
      };
    };

    const where: LogWhereClause = {
      connectionId: id,
    };

    if (method) {
      where.method = method;
    }

    if (success !== null && success !== undefined) {
      where.success = success === 'true';
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    // Fetch logs with pagination
    const [logs, total] = await Promise.all([
      prisma.mcpRequestLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          method: true,
          toolName: true,
          params: true,
          success: true,
          errorCode: true,
          errorMessage: true,
          durationMs: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      }),
      prisma.mcpRequestLog.count({ where }),
    ]);

    // Get method statistics
    const methodStats = await prisma.mcpRequestLog.groupBy({
      by: ['method'],
      where: { connectionId: id },
      _count: true,
    });

    // Get success/failure counts
    const successStats = await prisma.mcpRequestLog.groupBy({
      by: ['success'],
      where: { connectionId: id },
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
        successCount: successStats.find(s => s.success)?._count || 0,
        failureCount: successStats.find(s => !s.success)?._count || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching connection logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
