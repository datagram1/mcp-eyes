import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

/**
 * GET /api/settings
 * Get current user settings
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        billingEmail: true,
        vatNumber: true,
        createdAt: true,
        lastLogin: true,
        accountStatus: true,
        oauthProvider: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('[Settings API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * Update user settings
 */
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, companyName, billingEmail, vatNumber } = body;

    // Validate email format if provided
    if (billingEmail && !isValidEmail(billingEmail)) {
      return NextResponse.json(
        { error: 'Invalid billing email format' },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: name !== undefined ? name : undefined,
        companyName: companyName !== undefined ? companyName : undefined,
        billingEmail: billingEmail !== undefined ? billingEmail : undefined,
        vatNumber: vatNumber !== undefined ? vatNumber : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        billingEmail: true,
        vatNumber: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('[Settings API] PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
