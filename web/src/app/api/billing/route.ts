import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { billing, PRICING_PLANS } from '@/lib/billing';

/**
 * GET /api/billing
 * Get billing overview for current user
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's license and agent count
    const [user, license, activeAgents] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
        },
      }),
      prisma.license.findFirst({
        where: {
          userId: session.user.id,
          status: 'ACTIVE',
        },
      }),
      prisma.agent.count({
        where: {
          license: { userId: session.user.id },
          state: 'ACTIVE',
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get billing provider info
    const provider = billing();
    const customerId = `user_${user.id}`;
    const subscriptionResult = await provider.getSubscription(customerId);
    const invoicesResult = await provider.getInvoices(customerId, 5);
    const paymentMethodsResult = await provider.getPaymentMethods(customerId);

    // Determine current plan
    const maxAgents = license?.maxConcurrentAgents || 0;
    const currentPlan = PRICING_PLANS.find(p =>
      p.maxAgents === maxAgents || (p.maxAgents === 5 && maxAgents === 1)
    ) || PRICING_PLANS[0];

    // Calculate usage
    const usagePercent = maxAgents > 0 ? Math.min(100, (activeAgents / maxAgents) * 100) : 0;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      license: license ? {
        id: license.id,
        status: license.status,
        isTrial: license.isTrial,
        trialEnds: license.trialEnds,
        validFrom: license.validFrom,
        validUntil: license.validUntil,
        maxAgents: license.maxConcurrentAgents,
      } : null,
      usage: {
        activeAgents,
        maxAgents,
        usagePercent,
        isAtLimit: activeAgents >= maxAgents,
        isNearLimit: usagePercent >= 80,
      },
      currentPlan: {
        id: currentPlan.id,
        name: currentPlan.name,
        price: currentPlan.price,
        maxAgents: currentPlan.maxAgents,
      },
      subscription: subscriptionResult.success ? subscriptionResult.data : null,
      invoices: invoicesResult.success ? invoicesResult.data : [],
      paymentMethods: paymentMethodsResult.success ? paymentMethodsResult.data : [],
      plans: PRICING_PLANS,
    });
  } catch (error) {
    console.error('[Billing API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing info' },
      { status: 500 }
    );
  }
}
