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
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  verifyCodeChallenge,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  isTokenExpired,
  TOKEN_CONFIG,
} from '@/lib/oauth';
import { RateLimiters, getClientIp, rateLimitExceeded, rateLimitHeaders } from '@/lib/rate-limit';

// Logging helper
function logOAuth(stage: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[OAuth Token] ${stage} - ${timestamp}`);
  console.log('='.repeat(60));
  Object.entries(data).forEach(([key, value]) => {
    // Don't log sensitive values in full
    if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('token') || key.toLowerCase().includes('code')) {
      const strVal = String(value);
      console.log(`  ${key}: ${strVal.substring(0, 8)}...${strVal.substring(strVal.length - 4)} (${strVal.length} chars)`);
    } else if (typeof value === 'object') {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`  ${key}: ${value}`);
    }
  });
}

/**
 * Verify client secret for confidential clients
 */
function verifyClientSecret(secret: string, hash: string): boolean {
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(secretHash), Buffer.from(hash));
}

export const dynamic = 'force-dynamic';

interface TokenRequestBody {
  grant_type: string;
  code?: string;
  code_verifier?: string;
  redirect_uri?: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
}

export async function POST(request: NextRequest) {
  // Log incoming request
  const clientIp = getClientIp(request);
  const contentType = request.headers.get('content-type') || '';

  logOAuth('INCOMING REQUEST', {
    url: request.url,
    method: request.method,
    contentType,
    clientIp,
    headers: Object.fromEntries(request.headers.entries()),
  });

  // Check rate limit (60 requests per minute per IP)
  const rateLimit = RateLimiters.oauthToken(clientIp);
  if (!rateLimit.success) {
    logOAuth('RATE LIMITED', { clientIp, remaining: rateLimit.remaining });
    return rateLimitExceeded(rateLimit);
  }

  try {
    let body: TokenRequestBody;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as unknown as TokenRequestBody;
      logOAuth('PARSED FORM DATA', body as unknown as Record<string, unknown>);
    } else {
      body = await request.json() as TokenRequestBody;
      logOAuth('PARSED JSON BODY', body as unknown as Record<string, unknown>);
    }

    const { grant_type } = body;

    if (grant_type === 'authorization_code') {
      logOAuth('GRANT TYPE', { grant_type: 'authorization_code' });
      return handleAuthorizationCodeGrant(body);
    } else if (grant_type === 'refresh_token') {
      logOAuth('GRANT TYPE', { grant_type: 'refresh_token' });
      return handleRefreshTokenGrant(body);
    } else {
      logOAuth('ERROR', { error: 'unsupported_grant_type', grant_type });
      return errorResponse('unsupported_grant_type', 'Only authorization_code and refresh_token grants are supported');
    }
  } catch (error) {
    logOAuth('ERROR', { error: 'server_error', details: String(error) });
    console.error('[OAuth Token] Error:', error);
    return errorResponse('server_error', 'Internal server error');
  }
}

async function handleAuthorizationCodeGrant(body: TokenRequestBody) {
  const { code, code_verifier, redirect_uri, client_id, client_secret } = body;

  logOAuth('AUTH CODE GRANT - START', {
    hasCode: !!code,
    hasCodeVerifier: !!code_verifier,
    redirect_uri,
    client_id,
    hasClientSecret: !!client_secret,
  });

  // Validate required parameters
  if (!code) {
    logOAuth('ERROR', { error: 'invalid_request', reason: 'Missing code parameter' });
    return errorResponse('invalid_request', 'Missing code parameter');
  }
  if (!redirect_uri) {
    logOAuth('ERROR', { error: 'invalid_request', reason: 'Missing redirect_uri parameter' });
    return errorResponse('invalid_request', 'Missing redirect_uri parameter');
  }

  // Find the authorization code
  const codeHash = hashToken(code);
  logOAuth('CODE LOOKUP', { codeHash: codeHash.substring(0, 16) + '...' });
  const authCode = await prisma.oAuthAuthorizationCode.findUnique({
    where: { code: codeHash },
    include: {
      client: true,
      user: true,
    },
  });

  if (!authCode) {
    logOAuth('ERROR', { error: 'invalid_grant', reason: 'Invalid authorization code - not found in database' });
    return errorResponse('invalid_grant', 'Invalid authorization code');
  }

  logOAuth('AUTH CODE FOUND', {
    authCodeId: authCode.id,
    clientId: authCode.client.clientId,
    clientName: authCode.client.clientName,
    userId: authCode.userId,
    userEmail: authCode.user.email,
    expiresAt: authCode.expiresAt.toISOString(),
    usedAt: authCode.usedAt?.toISOString() || 'NOT USED',
    redirectUri: authCode.redirectUri,
    scope: authCode.scope,
    resource: authCode.resource,
  });

  // Check if code is expired
  if (isTokenExpired(authCode.expiresAt)) {
    logOAuth('ERROR', { error: 'invalid_grant', reason: 'Authorization code has expired', expiresAt: authCode.expiresAt.toISOString() });
    return errorResponse('invalid_grant', 'Authorization code has expired');
  }

  // Check if code was already used
  if (authCode.usedAt) {
    logOAuth('ERROR', { error: 'invalid_grant', reason: 'Authorization code has already been used', usedAt: authCode.usedAt.toISOString() });
    // Security: Revoke all tokens issued with this code
    return errorResponse('invalid_grant', 'Authorization code has already been used');
  }

  // Verify redirect_uri matches
  if (redirect_uri !== authCode.redirectUri) {
    logOAuth('ERROR', {
      error: 'invalid_grant',
      reason: 'redirect_uri does not match',
      expected: authCode.redirectUri,
      received: redirect_uri,
    });
    return errorResponse('invalid_grant', 'redirect_uri does not match');
  }

  // Verify client_id if provided
  if (client_id && client_id !== authCode.client.clientId) {
    logOAuth('ERROR', {
      error: 'invalid_grant',
      reason: 'client_id does not match',
      expected: authCode.client.clientId,
      received: client_id,
    });
    return errorResponse('invalid_grant', 'client_id does not match');
  }

  // Client authentication: either PKCE (public) or client_secret (confidential)
  const isConfidentialClient = authCode.client.tokenEndpointAuth === 'client_secret_post' ||
                                authCode.client.tokenEndpointAuth === 'client_secret_basic';

  logOAuth('CLIENT AUTH CHECK', {
    tokenEndpointAuth: authCode.client.tokenEndpointAuth,
    isConfidentialClient,
    hasClientSecret: !!client_secret,
    hasCodeVerifier: !!code_verifier,
  });

  if (isConfidentialClient) {
    // Confidential client: require client_secret
    if (!client_secret) {
      logOAuth('ERROR', { error: 'invalid_client', reason: 'Missing client_secret for confidential client' });
      return errorResponse('invalid_client', 'Missing client_secret for confidential client');
    }
    if (!authCode.client.clientSecretHash) {
      logOAuth('ERROR', { error: 'invalid_client', reason: 'Client has no secret configured' });
      return errorResponse('invalid_client', 'Client has no secret configured');
    }
    if (!verifyClientSecret(client_secret, authCode.client.clientSecretHash)) {
      logOAuth('ERROR', { error: 'invalid_client', reason: 'Invalid client_secret' });
      return errorResponse('invalid_client', 'Invalid client_secret');
    }
    logOAuth('CLIENT SECRET VERIFIED', { success: true });
  } else {
    // Public client: require PKCE code_verifier
    if (!code_verifier) {
      logOAuth('ERROR', { error: 'invalid_request', reason: 'Missing code_verifier parameter' });
      return errorResponse('invalid_request', 'Missing code_verifier parameter');
    }
    const pkceValid = verifyCodeChallenge(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod);
    logOAuth('PKCE VERIFICATION', {
      codeChallengeMethod: authCode.codeChallengeMethod,
      codeChallenge: authCode.codeChallenge.substring(0, 16) + '...',
      valid: pkceValid,
    });
    if (!pkceValid) {
      logOAuth('ERROR', { error: 'invalid_grant', reason: 'Invalid code_verifier' });
      return errorResponse('invalid_grant', 'Invalid code_verifier');
    }
  }

  // Mark code as used
  logOAuth('MARKING CODE AS USED', { authCodeId: authCode.id });
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
    logOAuth('CREATING NEW CONNECTION', { userId: authCode.userId, clientName: authCode.client.clientName });
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

  logOAuth('CONNECTION', { connectionId: connection.id, connectionName: connection.name });

  // Generate tokens
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();

  logOAuth('TOKENS GENERATED', {
    accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
    refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
  });

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

  logOAuth('SUCCESS - TOKEN RESPONSE', {
    token_type: 'Bearer',
    expires_in: TOKEN_CONFIG.ACCESS_TOKEN_LIFETIME,
    scope: authCode.scope.join(' '),
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
