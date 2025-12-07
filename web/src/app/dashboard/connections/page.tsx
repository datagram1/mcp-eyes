'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Connection {
  id: string;
  endpointUuid: string;
  name: string;
  description: string | null;
  clientName: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  lastUsedAt: string | null;
  totalRequests: number;
  createdAt: string;
  updatedAt: string;
  _count: {
    tokens: number;
    requestLogs: number;
  };
}

interface ConnectionsResponse {
  connections: Connection[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newConnectionName, setNewConnectionName] = useState('');
  const [newConnectionDesc, setNewConnectionDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [createdConnection, setCreatedConnection] = useState<{
    name: string;
    mcpUrl: string;
    oauth?: { clientId: string; clientSecret: string };
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/connections?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch connections');

      const data: ConnectionsResponse = await res.json();
      setConnections(data.connections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnectionName.trim()) return;

    try {
      setCreating(true);
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newConnectionName,
          description: newConnectionDesc || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create connection');
      }

      const data = await res.json();
      const mcpUrl = `${window.location.origin}/mcp/${data.connection.endpointUuid}`;

      // Close create modal and show success screen with MCP URL and OAuth credentials
      setShowCreateModal(false);
      setCreatedConnection({
        name: newConnectionName,
        mcpUrl,
        oauth: data.connection.oauth,
      });
      setCopied(false);
      setCopiedField(null);
      setNewConnectionName('');
      setNewConnectionDesc('');
      fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create connection');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'ACTIVE' | 'PAUSED') => {
    try {
      const res = await fetch(`/api/connections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update connection');
      fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update connection');
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/connections/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to revoke connection');
      fetchConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke connection');
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400">Active</span>;
      case 'PAUSED':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-500/20 text-amber-400">Paused</span>;
      case 'REVOKED':
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-500/20 text-red-400">Revoked</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-500/20 text-slate-400">{status}</span>;
    }
  };

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
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
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">MCP Connections</h1>
          <p className="text-slate-400 mt-1">
            Manage your AI client connections to ScreenControl
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Connection
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-300 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="REVOKED">Revoked</option>
        </select>
      </div>

      {/* Connections List */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-slate-400 mt-4">Loading connections...</p>
          </div>
        ) : connections.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-700 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-slate-400">No connections yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Create a connection to start using ScreenControl with Claude or other AI clients
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              Create your first connection
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {connections.map((conn) => (
              <div key={conn.id} className="p-4 hover:bg-slate-750 transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/connections/${conn.id}`}
                        className="text-white font-medium hover:text-blue-400 transition"
                      >
                        {conn.name}
                      </Link>
                      {getStatusBadge(conn.status)}
                      {conn.clientName && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400">
                          {conn.clientName}
                        </span>
                      )}
                    </div>
                    {conn.description && (
                      <p className="text-slate-400 text-sm mt-1 truncate">
                        {conn.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span>{conn.totalRequests.toLocaleString()} requests</span>
                      <span>Last used: {formatRelativeTime(conn.lastUsedAt)}</span>
                      <span>Created: {new Date(conn.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {conn.status !== 'REVOKED' && (
                      <>
                        <button
                          onClick={() => copyToClipboard(`${window.location.origin}/mcp/${conn.endpointUuid}`)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                          title="Copy MCP URL"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        {conn.status === 'ACTIVE' ? (
                          <button
                            onClick={() => handleStatusChange(conn.id, 'PAUSED')}
                            className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-700 rounded-lg transition"
                            title="Pause connection"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        ) : conn.status === 'PAUSED' && (
                          <button
                            onClick={() => handleStatusChange(conn.id, 'ACTIVE')}
                            className="p-2 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded-lg transition"
                            title="Resume connection"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleRevoke(conn.id, conn.name)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition"
                          title="Revoke connection"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
                      </>
                    )}
                    <Link
                      href={`/dashboard/connections/${conn.id}`}
                      className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                      title="View details"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-white mb-4">Create New Connection</h2>
            <form onSubmit={handleCreate}>
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  value={newConnectionName}
                  onChange={(e) => setNewConnectionName(e.target.value)}
                  placeholder="e.g., My Claude Desktop"
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  required
                  maxLength={100}
                />
              </div>
              <div className="mb-6">
                <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  value={newConnectionDesc}
                  onChange={(e) => setNewConnectionDesc(e.target.value)}
                  placeholder="e.g., Claude Desktop on my work laptop"
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newConnectionName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition"
                >
                  {creating ? 'Creating...' : 'Create Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal with MCP URL and Setup Instructions */}
      {createdConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Connection Created!</h2>
                <p className="text-slate-400 text-sm">{createdConnection.name}</p>
              </div>
            </div>

            {/* Connection Credentials */}
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-3 mb-4">
                <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-amber-200 font-medium">Save these credentials!</p>
                  <p className="text-amber-300/80 text-sm">The client secret cannot be retrieved later. Save it now.</p>
                </div>
              </div>

              {/* Credentials Table */}
              <div className="bg-slate-900 rounded-lg overflow-hidden">
                <table className="w-full">
                  <tbody className="divide-y divide-slate-700">
                    <tr>
                      <td className="px-4 py-3 text-slate-400 text-sm font-medium w-40">MCP Server URL</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-blue-400 font-mono text-sm break-all flex-1">{createdConnection.mcpUrl}</code>
                          <button
                            onClick={async () => {
                              await copyToClipboard(createdConnection.mcpUrl);
                              setCopiedField('mcpUrl');
                              setTimeout(() => setCopiedField(null), 2000);
                            }}
                            className={`px-2 py-1 text-xs rounded transition flex-shrink-0 ${
                              copiedField === 'mcpUrl' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                          >
                            {copiedField === 'mcpUrl' ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {createdConnection.oauth && (
                      <>
                        <tr>
                          <td className="px-4 py-3 text-slate-400 text-sm font-medium">OAuth Client ID</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <code className="text-slate-200 font-mono text-sm flex-1">{createdConnection.oauth.clientId}</code>
                              <button
                                onClick={async () => {
                                  await copyToClipboard(createdConnection.oauth!.clientId);
                                  setCopiedField('clientId');
                                  setTimeout(() => setCopiedField(null), 2000);
                                }}
                                className={`px-2 py-1 text-xs rounded transition flex-shrink-0 ${
                                  copiedField === 'clientId' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                              >
                                {copiedField === 'clientId' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr className="bg-amber-500/5">
                          <td className="px-4 py-3 text-slate-400 text-sm font-medium">OAuth Client Secret</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <code className="text-amber-200 font-mono text-sm break-all flex-1">{createdConnection.oauth.clientSecret}</code>
                              <button
                                onClick={async () => {
                                  await copyToClipboard(createdConnection.oauth!.clientSecret);
                                  setCopiedField('clientSecret');
                                  setTimeout(() => setCopiedField(null), 2000);
                                }}
                                className={`px-2 py-1 text-xs rounded transition flex-shrink-0 ${
                                  copiedField === 'clientSecret' ? 'bg-green-600 text-white' : 'bg-amber-600 text-white hover:bg-amber-500'
                                }`}
                              >
                                {copiedField === 'clientSecret' ? 'Copied!' : 'Copy'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Setup Instructions */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">Setup Instructions</h3>

              {/* Claude.ai */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-orange-500 rounded flex items-center justify-center text-white text-xs font-bold">C</div>
                  <h4 className="font-medium text-white">Claude.ai</h4>
                </div>
                <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
                  <li>Open Claude.ai in your browser</li>
                  <li>Click on your profile icon → Settings</li>
                  <li>Navigate to &quot;Integrations&quot; or &quot;MCP Servers&quot;</li>
                  <li>Click &quot;Add Integration&quot; and paste your MCP URL</li>
                  <li>Authorize when prompted to connect your account</li>
                </ol>
              </div>

              {/* Claude Code */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-purple-500 rounded flex items-center justify-center text-white text-xs font-bold">CC</div>
                  <h4 className="font-medium text-white">Claude Code (CLI)</h4>
                </div>
                <p className="text-sm text-slate-400 mb-2">Add to your <code className="bg-slate-800 px-1 rounded">~/.claude/settings.json</code>:</p>
                <pre className="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto">
{`{
  "mcpServers": {
    "screencontrol": {
      "url": "${createdConnection.mcpUrl}"
    }
  }
}`}
                </pre>
              </div>

              {/* Cursor */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-bold">Cu</div>
                  <h4 className="font-medium text-white">Cursor</h4>
                </div>
                <p className="text-sm text-slate-400 mb-2">Add to your <code className="bg-slate-800 px-1 rounded">.cursor/mcp.json</code>:</p>
                <pre className="bg-slate-950 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto">
{`{
  "mcpServers": {
    "screencontrol": {
      "url": "${createdConnection.mcpUrl}"
    }
  }
}`}
                </pre>
              </div>

              {/* Generic */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <h4 className="font-medium text-white">Other MCP Clients</h4>
                </div>
                <p className="text-sm text-slate-400">
                  Use the MCP URL above with any MCP-compatible client. The endpoint supports OAuth 2.1 with PKCE for secure authentication.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setCreatedConnection(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
