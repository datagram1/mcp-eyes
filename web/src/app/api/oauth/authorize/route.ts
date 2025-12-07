/**
 * OAuth 2.1 Authorization Endpoint
 *
 * GET /api/oauth/authorize
 *
 * Handles the OAuth authorization flow:
 * 1. Validates the request parameters
 * 2. Checks if user is authenticated
 * 3. Redirects to login if needed
 * 4. Shows consent screen
 * 5. Generates authorization code and redirects back to client
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  getClient,
  validateClientRedirectUri,
  isValidCodeChallenge,
  parseScopes,
  validateScopes,
} from '@/lib/oauth';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-secret-change-me';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

// Logging helper
function logOAuth(stage: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[OAuth Authorize] ${stage} - ${timestamp}`);
  console.log('='.repeat(60));
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'object') {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`  ${key}: ${value}`);
    }
  });
}

interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  state?: string;
  resource?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Log the full incoming request
  logOAuth('INCOMING REQUEST', {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    allParams: Object.fromEntries(searchParams.entries()),
  });

  // Extract all parameters
  const params: AuthorizeParams = {
    client_id: searchParams.get('client_id') || '',
    redirect_uri: searchParams.get('redirect_uri') || '',
    response_type: searchParams.get('response_type') || '',
    code_challenge: searchParams.get('code_challenge') || '',
    code_challenge_method: searchParams.get('code_challenge_method') || 'S256',
    scope: searchParams.get('scope') || undefined,
    state: searchParams.get('state') || undefined,
    resource: searchParams.get('resource') || undefined,
  };

  logOAuth('PARSED PARAMS', params as unknown as Record<string, unknown>);

  // 1. Validate required parameters
  if (!params.client_id) {
    logOAuth('ERROR', { error: 'invalid_request', reason: 'Missing client_id parameter' });
    return errorResponse('invalid_request', 'Missing client_id parameter');
  }
  if (!params.redirect_uri) {
    logOAuth('ERROR', { error: 'invalid_request', reason: 'Missing redirect_uri parameter' });
    return errorResponse('invalid_request', 'Missing redirect_uri parameter');
  }
  if (params.response_type !== 'code') {
    logOAuth('ERROR', { error: 'unsupported_response_type', reason: `Got "${params.response_type}" instead of "code"` });
    return errorResponse('unsupported_response_type', 'Only response_type=code is supported');
  }

  // 2. Validate client exists and redirect_uri matches (needed before PKCE check)
  logOAuth('CLIENT LOOKUP', { client_id: params.client_id });
  const client = await getClient(params.client_id);
  if (!client) {
    logOAuth('ERROR', { error: 'invalid_client', reason: 'Unknown client_id', client_id: params.client_id });
    return errorResponse('invalid_client', 'Unknown client_id');
  }
  logOAuth('CLIENT FOUND', {
    clientDbId: client.id,
    clientName: client.clientName,
    registeredRedirectUris: client.redirectUris,
    requestedRedirectUri: params.redirect_uri,
  });
  if (!validateClientRedirectUri(client.redirectUris, params.redirect_uri)) {
    logOAuth('ERROR', {
      error: 'invalid_request',
      reason: 'redirect_uri does not match',
      registeredUris: client.redirectUris,
      requestedUri: params.redirect_uri,
    });
    return errorResponse('invalid_request', 'redirect_uri does not match registered URIs');
  }

  // 3. Check PKCE requirements based on client type
  // Confidential clients (client_secret_post) can skip PKCE
  // Public clients (none) MUST use PKCE
  const isConfidentialClient = client.tokenEndpointAuth === 'client_secret_post';

  if (params.code_challenge) {
    // If PKCE is provided, validate it
    if (params.code_challenge_method !== 'S256') {
      return errorResponse('invalid_request', 'Only code_challenge_method=S256 is supported');
    }
    if (!isValidCodeChallenge(params.code_challenge)) {
      return errorResponse('invalid_request', 'Invalid code_challenge format');
    }
  } else if (!isConfidentialClient) {
    // Public clients MUST use PKCE
    return errorResponse('invalid_request', 'Missing code_challenge parameter (PKCE required for public clients)');
  }
  // Note: Confidential clients can skip PKCE (they authenticate with client_secret)

  // 3. Parse and validate scopes
  const requestedScopes = params.scope ? parseScopes(params.scope) : [];
  const scopeValidation = validateScopes(requestedScopes);
  logOAuth('SCOPE VALIDATION', {
    requestedScopes,
    validScopes: scopeValidation.scopes,
    invalidScopes: scopeValidation.invalidScopes,
  });
  if (scopeValidation.invalidScopes.length > 0) {
    logOAuth('ERROR', { error: 'invalid_scope', invalidScopes: scopeValidation.invalidScopes });
    return redirectError(params.redirect_uri, 'invalid_scope', 'Unknown scope(s): ' + scopeValidation.invalidScopes.join(', '), params.state);
  }

  // Use default scopes if none specified
  const scopes: string[] = scopeValidation.scopes.length > 0
    ? scopeValidation.scopes
    : ['mcp:tools', 'mcp:resources', 'mcp:agents:read'];

  logOAuth('FINAL SCOPES', { scopes });

  // 4. Check user authentication
  const session = await getServerSession();
  logOAuth('SESSION CHECK', {
    hasSession: !!session,
    userEmail: session?.user?.email || 'NOT AUTHENTICATED',
  });
  if (!session?.user?.email) {
    // Store auth request in session and redirect to login
    const authRequestUrl = request.nextUrl.toString();
    const loginUrl = new URL('/login', APP_URL);
    loginUrl.searchParams.set('callbackUrl', authRequestUrl);
    logOAuth('REDIRECT TO LOGIN', { loginUrl: loginUrl.toString(), callbackUrl: authRequestUrl });
    return NextResponse.redirect(loginUrl);
  }

  // Get user from database
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    logOAuth('ERROR', { error: 'access_denied', reason: 'User account not found', email: session.user.email });
    return redirectError(params.redirect_uri, 'access_denied', 'User account not found', params.state);
  }

  logOAuth('USER FOUND', { userId: user.id, email: user.email });

  // 5. Extract the connection UUID from resource parameter
  let connectionId: string | null = null;
  if (params.resource) {
    logOAuth('RESOURCE CHECK', { resource: params.resource });
    const match = params.resource.match(/\/mcp\/([a-zA-Z0-9_-]+)\/?$/);
    if (match) {
      const endpointUuid = match[1];
      logOAuth('ENDPOINT LOOKUP', { endpointUuid });
      const connection = await prisma.mcpConnection.findUnique({
        where: { endpointUuid },
      });
      if (!connection) {
        logOAuth('ERROR', { error: 'invalid_request', reason: 'Invalid resource endpoint', endpointUuid });
        return redirectError(params.redirect_uri, 'invalid_request', 'Invalid resource endpoint', params.state);
      }
      logOAuth('CONNECTION FOUND', {
        connectionId: connection.id,
        connectionName: connection.name,
        connectionUserId: connection.userId,
        currentUserId: user.id,
        status: connection.status,
      });
      if (connection.userId !== user.id) {
        logOAuth('ERROR', { error: 'access_denied', reason: 'Resource does not belong to user' });
        return redirectError(params.redirect_uri, 'access_denied', 'Resource does not belong to user', params.state);
      }
      if (connection.status !== 'ACTIVE') {
        logOAuth('ERROR', { error: 'access_denied', reason: 'Resource is not active', status: connection.status });
        return redirectError(params.redirect_uri, 'access_denied', 'Resource is not active', params.state);
      }
      connectionId = connection.id;
    }
  }

  // 6. Create a signed JWT containing the authorization request for consent page
  const pendingRequest: Record<string, unknown> = {
    clientId: params.client_id,
    clientDbId: client.id,
    userId: user.id,
    redirectUri: params.redirect_uri,
    scope: scopes,
    resource: params.resource || `${APP_URL}/mcp`,
    state: params.state,
    isConfidentialClient,
  };

  // Only include PKCE if provided (confidential clients can skip it)
  if (params.code_challenge) {
    pendingRequest.codeChallenge = params.code_challenge;
    pendingRequest.codeChallengeMethod = params.code_challenge_method;
  }

  logOAuth('PENDING REQUEST', pendingRequest);

  // Sign with 10 minute expiry
  const requestId = jwt.sign(pendingRequest, JWT_SECRET, { expiresIn: '10m' });

  // 7. Redirect to consent page
  const consentUrl = new URL('/oauth/consent', APP_URL);
  consentUrl.searchParams.set('request_id', requestId);

  logOAuth('SUCCESS - REDIRECTING TO CONSENT', { consentUrl: consentUrl.toString() });
  return NextResponse.redirect(consentUrl);
}

function errorResponse(error: string, description: string): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400 }
  );
}

function redirectError(redirectUri: string, error: string, description: string, state?: string): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }
  return NextResponse.redirect(url);
}
