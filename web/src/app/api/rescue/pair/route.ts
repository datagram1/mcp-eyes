import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/rescue/pair
 * Public endpoint for rescue USB systems to pair with a tenant.
 * Called by the screencontrol-pair script on the rescue system.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, hostname } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    // Normalize token (remove any whitespace, convert to lowercase)
    const normalizedToken = token.trim().toLowerCase();

    // Find the token
    const rescueToken = await prisma.rescueToken.findUnique({
      where: { token: normalizedToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            companyName: true,
          },
        },
      },
    });

    if (!rescueToken) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 404 }
      );
    }

    // Check if token is active
    if (!rescueToken.isActive) {
      return NextResponse.json(
        { success: false, error: 'Token has been deactivated' },
        { status: 403 }
      );
    }

    // Check if token has expired
    if (rescueToken.expiresAt && rescueToken.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Token has expired' },
        { status: 403 }
      );
    }

    // Check if token has remaining uses
    if (rescueToken.usedCount >= rescueToken.maxUses) {
      return NextResponse.json(
        { success: false, error: 'Token has reached maximum uses' },
        { status: 403 }
      );
    }

    // Update token usage
    await prisma.rescueToken.update({
      where: { id: rescueToken.id },
      data: {
        usedCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    // Generate agent name
    const agentName = hostname
      ? `Rescue-${hostname}`
      : `Rescue-${rescueToken.name || 'System'}`;

    // Return success with customer ID
    return NextResponse.json({
      success: true,
      customerId: rescueToken.userId,
      agentName,
      companyName: rescueToken.user.companyName || rescueToken.user.name,
    });
  } catch (error) {
    console.error('[Rescue Pair API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
