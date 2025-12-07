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

// Logging helper
function logOAuth(stage: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[OAuth Consent] ${stage} - ${timestamp}`);
  console.log('='.repeat(60));
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'object') {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`  ${key}: ${value}`);
    }
  });
}

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

  logOAuth('GET - INCOMING REQUEST', {
    url: request.url,
    hasRequestId: !!requestId,
  });

  if (!requestId) {
    logOAuth('ERROR', { error: 'Missing request_id' });
    return NextResponse.json(
      { error: 'Missing request_id' },
      { status: 400 }
    );
  }

  // Verify user is authenticated
  const session = await getServerSession();
  logOAuth('SESSION CHECK', {
    hasSession: !!session,
    userEmail: session?.user?.email || 'NOT AUTHENTICATED',
  });
  if (!session?.user?.email) {
    logOAuth('ERROR', { error: 'Not authenticated' });
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    // Decode and verify the request token
    const decoded = jwt.verify(requestId, JWT_SECRET) as PendingAuthRequest;
    logOAuth('DECODED REQUEST', decoded as unknown as Record<string, unknown>);

    // Verify the user matches
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.id !== decoded.userId) {
      logOAuth('ERROR', { error: 'Invalid request', reason: 'User mismatch', sessionUserId: user?.id, decodedUserId: decoded.userId });
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 403 }
      );
    }

    logOAuth('USER VERIFIED', { userId: user.id, email: user.email });

    // Get client info
    const client = await prisma.oAuthClient.findUnique({
      where: { id: decoded.clientDbId },
    });

    if (!client) {
      logOAuth('ERROR', { error: 'Client not found', clientDbId: decoded.clientDbId });
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      );
    }

    logOAuth('CLIENT FOUND', { clientId: client.clientId, clientName: client.clientName });

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

    logOAuth('SUCCESS - RETURNING CONSENT DATA', {
      clientName: client.clientName,
      scopes: decoded.scope,
      agentCount: agents.length,
    });

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
    logOAuth('ERROR', { error: 'Invalid or expired request', details: String(err) });
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

  logOAuth('POST - INCOMING CONSENT DECISION', {
    hasRequestId: !!request_id,
    allow,
  });

  if (!request_id) {
    logOAuth('ERROR', { error: 'Missing request_id' });
    return NextResponse.json(
      { error: 'Missing request_id' },
      { status: 400 }
    );
  }

  // Verify user is authenticated
  const session = await getServerSession();
  logOAuth('SESSION CHECK', {
    hasSession: !!session,
    userEmail: session?.user?.email || 'NOT AUTHENTICATED',
  });
  if (!session?.user?.email) {
    logOAuth('ERROR', { error: 'Not authenticated' });
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  try {
    // Decode and verify the request token
    const decoded = jwt.verify(request_id, JWT_SECRET) as PendingAuthRequest;
    logOAuth('DECODED REQUEST', decoded as unknown as Record<string, unknown>);

    // Verify the user matches
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user || user.id !== decoded.userId) {
      logOAuth('ERROR', { error: 'Invalid request', reason: 'User mismatch' });
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 403 }
      );
    }

    logOAuth('USER VERIFIED', { userId: user.id, email: user.email });

    // Build redirect URL
    const redirectUrl = new URL(decoded.redirectUri);

    if (!allow) {
      // User denied - redirect with error
      logOAuth('USER DENIED', { redirectUri: decoded.redirectUri });
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('error_description', 'User denied the authorization request');
      if (decoded.state) {
        redirectUrl.searchParams.set('state', decoded.state);
      }
      return NextResponse.json({ redirect: redirectUrl.toString() });
    }

    logOAuth('USER APPROVED', { redirectUri: decoded.redirectUri });

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
      logOAuth('CREATING NEW CONNECTION', { userId: user.id, clientName: client?.clientName });
      connection = await prisma.mcpConnection.create({
        data: {
          userId: user.id,
          name: (client?.clientName || 'AI') + ' Connection',
          clientName: client?.clientName,
          connectedClientId: decoded.clientId,
        },
      });
    }

    logOAuth('CONNECTION', { connectionId: connection.id, connectionName: connection.name });

    // Generate authorization code
    const authCode = generateAuthorizationCode();

    logOAuth('AUTH CODE GENERATED', {
      expiresAt: authCode.expiresAt.toISOString(),
      scope: decoded.scope,
      resource: decoded.resource,
    });

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

    logOAuth('SUCCESS - REDIRECTING WITH CODE', {
      redirectUrl: redirectUrl.toString().replace(/code=[^&]+/, 'code=REDACTED'),
    });

    return NextResponse.json({ redirect: redirectUrl.toString() });
  } catch (err) {
    logOAuth('ERROR', { error: 'Invalid or expired request', details: String(err) });
    console.error('[Consent] Error processing decision:', err);
    return NextResponse.json(
      { error: 'Invalid or expired request' },
      { status: 400 }
    );
  }
}
