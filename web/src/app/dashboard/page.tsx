import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

async function getDashboardData(userId: string) {
  const [user, licenses, agents] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        createdAt: true,
        accountStatus: true,
      },
    }),
    prisma.license.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.agent.findMany({
      where: {
        license: {
          userId,
        },
      },
      include: {
        license: true,
        sessions: {
          where: {
            sessionEnd: null,
          },
        },
      },
      orderBy: { lastSeenAt: 'desc' },
    }),
  ]);

  return { user, licenses, agents };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/login');
  }

  const { user, licenses, agents } = await getDashboardData(session.user.id);

  // Calculate stats
  const activeLicense = licenses.find(l => l.status === 'ACTIVE');
  const activeAgents = agents.filter(a => a.status === 'ONLINE').length;
  const totalAgents = agents.length;
  const trialDaysLeft = activeLicense?.trialEnds
    ? Math.max(0, Math.ceil((activeLicense.trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div>
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Welcome back, {user?.name?.split(' ')[0] || 'there'}!
        </h1>
        <p className="text-slate-400 mt-1">
          Here&apos;s an overview of your ScreenControl account.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* License Status */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">License Status</p>
              <p className="text-2xl font-bold text-white mt-1">
                {activeLicense?.status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              activeLicense?.status === 'ACTIVE' ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              <svg className={`w-6 h-6 ${
                activeLicense?.status === 'ACTIVE' ? 'text-green-400' : 'text-red-400'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
          {activeLicense?.trialEnds && trialDaysLeft > 0 && (
            <p className="text-amber-400 text-sm mt-2">
              Trial: {trialDaysLeft} days remaining
            </p>
          )}
        </div>

        {/* Active Agents */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Active Agents</p>
              <p className="text-2xl font-bold text-white mt-1">
                {activeAgents} / {activeLicense?.maxConcurrentAgents || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <p className="text-slate-500 text-sm mt-2">
            {totalAgents} total registered
          </p>
        </div>

        {/* Product Type */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Current Plan</p>
              <p className="text-2xl font-bold text-white mt-1 capitalize">
                {activeLicense?.productType?.toLowerCase().replace('_', ' ') || 'None'}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <Link href="/dashboard/licenses" className="text-blue-400 text-sm mt-2 inline-block hover:text-blue-300">
            Manage plan &rarr;
          </Link>
        </div>

        {/* Member Since */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Member Since</p>
              <p className="text-2xl font-bold text-white mt-1">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Agents */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl">
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Recent Agents</h2>
            <Link href="/dashboard/agents" className="text-blue-400 hover:text-blue-300 text-sm">
              View all &rarr;
            </Link>
          </div>
        </div>
        <div className="divide-y divide-slate-700">
          {agents.length === 0 ? (
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-700 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-400">No agents registered yet</p>
              <p className="text-slate-500 text-sm mt-1">
                Download ScreenControl and connect your first agent
              </p>
            </div>
          ) : (
            agents.slice(0, 5).map((agent) => (
              <div key={agent.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${
                    agent.status === 'ONLINE' ? 'bg-green-400' : 'bg-slate-500'
                  }`} />
                  <div>
                    <p className="text-white font-medium">{agent.hostname || 'Unknown'}</p>
                    <p className="text-slate-400 text-sm">
                      {agent.osType} • {agent.osVersion}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-sm">
                    {agent.lastSeenAt
                      ? `Last seen ${formatRelativeTime(agent.lastSeenAt)}`
                      : 'Never connected'
                    }
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* License Key Section */}
      {activeLicense && (
        <div className="mt-8 bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Your License Key</h2>
          <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-slate-300 break-all">
            {activeLicense.licenseKey}
          </div>
          <p className="text-slate-500 text-sm mt-2">
            Use this key to activate ScreenControl on your machines
          </p>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
