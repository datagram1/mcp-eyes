/**
 * Connections API
 *
 * GET  /api/connections - List user's MCP connections
 * POST /api/connections - Create a new connection (auto-creates OAuth client)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

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

    // Generate OAuth client credentials
    const oauthClientId = uuidv4();
    const oauthClientSecret = crypto.randomBytes(32).toString('hex');
    const oauthClientSecretHash = crypto.createHash('sha256').update(oauthClientSecret).digest('hex');

    // Claude's redirect URIs
    const redirectUris = [
      'https://claude.ai/oauth/callback',
      'https://claude.ai/api/oauth/callback',
      'https://claude.ai/api/mcp/auth_callback',
    ];

    // Create OAuth client and connection in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the OAuth client first
      const oauthClient = await tx.oAuthClient.create({
        data: {
          clientId: oauthClientId,
          clientSecretHash: oauthClientSecretHash,
          clientName: name.trim(),
          clientUri: 'https://claude.ai',
          redirectUris,
          grantTypes: ['authorization_code', 'refresh_token'],
          responseTypes: ['code'],
          tokenEndpointAuth: 'client_secret_post',
          contacts: [],
          registeredByIp: `user:${user.id}`,
          registeredByAgent: 'MCP Connection Auto-Create',
        },
      });

      // Create the connection linked to the OAuth client
      const connection = await tx.mcpConnection.create({
        data: {
          userId: user.id,
          name: name.trim(),
          description: description?.trim() || null,
          status: 'ACTIVE',
          oauthClientId: oauthClient.id,
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

      return { connection, oauthClient };
    });

    // Build the MCP endpoint URL
    const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';
    const mcpUrl = `${APP_URL}/mcp/${result.connection.endpointUuid}`;

    return NextResponse.json({
      connection: {
        ...result.connection,
        mcpUrl,
        // Include OAuth credentials (secret only shown on creation!)
        oauth: {
          clientId: oauthClientId,
          clientSecret: oauthClientSecret,
        },
      },
      warning: 'Save the OAuth client_secret now - it cannot be retrieved later!',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
