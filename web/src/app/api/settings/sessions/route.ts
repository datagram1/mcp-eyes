import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

/**
 * GET /api/settings/sessions
 * Get active sessions for current user
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current session token from cookie
    const cookieStore = await cookies();
    const currentSessionToken = cookieStore.get('next-auth.session-token')?.value
      || cookieStore.get('__Secure-next-auth.session-token')?.value;

    const sessions = await prisma.session.findMany({
      where: {
        userId: session.user.id,
        expires: { gt: new Date() },
      },
      select: {
        id: true,
        sessionToken: true,
        expires: true,
      },
      orderBy: { expires: 'desc' },
    });

    // Mark current session
    const sessionsWithCurrent = sessions.map(s => ({
      id: s.id,
      expires: s.expires.toISOString(),
      current: s.sessionToken === currentSessionToken,
    }));

    return NextResponse.json({ sessions: sessionsWithCurrent });
  } catch (error) {
    console.error('[Sessions API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/sessions
 * Sign out all other devices (keep current session)
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current session token from cookie
    const cookieStore = await cookies();
    const currentSessionToken = cookieStore.get('next-auth.session-token')?.value
      || cookieStore.get('__Secure-next-auth.session-token')?.value;

    if (!currentSessionToken) {
      return NextResponse.json({ error: 'No current session' }, { status: 400 });
    }

    // Delete all sessions except current
    const result = await prisma.session.deleteMany({
      where: {
        userId: session.user.id,
        sessionToken: { not: currentSessionToken },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('[Sessions API] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to sign out other sessions' },
      { status: 500 }
    );
  }
}
