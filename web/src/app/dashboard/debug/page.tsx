'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Agent {
  id: string;
  hostname: string;
  osType: string;
  status: string;
  state: string;
  powerState: string;
  lastSeenAt: string;
  label: string | null;
}

interface Stats {
  total: number;
  online: number;
  offline: number;
  byState: Record<string, number>;
}

const osConfigs = {
  macos: { label: 'macOS', icon: '🍎', osVersion: 'Darwin 23.0.0', arch: 'arm64' },
  windows: { label: 'Windows', icon: '🪟', osVersion: 'Windows 11 Pro', arch: 'x64' },
  linux: { label: 'Linux', icon: '🐧', osVersion: 'Ubuntu 22.04', arch: 'x64' },
};

const stateColors: Record<string, string> = {
  PENDING: 'bg-yellow-500',
  ACTIVE: 'bg-green-500',
  BLOCKED: 'bg-red-500',
  EXPIRED: 'bg-gray-500',
};

export default function DebugPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugEnabled, setDebugEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Mock agent form
  const [mockHostname, setMockHostname] = useState('');
  const [mockOsType, setMockOsType] = useState<'macos' | 'windows' | 'linux'>('macos');
  const [mockState, setMockState] = useState<'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED'>('PENDING');

  // Check debug mode - redirect if not enabled
  useEffect(() => {
    const checkDebugMode = async () => {
      try {
        const res = await fetch('/api/debug/agents', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
        if (res.status === 403) {
          const data = await res.json();
          if (data.error === 'Debug mode not enabled') {
            setDebugEnabled(false);
            router.push('/dashboard');
          }
        }
      } catch {
        // Ignore errors from the check
      }
    };
    checkDebugMode();
  }, [router]);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error('Failed to fetch agents');
      const data = await res.json();
      setAgents(data.agents);
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const createMockAgent = async () => {
    if (!mockHostname.trim()) {
      showMessage('error', 'Hostname is required');
      return;
    }

    setActionLoading('create');
    try {
      const res = await fetch('/api/debug/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname: mockHostname,
          osType: mockOsType,
          state: mockState,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create mock agent');
      }

      showMessage('success', `Mock agent "${mockHostname}" created successfully`);
      setMockHostname('');
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const changeAgentState = async (agentId: string, newState: string) => {
    setActionLoading(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });

      if (!res.ok) throw new Error('Failed to change state');
      showMessage('success', `Agent state changed to ${newState}`);
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const simulateOnline = async (agentId: string) => {
    setActionLoading(agentId);
    try {
      const res = await fetch(`/api/debug/agents/${agentId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ONLINE' }),
      });

      if (!res.ok) throw new Error('Failed to simulate online');
      showMessage('success', 'Agent marked as online');
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const simulateOffline = async (agentId: string) => {
    setActionLoading(agentId);
    try {
      const res = await fetch(`/api/debug/agents/${agentId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OFFLINE' }),
      });

      if (!res.ok) throw new Error('Failed to simulate offline');
      showMessage('success', 'Agent marked as offline');
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;

    setActionLoading(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete agent');
      showMessage('success', 'Agent deleted');
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAllMockAgents = async () => {
    if (!confirm('Delete ALL mock agents? This cannot be undone.')) return;

    setActionLoading('deleteAll');
    try {
      const res = await fetch('/api/debug/agents', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete mock agents');
      const data = await res.json();
      showMessage('success', `Deleted ${data.deleted} mock agents`);
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading || !debugEnabled) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Debug Testing</h1>
        <p>{!debugEnabled ? 'Debug mode not enabled. Redirecting...' : 'Loading...'}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Debug Testing</h1>
        <p className="text-slate-400">Create and manage mock agents for testing</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-500/20 text-red-400 rounded-lg">
          Error: {error}
        </div>
      )}

      {/* Info Box - Connect Claude */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-blue-200 font-medium">Looking to connect Claude?</p>
            <p className="text-blue-300/80 text-sm mt-1">
              OAuth credentials are now auto-generated when you create a connection.
              Go to <Link href="/dashboard/connections" className="text-blue-400 hover:underline">MCP Connections</Link> to
              create a connection and get your OAuth credentials.
            </p>
          </div>
        </div>
      </div>

      {/* Debug API - Tool Testing */}
      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <svg className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <div className="flex-1">
            <p className="text-purple-200 font-medium mb-2">Debug API - Direct Tool Execution</p>
            <p className="text-purple-300/80 text-sm mb-3">
              Use the Debug API to test tool execution directly without going through Claude.ai.
              This API is only available when DEBUG_MODE=true.
            </p>

            <div className="bg-slate-900/50 rounded-lg p-4 mb-3">
              <div className="text-xs text-slate-400 mb-1">API Key (Authorization Header)</div>
              <code className="text-purple-300 text-sm break-all">{process.env.DEBUG_API_KEY || 'Not configured'}</code>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-2">List Connected Agents:</div>
                <div className="bg-slate-900/50 rounded-lg p-3 overflow-x-auto">
                  <code className="text-sm text-green-400 whitespace-pre">
{`curl -H "Authorization: Bearer ${process.env.DEBUG_API_KEY}" \\
  ${process.env.APP_URL}/api/debug/execute-tool`}
                  </code>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Execute Tool (e.g., screenshot):</div>
                <div className="bg-slate-900/50 rounded-lg p-3 overflow-x-auto">
                  <code className="text-sm text-green-400 whitespace-pre">
{`curl -X POST \\
  -H "Authorization: Bearer ${process.env.DEBUG_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"AGENT_ID","tool":"desktop_screenshot","arguments":{"format":"png"}}' \\
  ${process.env.APP_URL}/api/debug/execute-tool`}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
            <div className="text-sm text-slate-400">Total Agents</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
            <div className="text-sm text-slate-400">Online</div>
            <div className="text-2xl font-bold text-green-400">{stats.online}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
            <div className="text-sm text-slate-400">Offline</div>
            <div className="text-2xl font-bold text-slate-400">{stats.offline}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
            <div className="text-sm text-slate-400">Active Licenses</div>
            <div className="text-2xl font-bold text-blue-400">{stats.byState?.ACTIVE || 0}</div>
          </div>
        </div>
      )}

      {/* Create Mock Agent */}
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Create Mock Agent</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Hostname</label>
            <input
              type="text"
              value={mockHostname}
              onChange={(e) => setMockHostname(e.target.value)}
              placeholder="test-machine-001"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">OS Type</label>
            <select
              value={mockOsType}
              onChange={(e) => setMockOsType(e.target.value as 'macos' | 'windows' | 'linux')}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
            >
              {Object.entries(osConfigs).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.icon} {config.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Initial State</label>
            <select
              value={mockState}
              onChange={(e) => setMockState(e.target.value as typeof mockState)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
            >
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="BLOCKED">Blocked</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={createMockAgent}
              disabled={actionLoading === 'create'}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              {actionLoading === 'create' ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </div>
      </div>

      {/* Agent List with Actions */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-white">Agents ({agents.length})</h2>
          <button
            onClick={deleteAllMockAgents}
            disabled={actionLoading === 'deleteAll'}
            className="px-3 py-1 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 transition"
          >
            {actionLoading === 'deleteAll' ? 'Deleting...' : 'Delete All Mock Agents'}
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No agents found. Create a mock agent above to test.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Change State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Simulate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-750">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{osConfigs[agent.osType.toLowerCase() as keyof typeof osConfigs]?.icon || '💻'}</span>
                        <div>
                          <div className="font-medium text-white">{agent.label || agent.hostname}</div>
                          <div className="text-xs text-slate-500">{agent.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          agent.status === 'ONLINE'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs text-white rounded-full ${
                          stateColors[agent.state] || 'bg-slate-500'
                        }`}
                      >
                        {agent.state}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {['PENDING', 'ACTIVE', 'BLOCKED', 'EXPIRED'].map((state) => (
                          <button
                            key={state}
                            onClick={() => changeAgentState(agent.id, state)}
                            disabled={actionLoading === agent.id || agent.state === state}
                            className={`px-2 py-1 text-xs rounded ${
                              agent.state === state
                                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            }`}
                          >
                            {state.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        <button
                          onClick={() => simulateOnline(agent.id)}
                          disabled={actionLoading === agent.id}
                          className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                        >
                          Online
                        </button>
                        <button
                          onClick={() => simulateOffline(agent.id)}
                          disabled={actionLoading === agent.id}
                          className="px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                        >
                          Offline
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/agents/${agent.id}`}
                          className="text-blue-400 hover:underline text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => deleteAgent(agent.id)}
                          disabled={actionLoading === agent.id}
                          className="text-red-400 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="mt-6 p-4 bg-slate-800 border border-slate-700 rounded-xl">
        <h3 className="font-medium text-white mb-2">Quick Links</h3>
        <div className="flex gap-4 flex-wrap">
          <Link href="/dashboard/agents" className="text-blue-400 hover:underline">
            Agents Dashboard
          </Link>
          <Link href="/dashboard/connections" className="text-blue-400 hover:underline">
            MCP Connections
          </Link>
          <Link href="/dashboard/settings" className="text-blue-400 hover:underline">
            Settings
          </Link>
          <Link href="/dashboard" className="text-blue-400 hover:underline">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
