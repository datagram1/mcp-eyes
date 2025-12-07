/**
 * OAuth Client Management API
 *
 * GET /api/oauth/clients - List user's OAuth clients
 * POST /api/oauth/clients - Create a new OAuth client (for Claude, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

/**
 * GET - List OAuth clients created by the current user
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clients = await prisma.oAuthClient.findMany({
      where: {
        registeredByIp: `user:${session.user.id}`,
      },
      select: {
        id: true,
        clientId: true,
        clientName: true,
        clientUri: true,
        redirectUris: true,
        tokenEndpointAuth: true,
        createdAt: true,
        _count: {
          select: {
            tokens: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('[OAuth Clients] Error listing clients:', error);
    return NextResponse.json({ error: 'Failed to list clients' }, { status: 500 });
  }
}

/**
 * POST - Create a new OAuth client
 *
 * Body: {
 *   name: string,           // e.g., "Claude.ai", "My App"
 *   type: "claude" | "custom",
 *   redirectUri?: string,   // For custom apps
 * }
 *
 * Returns client_id and client_secret (secret shown only once!)
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, type = 'claude', redirectUri } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Generate credentials
    const clientId = uuidv4();
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const clientSecretHash = crypto.createHash('sha256').update(clientSecret).digest('hex');

    // Determine redirect URIs based on type
    let redirectUris: string[];
    if (type === 'claude') {
      // Claude's known redirect URIs
      redirectUris = [
        'https://claude.ai/oauth/callback',
        'https://claude.ai/api/oauth/callback',
      ];
    } else if (redirectUri) {
      redirectUris = [redirectUri];
    } else {
      return NextResponse.json(
        { error: 'redirectUri is required for custom clients' },
        { status: 400 }
      );
    }

    // Create the client
    const client = await prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash,
        clientName: name,
        clientUri: type === 'claude' ? 'https://claude.ai' : undefined,
        redirectUris,
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        tokenEndpointAuth: 'client_secret_post',
        contacts: [],
        registeredByIp: `user:${session.user.id}`,
        registeredByAgent: `Dashboard - ${type}`,
      },
    });

    // Return the credentials (secret only shown once!)
    return NextResponse.json({
      client: {
        id: client.id,
        clientId: client.clientId,
        clientSecret, // Only returned on creation!
        clientName: client.clientName,
        redirectUris: client.redirectUris,
        tokenEndpointAuth: client.tokenEndpointAuth,
        createdAt: client.createdAt,
      },
      warning: 'Save the client_secret now - it cannot be retrieved later!',
    }, { status: 201 });
  } catch (error) {
    console.error('[OAuth Clients] Error creating client:', error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}

/**
 * DELETE - Delete an OAuth client
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    // Verify ownership
    const client = await prisma.oAuthClient.findFirst({
      where: {
        clientId,
        registeredByIp: `user:${session.user.id}`,
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Delete associated tokens first
    await prisma.oAuthAccessToken.deleteMany({
      where: { clientId: client.id },
    });

    await prisma.oAuthAuthorizationCode.deleteMany({
      where: { clientId: client.id },
    });

    // Delete the client
    await prisma.oAuthClient.delete({
      where: { id: client.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OAuth Clients] Error deleting client:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
