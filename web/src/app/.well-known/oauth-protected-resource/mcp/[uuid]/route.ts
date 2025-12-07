/**
 * OAuth Protected Resource Metadata (RFC 9728)
 *
 * GET /.well-known/oauth-protected-resource/mcp/{uuid}
 *
 * Returns metadata about a specific protected resource (MCP endpoint),
 * including which authorization server to use and the resource URL.
 *
 * This handles Claude's discovery request pattern where it appends the
 * full resource path after /.well-known/oauth-protected-resource/
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.APP_URL || 'https://screencontrol.knws.co.uk';

interface RouteParams {
  params: Promise<{ uuid: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteParams
): Promise<NextResponse> {
  try {
    const { uuid } = await context.params;

    // Validate UUID format (cuid or uuid)
    if (!uuid || uuid.length < 10) {
      return NextResponse.json(
        { error: 'invalid_resource', error_description: 'Invalid resource identifier' },
        { status: 404 }
      );
    }

    // Check if this MCP connection exists and is active
    const connection = await prisma.mcpConnection.findUnique({
      where: { endpointUuid: uuid },
      select: {
        id: true,
        status: true,
        userId: true,
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'invalid_resource', error_description: 'Resource not found' },
        { status: 404 }
      );
    }

    if (connection.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'invalid_resource', error_description: 'Resource is not available' },
        { status: 403 }
      );
    }

    // Return protected resource metadata
    const resourceUrl = `${APP_URL}/mcp/${uuid}`;

    const metadata = {
      // The protected resource URL (this is the audience for tokens)
      resource: resourceUrl,

      // Which authorization server(s) can issue tokens for this resource
      authorization_servers: [APP_URL],

      // Optional: scopes required to access this resource
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
  } catch (error) {
    console.error('Error in protected resource metadata:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
