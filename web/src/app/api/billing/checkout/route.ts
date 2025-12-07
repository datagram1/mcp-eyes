import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { billing, PRICING_PLANS } from '@/lib/billing';

/**
 * POST /api/billing/checkout
 * Create a checkout session for a plan upgrade/subscription
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planId } = body;

    if (!planId) {
      return NextResponse.json(
        { error: 'Plan ID is required' },
        { status: 400 }
      );
    }

    // Validate plan exists
    const plan = PRICING_PLANS.find(p => p.id === planId);
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    // Enterprise plans require contact
    if (plan.enterpriseContact) {
      return NextResponse.json(
        { error: 'Enterprise plans require contacting sales' },
        { status: 400 }
      );
    }

    const provider = billing();

    // Get or create customer
    const customerId = `user_${session.user.id}`;
    const customerResult = await provider.getOrCreateCustomer(
      session.user.id,
      session.user.email || '',
      session.user.name || undefined
    );

    if (!customerResult.success || !customerResult.data) {
      return NextResponse.json(
        { error: customerResult.error || 'Failed to create customer' },
        { status: 500 }
      );
    }

    // Build URLs
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/dashboard/licenses?success=true&plan=${planId}`;
    const cancelUrl = `${baseUrl}/dashboard/licenses?canceled=true`;

    // Create checkout session
    const checkoutResult = await provider.createCheckoutSession(
      customerId,
      planId,
      successUrl,
      cancelUrl
    );

    if (!checkoutResult.success || !checkoutResult.data) {
      return NextResponse.json(
        { error: checkoutResult.error || 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: checkoutResult.data.url,
      sessionId: checkoutResult.data.sessionId,
    });
  } catch (error) {
    console.error('[Checkout API] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
