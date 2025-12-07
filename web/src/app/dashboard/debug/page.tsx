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
        // Try to fetch from debug API - if it returns 403, debug mode is disabled
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

  const simulateExpiration = async (agentId: string) => {
    setActionLoading(agentId + '-expire');
    try {
      const res = await fetch(`/api/debug/agents/${agentId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'expiration' }),
      });

      if (!res.ok) throw new Error('Failed to simulate expiration');
      const data = await res.json();
      showMessage('success', `License expired: ${data.previousState} -> EXPIRED`);
      fetchAgents();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const simulateRenewal = async (agentId: string) => {
    setActionLoading(agentId + '-renew');
    try {
      const res = await fetch(`/api/debug/agents/${agentId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renewal' }),
      });

      if (!res.ok) throw new Error('Failed to simulate renewal');
      const data = await res.json();
      showMessage('success', `License renewed: ${data.previousState} -> ACTIVE`);
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
        <h1 className="text-2xl font-bold mb-4">Debug Dashboard</h1>
        <p>{!debugEnabled ? 'Debug mode not enabled. Redirecting...' : 'Loading...'}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Debug Dashboard</h1>
        <p className="text-gray-600">Testing tools for agent management and licensing</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg">
          Error: {error}
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">Total Agents</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">Online</div>
            <div className="text-2xl font-bold text-green-600">{stats.online}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">Offline</div>
            <div className="text-2xl font-bold text-gray-600">{stats.offline}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500">Active Licenses</div>
            <div className="text-2xl font-bold text-blue-600">{stats.byState?.ACTIVE || 0}</div>
          </div>
        </div>
      )}

      {/* Create Mock Agent */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Create Mock Agent</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hostname</label>
            <input
              type="text"
              value={mockHostname}
              onChange={(e) => setMockHostname(e.target.value)}
              placeholder="test-machine-001"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OS Type</label>
            <select
              value={mockOsType}
              onChange={(e) => setMockOsType(e.target.value as 'macos' | 'windows' | 'linux')}
              className="w-full px-3 py-2 border rounded-md"
            >
              {Object.entries(osConfigs).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.icon} {config.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial State</label>
            <select
              value={mockState}
              onChange={(e) => setMockState(e.target.value as typeof mockState)}
              className="w-full px-3 py-2 border rounded-md"
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
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading === 'create' ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </div>
      </div>

      {/* Agent List with Actions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Agents ({agents.length})</h2>
          <button
            onClick={deleteAllMockAgents}
            disabled={actionLoading === 'deleteAll'}
            className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
          >
            {actionLoading === 'deleteAll' ? 'Deleting...' : 'Delete All Mock Agents'}
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No agents found. Create a mock agent above to test.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Change State</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Simulate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{osConfigs[agent.osType.toLowerCase() as keyof typeof osConfigs]?.icon || '💻'}</span>
                        <div>
                          <div className="font-medium">{agent.label || agent.hostname}</div>
                          <div className="text-xs text-gray-500">{agent.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          agent.status === 'ONLINE'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 text-xs text-white rounded-full ${
                          stateColors[agent.state] || 'bg-gray-500'
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
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
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
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          Online
                        </button>
                        <button
                          onClick={() => simulateOffline(agent.id)}
                          disabled={actionLoading === agent.id}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        >
                          Offline
                        </button>
                        <button
                          onClick={() => simulateExpiration(agent.id)}
                          disabled={actionLoading === agent.id + '-expire' || agent.state === 'EXPIRED'}
                          className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50"
                        >
                          Expire
                        </button>
                        <button
                          onClick={() => simulateRenewal(agent.id)}
                          disabled={actionLoading === agent.id + '-renew' || agent.state === 'ACTIVE'}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                        >
                          Renew
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link
                          href={`/dashboard/agents/${agent.id}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => deleteAgent(agent.id)}
                          disabled={actionLoading === agent.id}
                          className="text-red-600 hover:underline text-sm"
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
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">Quick Links</h3>
        <div className="flex gap-4">
          <Link href="/dashboard/agents" className="text-blue-600 hover:underline">
            Agents Dashboard
          </Link>
          <Link href="/dashboard/connections" className="text-blue-600 hover:underline">
            MCP Connections
          </Link>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
