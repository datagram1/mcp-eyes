/**
 * Billing Provider Interface
 *
 * Abstract interface for payment providers. Currently stubbed out
 * with a mock implementation. Replace with Stripe implementation
 * when ready.
 */

import {
  BillingResult,
  Subscription,
  Invoice,
  PaymentMethod,
  BillingPortalSession,
  CheckoutSession,
  BillingCustomer,
  PRICING_PLANS,
} from './types';

/**
 * Billing Provider Interface
 *
 * Implement this interface for any payment provider (Stripe, Paddle, etc.)
 */
export interface BillingProvider {
  // Customer management
  getOrCreateCustomer(userId: string, email: string, name?: string): Promise<BillingResult<BillingCustomer>>;

  // Subscription management
  getSubscription(customerId: string): Promise<BillingResult<Subscription | null>>;
  cancelSubscription(subscriptionId: string, cancelAtPeriodEnd?: boolean): Promise<BillingResult<void>>;
  resumeSubscription(subscriptionId: string): Promise<BillingResult<void>>;

  // Checkout & portal
  createCheckoutSession(
    customerId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<BillingResult<CheckoutSession>>;
  createPortalSession(customerId: string, returnUrl: string): Promise<BillingResult<BillingPortalSession>>;

  // Invoices
  getInvoices(customerId: string, limit?: number): Promise<BillingResult<Invoice[]>>;

  // Payment methods
  getPaymentMethods(customerId: string): Promise<BillingResult<PaymentMethod[]>>;

  // Webhooks (to be called from API route)
  handleWebhook(payload: string, signature: string): Promise<BillingResult<{ type: string; data: unknown }>>;
}

/**
 * Mock Billing Provider
 *
 * Returns mock data for development/testing. Replace with StripeProvider
 * when ready for production.
 */
export class MockBillingProvider implements BillingProvider {
  async getOrCreateCustomer(
    userId: string,
    email: string,
    name?: string
  ): Promise<BillingResult<BillingCustomer>> {
    return {
      success: true,
      data: {
        id: `mock_cus_${userId}`,
        email,
        name,
      },
    };
  }

  async getSubscription(_customerId: string): Promise<BillingResult<Subscription | null>> {
    // Return a mock trial subscription
    const now = new Date();
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    return {
      success: true,
      data: {
        id: 'mock_sub_trial',
        status: 'trialing',
        planId: 'starter',
        planName: 'Starter',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        cancelAtPeriodEnd: false,
        trialEnd,
        createdAt: now,
      },
    };
  }

  async cancelSubscription(
    _subscriptionId: string,
    _cancelAtPeriodEnd?: boolean
  ): Promise<BillingResult<void>> {
    return { success: true };
  }

  async resumeSubscription(_subscriptionId: string): Promise<BillingResult<void>> {
    return { success: true };
  }

  async createCheckoutSession(
    _customerId: string,
    planId: string,
    successUrl: string,
    _cancelUrl: string
  ): Promise<BillingResult<CheckoutSession>> {
    // In development, just redirect to success
    const plan = PRICING_PLANS.find(p => p.id === planId);
    if (!plan) {
      return { success: false, error: 'Invalid plan' };
    }

    return {
      success: true,
      data: {
        // In mock mode, redirect directly to success URL
        url: `${successUrl}?mock=true&plan=${planId}`,
        sessionId: `mock_cs_${Date.now()}`,
      },
    };
  }

  async createPortalSession(
    _customerId: string,
    returnUrl: string
  ): Promise<BillingResult<BillingPortalSession>> {
    // In mock mode, just return to the billing page
    return {
      success: true,
      data: {
        url: `${returnUrl}?portal=mock`,
      },
    };
  }

  async getInvoices(_customerId: string, _limit?: number): Promise<BillingResult<Invoice[]>> {
    // Return some mock invoices
    const now = new Date();
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    return {
      success: true,
      data: [
        {
          id: 'mock_inv_001',
          number: 'INV-2024-001',
          status: 'paid',
          amount: 1900,
          currency: 'USD',
          periodStart: lastMonth,
          periodEnd: now,
          paidAt: lastMonth,
          createdAt: lastMonth,
        },
        {
          id: 'mock_inv_002',
          number: 'INV-2024-002',
          status: 'paid',
          amount: 1900,
          currency: 'USD',
          periodStart: twoMonthsAgo,
          periodEnd: lastMonth,
          paidAt: twoMonthsAgo,
          createdAt: twoMonthsAgo,
        },
      ],
    };
  }

  async getPaymentMethods(_customerId: string): Promise<BillingResult<PaymentMethod[]>> {
    // Return mock payment method
    return {
      success: true,
      data: [
        {
          id: 'mock_pm_001',
          type: 'card',
          last4: '4242',
          brand: 'visa',
          expiryMonth: 12,
          expiryYear: 2025,
          isDefault: true,
        },
      ],
    };
  }

  async handleWebhook(
    _payload: string,
    _signature: string
  ): Promise<BillingResult<{ type: string; data: unknown }>> {
    return {
      success: true,
      data: {
        type: 'mock_event',
        data: {},
      },
    };
  }
}

/**
 * Stripe Billing Provider (Stub)
 *
 * TODO: Implement when Stripe account is ready
 *
 * Required environment variables:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 *
 * Required packages:
 * - stripe
 */
export class StripeBillingProvider implements BillingProvider {
  constructor() {
    // TODO: Initialize Stripe client
    // this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-11-20' });
  }

  async getOrCreateCustomer(
    _userId: string,
    _email: string,
    _name?: string
  ): Promise<BillingResult<BillingCustomer>> {
    return {
      success: false,
      error: 'Stripe integration not yet implemented. Configure STRIPE_SECRET_KEY to enable.',
    };
  }

  async getSubscription(_customerId: string): Promise<BillingResult<Subscription | null>> {
    return {
      success: false,
      error: 'Stripe integration not yet implemented',
    };
  }

  async cancelSubscription(
    _subscriptionId: string,
    _cancelAtPeriodEnd?: boolean
  ): Promise<BillingResult<void>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }

  async resumeSubscription(_subscriptionId: string): Promise<BillingResult<void>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }

  async createCheckoutSession(
    _customerId: string,
    _planId: string,
    _successUrl: string,
    _cancelUrl: string
  ): Promise<BillingResult<CheckoutSession>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }

  async createPortalSession(
    _customerId: string,
    _returnUrl: string
  ): Promise<BillingResult<BillingPortalSession>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }

  async getInvoices(_customerId: string, _limit?: number): Promise<BillingResult<Invoice[]>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }

  async getPaymentMethods(_customerId: string): Promise<BillingResult<PaymentMethod[]>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }

  async handleWebhook(
    _payload: string,
    _signature: string
  ): Promise<BillingResult<{ type: string; data: unknown }>> {
    return { success: false, error: 'Stripe integration not yet implemented' };
  }
}

/**
 * Get the configured billing provider
 *
 * Uses Stripe if STRIPE_SECRET_KEY is configured, otherwise falls back to mock
 */
export function getBillingProvider(): BillingProvider {
  // Check if Stripe is configured
  if (process.env.STRIPE_SECRET_KEY) {
    console.log('[Billing] Using Stripe provider');
    return new StripeBillingProvider();
  }

  // Fall back to mock provider
  console.log('[Billing] Using mock provider (set STRIPE_SECRET_KEY to use Stripe)');
  return new MockBillingProvider();
}

// Singleton instance
let billingProvider: BillingProvider | null = null;

export function billing(): BillingProvider {
  if (!billingProvider) {
    billingProvider = getBillingProvider();
  }
  return billingProvider;
}
