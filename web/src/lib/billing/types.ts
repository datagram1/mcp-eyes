/**
 * Billing Types
 *
 * Provider-agnostic billing types that can be implemented by any payment provider.
 * Currently designed for Stripe but abstracted for flexibility.
 */

// Pricing Plans
export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  price: number;          // Monthly price in cents
  yearlyPrice?: number;   // Yearly price in cents (if different)
  currency: string;
  maxAgents: number;      // -1 for unlimited
  features: string[];
  popular?: boolean;
  enterpriseContact?: boolean; // If true, shows "Contact Sales"
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for individual developers and small projects',
    price: 1900,           // $19/month
    yearlyPrice: 19000,    // $190/year (~2 months free)
    currency: 'USD',
    maxAgents: 5,
    features: [
      'Up to 5 agents',
      'All MCP tools',
      'Email support',
      'Community access',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For teams and professional use',
    price: 4900,           // $49/month
    yearlyPrice: 49000,    // $490/year (~2 months free)
    currency: 'USD',
    maxAgents: 25,
    popular: true,
    features: [
      'Up to 25 agents',
      'All MCP tools',
      'Priority support',
      'Agent groups & tags',
      'Advanced permissions',
      'API access',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For organizations with custom needs',
    price: 0,              // Custom pricing
    currency: 'USD',
    maxAgents: -1,         // Unlimited
    enterpriseContact: true,
    features: [
      'Unlimited agents',
      'All Pro features',
      'Dedicated support',
      'SSO / SAML',
      'Custom integrations',
      'SLA guarantee',
      'On-premise option',
    ],
  },
];

// Subscription Status
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused'
  | 'none';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  planId: string;
  planName: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  createdAt: Date;
}

// Invoice
export interface Invoice {
  id: string;
  number: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt?: Date;
  hostedUrl?: string;
  pdfUrl?: string;
  createdAt: Date;
}

// Payment Method
export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank' | 'other';
  last4?: string;
  brand?: string;        // visa, mastercard, etc.
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

// Billing Portal Session
export interface BillingPortalSession {
  url: string;
}

// Checkout Session
export interface CheckoutSession {
  url: string;
  sessionId: string;
}

// Usage Stats
export interface UsageStats {
  currentAgents: number;
  maxAgents: number;
  percentUsed: number;
  overage: number;        // agents over limit
}

// Billing Customer
export interface BillingCustomer {
  id: string;
  email: string;
  name?: string;
  defaultPaymentMethodId?: string;
}

// Provider Response wrapper
export interface BillingResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
