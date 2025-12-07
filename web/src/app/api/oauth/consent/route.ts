/**
 * OAuth Consent API
 *
 * GET /api/oauth/consent?request_id=... - Get consent data for display
 * POST /api/oauth/consent - Process user's consent decision
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  generateAuthorizationCode,
  getScopeDescriptions,
  type ScopeName,
} from '@/lib/oauth';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';
const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret-change-me';

interface PendingAuthRequest {
  clientId: string;
  clientDbId: string;
  userId: string;
  redirectUri: string;
  scope: ScopeName[];
  codeChallenge?: string;      // Optional for confidential clients
  codeChallengeMethod?: string; // Optional for confidential clients
  isConfidentialClient?: boolean;
  resource: string;
  state?: string;
  exp: number;
}

/**
 * GET - Fetch consent data for a pending authorization request
 */
export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get('request_id');

  if (!requestId) {
    return NextResponse.json(
      { error: 'Missing request_id' },
      { status: 400 }
    );
  }

  // Verify user is authenticated
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    // Decode and verify the request token
    const decoded = jwt.verify(requestId, JWT_SECRET) as PendingAuthRequest;

    // Verify the user matches
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.id !== decoded.userId) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 403 }
      );
    }

    // Get client info
    const client = await prisma.oAuthClient.findUnique({
      where: { id: decoded.clientDbId },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    // Get user's agents
    const agents = await prisma.agent.findMany({
      where: { ownerUserId: user.id },
      select: {
        id: true,
        hostname: true,
        osType: true,
        status: true,
      },
      take: 10,
    });

    // Get scope descriptions
    const scopes = getScopeDescriptions(decoded.scope);

    return NextResponse.json({
      clientName: client.clientName,
      clientLogo: client.logoUri,
      clientUri: client.clientUri,
      scopes,
      agents: agents.map(a => ({
        id: a.id,
        hostname: a.hostname,
        osType: a.osType,
        status: a.status,
      })),
      requestId,
      redirectUri: decoded.redirectUri,
      state: decoded.state,
    });
  } catch (err) {
    console.error('[Consent] Error decoding request:', err);
    return NextResponse.json(
      { error: 'Invalid or expired request' },
      { status: 400 }
    );
  }
}

/**
 * POST - Process user's consent decision
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { request_id, allow } = body;

  if (!request_id) {
    return NextResponse.json(
      { error: 'Missing request_id' },
      { status: 400 }
    );
  }

  // Verify user is authenticated
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    // Decode and verify the request token
    const decoded = jwt.verify(request_id, JWT_SECRET) as PendingAuthRequest;

    // Verify the user matches
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.id !== decoded.userId) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 403 }
      );
    }

    // Build redirect URL
    const redirectUrl = new URL(decoded.redirectUri);

    if (!allow) {
      // User denied - redirect with error
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('error_description', 'User denied the authorization request');
      if (decoded.state) {
        redirectUrl.searchParams.set('state', decoded.state);
      }
      return NextResponse.json({ redirect: redirectUrl.toString() });
    }

    // User approved - generate authorization code

    // Find or create MCP connection
    let connection = await prisma.mcpConnection.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
      },
    });

    const client = await prisma.oAuthClient.findUnique({
      where: { id: decoded.clientDbId },
    });

    if (!connection) {
      connection = await prisma.mcpConnection.create({
        data: {
          userId: user.id,
          name: (client?.clientName || 'AI') + ' Connection',
          clientName: client?.clientName,
          connectedClientId: decoded.clientId,
        },
      });
    }

    // Generate authorization code
    const authCode = generateAuthorizationCode();

    // Store authorization code
    // Note: codeChallenge is only present if PKCE was used (public clients)
    // Confidential clients skip PKCE and use client_secret at token exchange
    await prisma.oAuthAuthorizationCode.create({
      data: {
        code: authCode.hash,
        codeChallenge: decoded.codeChallenge || '',  // Empty string for confidential clients
        codeChallengeMethod: decoded.codeChallengeMethod || 'none',  // 'none' for confidential clients
        redirectUri: decoded.redirectUri,
        scope: decoded.scope,
        resource: decoded.resource,
        state: decoded.state,
        clientId: decoded.clientDbId,
        userId: user.id,
        expiresAt: authCode.expiresAt,
      },
    });

    // Redirect with authorization code
    redirectUrl.searchParams.set('code', authCode.token);
    if (decoded.state) {
      redirectUrl.searchParams.set('state', decoded.state);
    }

    return NextResponse.json({ redirect: redirectUrl.toString() });
  } catch (err) {
    console.error('[Consent] Error processing decision:', err);
    return NextResponse.json(
      { error: 'Invalid or expired request' },
      { status: 400 }
    );
  }
}
