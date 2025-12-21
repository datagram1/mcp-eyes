import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';

/**
 * Generate a token in format: xxxx-xxxx-xxxx-xxxx
 */
function generateToken(): string {
  const bytes = randomBytes(16);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/**
 * GET /api/rescue/tokens
 * List all rescue tokens for the authenticated user
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tokens = await prisma.rescueToken.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        name: true,
        description: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error('[Rescue Tokens API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tokens' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rescue/tokens
 * Create a new rescue token
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, maxUses, expiresInDays } = body;

    // Calculate expiration if specified
    let expiresAt: Date | null = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Generate unique token
    let token = generateToken();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.rescueToken.findUnique({
        where: { token },
      });
      if (!existing) break;
      token = generateToken();
      attempts++;
    }

    // Create the token
    const rescueToken = await prisma.rescueToken.create({
      data: {
        userId: session.user.id,
        token,
        name: name || null,
        description: description || null,
        maxUses: maxUses || 10,
        expiresAt,
      },
      select: {
        id: true,
        token: true,
        name: true,
        description: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ token: rescueToken }, { status: 201 });
  } catch (error) {
    console.error('[Rescue Tokens API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create token' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rescue/tokens
 * Delete a rescue token by ID (passed in body)
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Token ID required' }, { status: 400 });
    }

    // Verify ownership
    const token = await prisma.rescueToken.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Delete the token
    await prisma.rescueToken.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Rescue Tokens API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete token' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/rescue/tokens
 * Update a rescue token (activate/deactivate)
 */
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, isActive, name, description, maxUses } = body;

    if (!id) {
      return NextResponse.json({ error: 'Token ID required' }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.rescueToken.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Update the token
    const token = await prisma.rescueToken.update({
      where: { id },
      data: {
        isActive: isActive !== undefined ? isActive : undefined,
        name: name !== undefined ? name : undefined,
        description: description !== undefined ? description : undefined,
        maxUses: maxUses !== undefined ? maxUses : undefined,
      },
      select: {
        id: true,
        token: true,
        name: true,
        description: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error('[Rescue Tokens API] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update token' },
      { status: 500 }
    );
  }
}
