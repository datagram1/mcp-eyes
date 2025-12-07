/**
 * OAuth Token Revocation Endpoint
 *
 * POST /api/oauth/revoke
 *
 * Allows clients to revoke access or refresh tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

interface RevokeRequest {
  token: string;
  token_type_hint?: 'access_token' | 'refresh_token';
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body: RevokeRequest;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = {
        token: formData.get('token') as string,
        token_type_hint: formData.get('token_type_hint') as 'access_token' | 'refresh_token' | undefined,
      };
    } else {
      body = await request.json() as RevokeRequest;
    }

    const { token, token_type_hint } = body;

    if (!token) {
      // Per RFC 7009, if token is missing, just return 200
      return new NextResponse(null, { status: 200 });
    }

    const tokenHash = hashToken(token);

    // Try to find and revoke the token
    // Check access token first if hinted or no hint
    if (!token_type_hint || token_type_hint === 'access_token') {
      const accessToken = await prisma.oAuthAccessToken.findUnique({
        where: { accessTokenHash: tokenHash },
      });

      if (accessToken) {
        await prisma.oAuthAccessToken.update({
          where: { id: accessToken.id },
          data: {
            revokedAt: new Date(),
            revokedReason: 'Client requested revocation',
          },
        });
        return new NextResponse(null, { status: 200 });
      }
    }

    // Check refresh token
    if (!token_type_hint || token_type_hint === 'refresh_token') {
      const refreshToken = await prisma.oAuthAccessToken.findUnique({
        where: { refreshTokenHash: tokenHash },
      });

      if (refreshToken) {
        await prisma.oAuthAccessToken.update({
          where: { id: refreshToken.id },
          data: {
            revokedAt: new Date(),
            revokedReason: 'Client requested revocation',
          },
        });
        return new NextResponse(null, { status: 200 });
      }
    }

    // Token not found - per RFC 7009, still return 200
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('[OAuth Revoke] Error:', error);
    // Even on error, return 200 per RFC 7009
    return new NextResponse(null, { status: 200 });
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
