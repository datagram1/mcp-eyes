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

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ClientRegistrationRequest;

    // Get client context for tracking
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || undefined;

    // Register the client
    const result = await registerClient(body, { ipAddress, userAgent });

    // Check if it's an error response
    if ('error' in result) {
      return NextResponse.json(result, { status: 400 });
    }

    // Return successful registration
    return NextResponse.json(result, {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
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
