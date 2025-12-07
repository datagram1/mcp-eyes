/**
 * Connection Detail API
 *
 * GET    /api/connections/[id] - Get connection details
 * PATCH  /api/connections/[id] - Update connection (name, description, status)
 * DELETE /api/connections/[id] - Revoke connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/connections/[id]
 * Get detailed information about a specific connection
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

    const connection = await prisma.mcpConnection.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        _count: {
          select: {
            tokens: true,
            requestLogs: true,
          },
        },
        // Include recent request logs
        requestLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            method: true,
            toolName: true,
            success: true,
            errorMessage: true,
            durationMs: true,
            createdAt: true,
          },
        },
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Build the MCP endpoint URL
    const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';
    const mcpUrl = `${APP_URL}/mcp/${connection.endpointUuid}`;

    return NextResponse.json({
      connection: {
        ...connection,
        mcpUrl,
      },
    });
  } catch (error) {
    console.error('Error getting connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/connections/[id]
 * Update a connection's name, description, or status
 */
export async function PATCH(
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
    const body = await request.json();

    // First verify the connection belongs to this user
    const existing = await prisma.mcpConnection.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Don't allow updates to revoked connections
    if (existing.status === 'REVOKED') {
      return NextResponse.json(
        { error: 'Cannot update a revoked connection' },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: {
      name?: string;
      description?: string | null;
      status?: 'ACTIVE' | 'PAUSED';
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Name cannot be empty' },
          { status: 400 }
        );
      }
      if (body.name.length > 100) {
        return NextResponse.json(
          { error: 'Name must be 100 characters or less' },
          { status: 400 }
        );
      }
      updateData.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }

    if (body.status !== undefined) {
      if (!['ACTIVE', 'PAUSED'].includes(body.status)) {
        return NextResponse.json(
          { error: 'Status must be ACTIVE or PAUSED' },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    // Update the connection
    const connection = await prisma.mcpConnection.update({
      where: { id },
      data: updateData,
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
    });
  } catch (error) {
    console.error('Error updating connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/connections/[id]
 * Revoke a connection (soft delete)
 */
export async function DELETE(
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
    const existing = await prisma.mcpConnection.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    if (existing.status === 'REVOKED') {
      return NextResponse.json(
        { error: 'Connection is already revoked' },
        { status: 400 }
      );
    }

    // Revoke the connection and all associated tokens
    await prisma.$transaction([
      // Revoke all access tokens for this connection
      prisma.oAuthAccessToken.updateMany({
        where: { connectionId: id },
        data: {
          revokedAt: new Date(),
          revokedReason: 'connection_revoked',
        },
      }),
      // Update the connection status
      prisma.mcpConnection.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Connection revoked successfully',
    });
  } catch (error) {
    console.error('Error revoking connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
