/**
 * OAuth Protected Resource Metadata (RFC 9728) - Base Endpoint
 *
 * GET /.well-known/oauth-protected-resource
 *
 * Returns default metadata about this MCP server.
 * Claude may request this when discovering the auth server.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

export async function GET(): Promise<NextResponse> {
  // Return base protected resource metadata
  const metadata = {
    // Base resource URL
    resource: `${APP_URL}/mcp`,

    // Which authorization server(s) can issue tokens for this resource
    authorization_servers: [APP_URL],

    // Optional: scopes supported
    scopes_supported: [
      'mcp:tools',
      'mcp:resources',
      'mcp:prompts',
      'mcp:agents:read',
      'mcp:agents:write',
    ],

    // Bearer token type
    bearer_methods_supported: ['header'],
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Handle OPTIONS for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
