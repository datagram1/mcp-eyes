/**
 * OAuth 2.1 Token Endpoint
 *
 * POST /api/oauth/token
 *
 * Handles token exchange and refresh:
 * - grant_type=authorization_code: Exchange auth code for tokens
 * - grant_type=refresh_token: Refresh an expired access token
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyCodeChallenge,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  isTokenExpired,
  TOKEN_CONFIG,
} from '@/lib/oauth';

export const dynamic = 'force-dynamic';

interface TokenRequestBody {
  grant_type: string;
  code?: string;
  code_verifier?: string;
  redirect_uri?: string;
  refresh_token?: string;
  client_id?: string;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: TokenRequestBody;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as unknown as TokenRequestBody;
    } else {
      body = await request.json() as TokenRequestBody;
    }

    const { grant_type } = body;

    if (grant_type === 'authorization_code') {
      return handleAuthorizationCodeGrant(body);
    } else if (grant_type === 'refresh_token') {
      return handleRefreshTokenGrant(body);
    } else {
      return errorResponse('unsupported_grant_type', 'Only authorization_code and refresh_token grants are supported');
    }
  } catch (error) {
    console.error('[OAuth Token] Error:', error);
    return errorResponse('server_error', 'Internal server error');
  }
}

async function handleAuthorizationCodeGrant(body: TokenRequestBody) {
  const { code, code_verifier, redirect_uri, client_id } = body;

  // Validate required parameters
  if (!code) {
    return errorResponse('invalid_request', 'Missing code parameter');
  }
  if (!code_verifier) {
    return errorResponse('invalid_request', 'Missing code_verifier parameter');
  }
  if (!redirect_uri) {
    return errorResponse('invalid_request', 'Missing redirect_uri parameter');
  }

  // Find the authorization code
  const codeHash = hashToken(code);
  const authCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: { code: codeHash },
    include: {
      client: true,
      user: true,
    },
  });

  if (!authCode) {
    return errorResponse('invalid_grant', 'Invalid authorization code');
  }

  // Check if code is expired
  if (isTokenExpired(authCode.expiresAt)) {
    return errorResponse('invalid_grant', 'Authorization code has expired');
  }

  // Check if code was already used
  if (authCode.usedAt) {
    // Security: Revoke all tokens issued with this code
    return errorResponse('invalid_grant', 'Authorization code has already been used');
  }

  // Verify PKCE code_verifier
  if (!verifyCodeChallenge(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    return errorResponse('invalid_grant', 'Invalid code_verifier');
  }

  // Verify redirect_uri matches
  if (redirect_uri !== authCode.redirectUri) {
    return errorResponse('invalid_grant', 'redirect_uri does not match');
  }

  // Verify client_id if provided
  if (client_id && client_id !== authCode.client.clientId) {
    return errorResponse('invalid_grant', 'client_id does not match');
  }

  // Mark code as used
  await prisma.oAuthAuthorizationCode.update({
    where: { id: authCode.id },
    data: { usedAt: new Date() },
  });

  // Find or create MCP connection for this user+resource
  let connection = await prisma.mcpConnection.findFirst({
    where: {
      userId: authCode.userId,
      status: 'ACTIVE',
    },
  });

  if (!connection) {
    // Create a new connection
    connection = await prisma.mcpConnection.create({
      data: {
        userId: authCode.userId,
        name: authCode.client.clientName + ' Connection',
        clientName: authCode.client.clientName,
        connectedClientId: authCode.client.clientId,
      },
    });
  }

  // Generate tokens
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();

  // Store tokens
  await prisma.oAuthAccessToken.create({
    data: {
      accessTokenHash: accessToken.hash,
      refreshTokenHash: refreshToken.hash,
      scope: authCode.scope,
      audience: authCode.resource,
      accessExpiresAt: accessToken.expiresAt,
      refreshExpiresAt: refreshToken.expiresAt,
      clientId: authCode.client.id,
      userId: authCode.userId,
      connectionId: connection.id,
    },
  });

  // Return token response
  return NextResponse.json({
    access_token: accessToken.token,
    token_type: 'Bearer',
    expires_in: TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME,
    refresh_token: refreshToken.token,
    scope: authCode.scope.join(' '),
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
    },
  });
}

async function handleRefreshTokenGrant(body: TokenRequestBody) {
  const { refresh_token } = body;

  if (!refresh_token) {
    return errorResponse('invalid_request', 'Missing refresh_token parameter');
  }

  // Find the token record
  const tokenHash = hashToken(refresh_token);
  const tokenRecord = await prisma.oAuthAccessToken.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: {
      connection: true,
    },
  });

  if (!tokenRecord) {
    return errorResponse('invalid_grant', 'Invalid refresh token');
  }

  // Check if revoked
  if (tokenRecord.revokedAt) {
    return errorResponse('invalid_grant', 'Token has been revoked');
  }

  // Check if expired
  if (tokenRecord.refreshExpiresAt && isTokenExpired(tokenRecord.refreshExpiresAt)) {
    return errorResponse('invalid_grant', 'Refresh token has expired');
  }

  // Check if connection is still active
  if (tokenRecord.connection.status !== 'ACTIVE') {
    return errorResponse('invalid_grant', 'Connection is no longer active');
  }

  // Generate new tokens (refresh token rotation)
  const newAccessToken = generateAccessToken();
  const newRefreshToken = generateRefreshToken();

  // Update token record with new tokens
  await prisma.oAuthAccessToken.update({
    where: { id: tokenRecord.id },
    data: {
      accessTokenHash: newAccessToken.hash,
      refreshTokenHash: newRefreshToken.hash,
      accessExpiresAt: newAccessToken.expiresAt,
      refreshExpiresAt: newRefreshToken.expiresAt,
      lastUsedAt: new Date(),
    },
  });

  // Return new tokens
  return NextResponse.json({
    access_token: newAccessToken.token,
    token_type: 'Bearer',
    expires_in: TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME,
    refresh_token: newRefreshToken.token,
    scope: tokenRecord.scope.join(' '),
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
    },
  });
}

function errorResponse(error: string, description: string) {
  return NextResponse.json(
    { error, error_description: description },
    { 
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * Handle OPTIONS for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
