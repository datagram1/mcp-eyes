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

interface Connection {
  id: string;
  endpointUuid: string;
  name: string;
  status: string;
}

interface OAuthClient {
  id: string;
  clientId: string;
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuth: string;
  createdAt: string;
  _count?: {
    tokens: number;
  };
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

  // MCP & OAuth
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [oauthClients, setOauthClients] = useState<OAuthClient[]>([]);
  const [newClientName, setNewClientName] = useState('Claude.ai');
  const [newClient, setNewClient] = useState<OAuthClient | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'agents' | 'oauth'>('oauth');

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

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/connections');
      if (!res.ok) return;
      const data = await res.json();
      setConnections(data.connections || []);
      if (data.connections?.length > 0 && !selectedConnection) {
        setSelectedConnection(data.connections[0].endpointUuid);
      }
    } catch {
      // Ignore
    }
  };

  const fetchOAuthClients = async () => {
    try {
      const res = await fetch('/api/oauth/clients');
      if (!res.ok) return;
      const data = await res.json();
      setOauthClients(data.clients || []);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchConnections();
    fetchOAuthClients();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      showMessage('error', 'Failed to copy');
    }
  };

  const createOAuthClient = async () => {
    if (!newClientName.trim()) {
      showMessage('error', 'Client name is required');
      return;
    }

    setActionLoading('createClient');
    try {
      const res = await fetch('/api/oauth/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClientName,
          type: 'claude',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create client');
      }

      const data = await res.json();
      setNewClient(data.client);
      showMessage('success', 'OAuth client created! Save the secret now - it cannot be retrieved later.');
      fetchOAuthClients();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteOAuthClient = async (clientId: string) => {
    if (!confirm('Delete this OAuth client? Any connected applications will be disconnected.')) return;

    setActionLoading(clientId);
    try {
      const res = await fetch(`/api/oauth/clients?clientId=${clientId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete client');
      showMessage('success', 'OAuth client deleted');
      fetchOAuthClients();
      if (newClient?.clientId === clientId) {
        setNewClient(null);
      }
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
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
        <h1 className="text-2xl font-bold mb-4">Dev Testing</h1>
        <p>{!debugEnabled ? 'Debug mode not enabled. Redirecting...' : 'Loading...'}</p>
      </div>
    );
  }

  const mcpEndpointUrl = selectedConnection
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/mcp/${selectedConnection}`
    : '';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dev Testing</h1>
        <p className="text-gray-600">Connect Claude or other AI clients to ScreenControl</p>
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

      {/* Tab Navigation */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('oauth')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'oauth'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Connect Claude / AI Clients
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'agents'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Mock Agents
        </button>
      </div>

      {activeTab === 'oauth' && (
        <>
          {/* MCP Endpoint Section */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-4">1. Your MCP Endpoint</h2>
            <p className="text-gray-600 text-sm mb-4">
              This is your unique MCP server URL. Select a connection to use:
            </p>

            {connections.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800">
                  No MCP connections found.{' '}
                  <Link href="/dashboard/connections" className="text-blue-600 hover:underline">
                    Create a connection first
                  </Link>
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Connection</label>
                  <select
                    value={selectedConnection}
                    onChange={(e) => setSelectedConnection(e.target.value)}
                    className="w-full md:w-1/2 px-3 py-2 border rounded-md"
                  >
                    {connections.map((conn) => (
                      <option key={conn.id} value={conn.endpointUuid}>
                        {conn.name} ({conn.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-2">MCP Endpoint URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm font-mono break-all">
                      {mcpEndpointUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(mcpEndpointUrl, 'mcp')}
                      className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      {copiedField === 'mcp' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* OAuth Credentials Section */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-4">2. OAuth Credentials</h2>
            <p className="text-gray-600 text-sm mb-4">
              Claude and some AI clients require OAuth credentials. Create a client below:
            </p>

            {/* Create New Client */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Claude.ai"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                <button
                  onClick={createOAuthClient}
                  disabled={actionLoading === 'createClient'}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading === 'createClient' ? 'Creating...' : 'Create OAuth Client'}
                </button>
              </div>
            </div>

            {/* Newly Created Client */}
            {newClient && (
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-green-800">New OAuth Client Created</h3>
                    <p className="text-green-700 text-sm">Save these credentials now - the secret cannot be retrieved later!</p>
                  </div>
                  <button
                    onClick={() => setNewClient(null)}
                    className="text-green-600 hover:text-green-800"
                  >
                    Dismiss
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">OAuth Client ID</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono">
                        {newClient.clientId}
                      </code>
                      <button
                        onClick={() => copyToClipboard(newClient.clientId, 'clientId')}
                        className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                      >
                        {copiedField === 'clientId' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">OAuth Client Secret</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono break-all">
                        {newClient.clientSecret}
                      </code>
                      <button
                        onClick={() => copyToClipboard(newClient.clientSecret || '', 'clientSecret')}
                        className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                      >
                        {copiedField === 'clientSecret' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Existing Clients */}
            {oauthClients.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Your OAuth Clients</h3>
                <div className="space-y-2">
                  {oauthClients.map((client) => (
                    <div key={client.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div>
                        <span className="font-medium">{client.clientName}</span>
                        <span className="text-gray-500 text-sm ml-2">
                          {client._count?.tokens || 0} active tokens
                        </span>
                        <div className="text-xs text-gray-400 font-mono">{client.clientId}</div>
                      </div>
                      <button
                        onClick={() => deleteOAuthClient(client.clientId)}
                        disabled={actionLoading === client.clientId}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Instructions Section */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-4">3. Connect to Claude</h2>

            <div className="prose prose-sm max-w-none">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
                <h3 className="text-blue-800 font-semibold mt-0 mb-2">For Claude Pro/Max Users</h3>
                <ol className="list-decimal list-inside space-y-2 text-blue-900 mb-0">
                  <li>Go to <strong>Settings → Connectors</strong> in Claude</li>
                  <li>Click <strong>&quot;Add custom connector&quot;</strong> at the bottom</li>
                  <li>Enter your <strong>MCP Server URL</strong> (from Step 1 above)</li>
                  <li>Click <strong>&quot;Advanced settings&quot;</strong></li>
                  <li>Enter your <strong>OAuth Client ID</strong> and <strong>OAuth Client Secret</strong> (from Step 2)</li>
                  <li>Click <strong>&quot;Add&quot;</strong> to finish</li>
                </ol>
              </div>

              <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg mb-4">
                <h3 className="text-purple-800 font-semibold mt-0 mb-2">For Claude Team/Enterprise Users</h3>
                <ol className="list-decimal list-inside space-y-2 text-purple-900 mb-0">
                  <li>Go to <strong>Admin settings → Connectors</strong></li>
                  <li>Click <strong>&quot;Add custom connector&quot;</strong></li>
                  <li>Enter your <strong>MCP Server URL</strong> (from Step 1 above)</li>
                  <li>Click <strong>&quot;Advanced settings&quot;</strong> to add OAuth credentials</li>
                  <li>Click <strong>&quot;Add&quot;</strong> to enable for your workspace</li>
                </ol>
                <p className="text-purple-700 text-sm mt-2 mb-0">
                  Note: Only Primary Owners or Owners can configure custom connectors.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
                <h3 className="text-gray-800 font-semibold mt-0 mb-2">After Connecting</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 mb-0">
                  <li>You&apos;ll be redirected to ScreenControl to authorize access</li>
                  <li>Review the permissions Claude is requesting</li>
                  <li>Click <strong>&quot;Authorize&quot;</strong> to complete the connection</li>
                  <li>Claude can now access your ScreenControl agents and tools</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Dynamic Client Registration Info */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Alternative: Dynamic Client Registration</h2>
            <p className="text-gray-600 text-sm mb-4">
              Some MCP clients (like Claude Code, Cursor) support automatic OAuth registration using PKCE.
              They don&apos;t need pre-configured credentials - just provide the MCP URL and they&apos;ll register automatically.
            </p>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">OAuth Discovery Endpoints</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Authorization Server Metadata:</span>
                  <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/.well-known/oauth-authorization-server
                  </code>
                </div>
                <div>
                  <span className="text-gray-500">Dynamic Registration:</span>
                  <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/oauth/register
                  </code>
                </div>
                <div>
                  <span className="text-gray-500">Authorization:</span>
                  <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/oauth/authorize
                  </code>
                </div>
                <div>
                  <span className="text-gray-500">Token:</span>
                  <code className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/api/oauth/token
                  </code>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'agents' && (
        <>
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
        </>
      )}

      {/* Quick Links */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">Quick Links</h3>
        <div className="flex gap-4 flex-wrap">
          <Link href="/dashboard/agents" className="text-blue-600 hover:underline">
            Agents Dashboard
          </Link>
          <Link href="/dashboard/connections" className="text-blue-600 hover:underline">
            MCP Connections
          </Link>
          <Link href="/dashboard/settings" className="text-blue-600 hover:underline">
            Settings
          </Link>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Home
          </Link>
          <a
            href="https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Claude Custom Connectors Guide ↗
          </a>
        </div>
      </div>
    </div>
  );
}
