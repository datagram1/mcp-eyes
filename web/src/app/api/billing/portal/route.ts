import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { billing } from '@/lib/billing';

/**
 * POST /api/billing/portal
 * Create a billing portal session for subscription management
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const provider = billing();
    const customerId = `user_${session.user.id}`;

    // Build return URL
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const returnUrl = `${baseUrl}/dashboard/licenses`;

    // Create portal session
    const portalResult = await provider.createPortalSession(customerId, returnUrl);

    if (!portalResult.success || !portalResult.data) {
      return NextResponse.json(
        { error: portalResult.error || 'Failed to create portal session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: portalResult.data.url,
    });
  } catch (error) {
    console.error('[Portal API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
