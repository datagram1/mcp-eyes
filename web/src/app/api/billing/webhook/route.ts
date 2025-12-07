import { NextResponse } from 'next/server';
import { billing } from '@/lib/billing';
import { prisma } from '@/lib/db';

/**
 * POST /api/billing/webhook
 * Handle webhooks from payment provider (Stripe, etc.)
 *
 * This route is called by the payment provider to notify us of events
 * such as successful payments, subscription changes, etc.
 */
export async function POST(request: Request) {
  try {
    // Get raw body for signature verification
    const payload = await request.text();
    const signature = request.headers.get('stripe-signature') || '';

    const provider = billing();

    // Verify and parse webhook
    const result = await provider.handleWebhook(payload, signature);

    if (!result.success) {
      console.error('[Webhook] Verification failed:', result.error);
      return NextResponse.json(
        { error: result.error || 'Webhook verification failed' },
        { status: 400 }
      );
    }

    const { type, data } = result.data!;

    console.log(`[Webhook] Received event: ${type}`);

    // Handle different event types
    switch (type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(data);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(data);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(data);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(data);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(data);
        break;

      case 'mock_event':
        // Mock provider event, ignore
        console.log('[Webhook] Mock event received, ignoring');
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle checkout.session.completed
 * Create or update license when checkout completes
 */
async function handleCheckoutComplete(data: unknown) {
  // In a real implementation, extract customerId and planId from data
  // and create/update the license accordingly
  console.log('[Webhook] Checkout completed:', data);

  // TODO: When Stripe is configured:
  // 1. Extract customer ID and metadata from session
  // 2. Find user by Stripe customer ID
  // 3. Create or update license with appropriate maxConcurrentAgents
  // 4. Record transaction
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdate(data: unknown) {
  console.log('[Webhook] Subscription updated:', data);

  // TODO: When Stripe is configured:
  // 1. Extract subscription details
  // 2. Update license maxConcurrentAgents based on plan
  // 3. Update license status if needed
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCanceled(data: unknown) {
  console.log('[Webhook] Subscription canceled:', data);

  // TODO: When Stripe is configured:
  // 1. Find user's license
  // 2. Set license status to CANCELLED or EXPIRED
  // 3. Optionally set validUntil to current period end
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(data: unknown) {
  console.log('[Webhook] Payment succeeded:', data);

  // TODO: When Stripe is configured:
  // 1. Record transaction
  // 2. Extend license validUntil
  // 3. Clear any payment failure flags
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(data: unknown) {
  console.log('[Webhook] Payment failed:', data);

  // TODO: When Stripe is configured:
  // 1. Record failed transaction
  // 2. Optionally set license status to SUSPENDED
  // 3. Send notification email to user
}

// Suppress unused variable warning for prisma until webhooks are fully implemented
void prisma;
