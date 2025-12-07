/**
 * OAuth Authorization Server Metadata (RFC 8414)
 *
 * GET /.well-known/oauth-authorization-server
 *
 * Returns metadata about this OAuth authorization server, including
 * endpoints, supported features, and capabilities.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

export async function GET() {
  const metadata = {
    // Required fields
    issuer: APP_URL,
    authorization_endpoint: `${APP_URL}/api/oauth/authorize`,
    token_endpoint: `${APP_URL}/api/oauth/token`,

    // Dynamic Client Registration (RFC 7591) - Required by Claude
    registration_endpoint: `${APP_URL}/api/oauth/register`,

    // Token revocation
    revocation_endpoint: `${APP_URL}/api/oauth/revoke`,

    // Supported features
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],

    // Token endpoint authentication
    token_endpoint_auth_methods_supported: ['none'],

    // Scopes
    scopes_supported: [
      'mcp:tools',
      'mcp:resources',
      'mcp:prompts',
      'mcp:agents:read',
      'mcp:agents:write',
    ],

    // Service documentation
    service_documentation: `${APP_URL}/docs/mcp`,

    // UI locales
    ui_locales_supported: ['en'],
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
