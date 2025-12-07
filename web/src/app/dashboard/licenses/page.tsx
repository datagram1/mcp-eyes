import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { PRICING_PLANS } from '@/lib/billing';

async function getLicenseData(userId: string) {
  const [user, licenses, agents, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        billingEmail: true,
        vatNumber: true,
      },
    }),
    prisma.license.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agent.count({
      where: {
        license: { userId },
        state: 'ACTIVE',
      },
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return { user, licenses, activeAgents: agents, transactions };
}

function formatCurrency(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export default async function LicensesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const { user, licenses, activeAgents, transactions } = await getLicenseData(session.user.id);
  const activeLicense = licenses.find(l => l.status === 'ACTIVE');
  const currentPlan = PRICING_PLANS.find(p =>
    activeLicense?.maxConcurrentAgents === p.maxAgents ||
    (p.maxAgents === 5 && activeLicense?.maxConcurrentAgents === 1) // Default trial
  ) || PRICING_PLANS[0];

  // Calculate trial info
  const isTrialing = activeLicense?.isTrial && activeLicense?.trialEnds;
  const trialDaysLeft = isTrialing && activeLicense?.trialEnds
    ? Math.max(0, Math.ceil((activeLicense.trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // Usage stats
  const maxAgents = activeLicense?.maxConcurrentAgents || 0;
  const usagePercent = maxAgents > 0 ? Math.min(100, (activeAgents / maxAgents) * 100) : 0;
  const isAtLimit = activeAgents >= maxAgents;
  const isNearLimit = usagePercent >= 80;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Licenses & Billing</h1>
        <p className="text-slate-400 mt-1">
          Manage your subscription, view usage, and access billing history.
        </p>
      </div>

      {/* Trial Banner */}
      {isTrialing && trialDaysLeft > 0 && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-amber-400 font-medium">Trial Period Active</p>
              <p className="text-slate-400 text-sm">{trialDaysLeft} days remaining in your free trial</p>
            </div>
          </div>
          <Link
            href="#plans"
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium transition"
          >
            Upgrade Now
          </Link>
        </div>
      )}

      {/* Current Plan & Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Current Plan Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Current Plan</h2>
            {currentPlan.popular && (
              <span className="bg-blue-500/20 text-blue-400 text-xs font-medium px-2 py-1 rounded">
                Popular
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold text-white">{currentPlan.name}</span>
            {currentPlan.price > 0 && (
              <span className="text-slate-400">
                {formatCurrency(currentPlan.price)}/month
              </span>
            )}
          </div>

          <p className="text-slate-400 text-sm mb-4">{currentPlan.description}</p>

          <ul className="space-y-2 mb-6">
            {currentPlan.features.slice(0, 4).map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <div className="flex gap-3">
            <Link
              href="#plans"
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-center py-2 px-4 rounded-lg font-medium transition"
            >
              {isTrialing ? 'Choose Plan' : 'Change Plan'}
            </Link>
            <button
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              title="Manage subscription in billing portal"
            >
              Manage
            </button>
          </div>
        </div>

        {/* Usage Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Agent Usage</h2>

          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-3xl font-bold text-white">{activeAgents}</span>
            <span className="text-slate-400">of {maxAgents === -1 ? 'unlimited' : maxAgents} agents</span>
          </div>

          {/* Usage Bar */}
          {maxAgents !== -1 && (
            <div className="mb-4">
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className={`text-sm mt-1 ${
                isAtLimit ? 'text-red-400' : isNearLimit ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {isAtLimit
                  ? 'You\'ve reached your agent limit. Upgrade for more.'
                  : isNearLimit
                  ? `${Math.round(usagePercent)}% used - consider upgrading soon`
                  : `${Math.round(usagePercent)}% used`
                }
              </p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
            <div>
              <p className="text-slate-400 text-sm">Billing Period</p>
              <p className="text-white font-medium">
                {activeLicense?.validFrom ? formatDate(activeLicense.validFrom) : 'N/A'}
                {' - '}
                {activeLicense?.validUntil ? formatDate(activeLicense.validUntil) : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">License Key</p>
              <p className="text-white font-mono text-sm truncate">
                {activeLicense?.licenseKey || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Plans */}
      <div id="plans" className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`bg-slate-800 border rounded-xl p-6 relative ${
                plan.popular ? 'border-blue-500' : 'border-slate-700'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-slate-400 text-sm mb-4">{plan.description}</p>

              <div className="mb-4">
                {plan.enterpriseContact ? (
                  <span className="text-2xl font-bold text-white">Custom</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-white">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-slate-400">/month</span>
                  </>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-300">
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              {plan.enterpriseContact ? (
                <a
                  href="mailto:sales@screencontrol.com"
                  className="block w-full text-center bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg font-medium transition"
                >
                  Contact Sales
                </a>
              ) : currentPlan.id === plan.id ? (
                <button
                  disabled
                  className="w-full bg-slate-700 text-slate-400 py-2 px-4 rounded-lg font-medium cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  className={`w-full py-2 px-4 rounded-lg font-medium transition ${
                    plan.popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  {plan.price < currentPlan.price ? 'Downgrade' : 'Upgrade'}
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-slate-500 text-sm mt-4">
          All plans include a 14-day free trial. No credit card required to start.
        </p>
      </div>

      {/* Payment Method & Invoices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Payment Method */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Payment Method</h2>
            <button className="text-blue-400 hover:text-blue-300 text-sm">
              Update
            </button>
          </div>

          {isTrialing ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 bg-slate-700 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <p className="text-slate-400">No payment method on file</p>
              <p className="text-slate-500 text-sm mt-1">Add a card to continue after your trial</p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-lg">
              <div className="w-12 h-8 bg-slate-700 rounded flex items-center justify-center">
                <span className="text-slate-300 text-xs font-bold">VISA</span>
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">•••• •••• •••• 4242</p>
                <p className="text-slate-400 text-sm">Expires 12/2025</p>
              </div>
              <span className="text-green-400 text-xs font-medium">Default</span>
            </div>
          )}
        </div>

        {/* Billing Info */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Billing Information</h2>
            <Link href="/dashboard/settings" className="text-blue-400 hover:text-blue-300 text-sm">
              Edit
            </Link>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-slate-400 text-sm">Name</p>
              <p className="text-white">{user?.name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Company</p>
              <p className="text-white">{user?.companyName || 'Not set'}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Email</p>
              <p className="text-white">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Transaction History</h2>
        </div>

        {transactions.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-slate-400">No transactions yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Your billing history will appear here after your first payment
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">
                    {tx.productType} - {tx.status}
                  </p>
                  <p className="text-slate-400 text-sm">
                    {formatDate(tx.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white font-medium">
                    {formatCurrency(tx.amount, tx.currency)}
                  </p>
                  <span className={`text-xs font-medium ${
                    tx.status === 'COMPLETED' ? 'text-green-400' :
                    tx.status === 'FAILED' ? 'text-red-400' :
                    tx.status === 'PENDING' ? 'text-amber-400' :
                    'text-slate-400'
                  }`}>
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
