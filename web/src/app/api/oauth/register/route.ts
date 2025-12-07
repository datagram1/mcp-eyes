/**
 * OAuth Dynamic Client Registration (RFC 7591)
 *
 * POST /api/oauth/register
 *
 * Allows AI tools to dynamically register as OAuth clients.
 * This is required for Claude.ai and other MCP clients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { registerClient, type ClientRegistrationRequest } from '@/lib/oauth';
import { RateLimiters, getClientIp, rateLimitExceeded, rateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Logging helper
function logRegister(stage: string, data: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[OAuth Register] ${stage} - ${timestamp}`);
  console.log('='.repeat(60));
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'object') {
      console.log(`  ${key}:`, JSON.stringify(value, null, 2));
    } else {
      console.log(`  ${key}: ${value}`);
    }
  });
}

export async function POST(request: NextRequest) {
  // Get client IP for rate limiting and tracking
  const ipAddress = getClientIp(request);

  logRegister('INCOMING REQUEST', {
    ipAddress,
    userAgent: request.headers.get('user-agent'),
  });

  // Check rate limit (10 registrations per hour per IP)
  const rateLimit = RateLimiters.oauthRegister(ipAddress);
  if (!rateLimit.success) {
    logRegister('RATE LIMITED', { ipAddress });
    return rateLimitExceeded(rateLimit);
  }

  try {
    const body = await request.json() as ClientRegistrationRequest;
    const userAgent = request.headers.get('user-agent') || undefined;

    logRegister('REQUEST BODY', body as unknown as Record<string, unknown>);

    // Register the client
    const result = await registerClient(body, { ipAddress, userAgent });

    logRegister('REGISTRATION RESULT', result as unknown as Record<string, unknown>);

    // Check if it's an error response
    if ('error' in result) {
      return NextResponse.json(result, { status: 400 });
    }

    // Return successful registration with rate limit headers
    return NextResponse.json(result, {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...rateLimitHeaders(rateLimit),
      },
    });
  } catch (error) {
    console.error('[OAuth Register] Error:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
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
