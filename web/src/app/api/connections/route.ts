/**
 * Connections API
 *
 * GET  /api/connections - List user's MCP connections
 * POST /api/connections - Create a new connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/connections
 * List all MCP connections for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from database
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

    // Parse query params for filtering/pagination
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: { userId: string; status?: 'ACTIVE' | 'PAUSED' | 'REVOKED' } = {
      userId: user.id,
    };

    if (status && ['ACTIVE', 'PAUSED', 'REVOKED'].includes(status)) {
      where.status = status as 'ACTIVE' | 'PAUSED' | 'REVOKED';
    }

    // Fetch connections with counts
    const [connections, total] = await Promise.all([
      prisma.mcpConnection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          endpointUuid: true,
          name: true,
          description: true,
          clientName: true,
          status: true,
          lastUsedAt: true,
          totalRequests: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              tokens: true,
              requestLogs: true,
            },
          },
        },
      }),
      prisma.mcpConnection.count({ where }),
    ]);

    return NextResponse.json({
      connections,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + connections.length < total,
      },
    });
  } catch (error) {
    console.error('Error listing connections:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/connections
 * Create a new MCP connection endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from database
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

    const body = await request.json();
    const { name, description } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: 'Name must be 100 characters or less' },
        { status: 400 }
      );
    }

    // Create connection
    const connection = await prisma.mcpConnection.create({
      data: {
        userId: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        endpointUuid: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });

    // Build the MCP endpoint URL
    const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';
    const mcpUrl = `${APP_URL}/mcp/${connection.endpointUuid}`;

    return NextResponse.json({
      connection: {
        ...connection,
        mcpUrl,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
