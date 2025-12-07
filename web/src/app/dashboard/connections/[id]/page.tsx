'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface RequestLog {
  id: string;
  method: string;
  toolName: string | null;
  params: Record<string, unknown> | null;
  success: boolean;
  errorCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface OAuthClient {
  clientId: string;
  clientName: string;
  createdAt: string;
}

interface OAuthEndpoints {
  authorization: string;
  token: string;
  discovery: string;
}

interface Connection {
  id: string;
  endpointUuid: string;
  name: string;
  description: string | null;
  clientName: string | null;
  connectedClientId: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED';
  lastUsedAt: string | null;
  totalRequests: number;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  mcpUrl: string;
  oauthClient: OAuthClient | null;
  oauthEndpoints: OAuthEndpoints;
  _count: {
    tokens: number;
    requestLogs: number;
  };
  requestLogs: RequestLog[];
}

interface LogsResponse {
  logs: RequestLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  stats: {
    byMethod: Record<string, number>;
    successCount: number;
    failureCount: number;
  };
}

interface Download {
  id: string;
  platform: 'MACOS' | 'WINDOWS' | 'LINUX';
  variant: string | null;
  version: string;
  ipAddress: string | null;
  userAgent: string | null;
  downloadedAt: string;
}

interface DownloadsResponse {
  downloads: Download[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  stats: {
    total: number;
    byPlatform: Record<string, number>;
  };
}

export default function ConnectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const connectionId = params.id as string;

  const [connection, setConnection] = useState<Connection | null>(null);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [logsPagination, setLogsPagination] = useState({ total: 0, hasMore: false, offset: 0 });
  const [logStats, setLogStats] = useState<{ byMethod: Record<string, number>; successCount: number; failureCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [downloadStats, setDownloadStats] = useState<{ total: number; byPlatform: Record<string, number> } | null>(null);
  const [showInstructions, setShowInstructions] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [newOAuthSecret, setNewOAuthSecret] = useState<string | null>(null);

  const fetchConnection = useCallback(async () => {
    try {
      const res = await fetch(`/api/connections/${connectionId}`);
      if (!res.ok) {
        if (res.status === 404) {
          router.push('/dashboard/connections');
          return;
        }
        throw new Error('Failed to fetch connection');
      }
      const data = await res.json();
      setConnection(data.connection);
      setEditName(data.connection.name);
      setEditDesc(data.connection.description || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [connectionId, router]);

  const fetchLogs = useCallback(async (offset = 0) => {
    try {
      const res = await fetch(`/api/connections/${connectionId}/logs?limit=20&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data: LogsResponse = await res.json();

      if (offset === 0) {
        setLogs(data.logs);
      } else {
        setLogs(prev => [...prev, ...data.logs]);
      }
      setLogsPagination({ total: data.pagination.total, hasMore: data.pagination.hasMore, offset: data.pagination.offset });
      setLogStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, [connectionId]);

  const fetchDownloads = useCallback(async () => {
    try {
      const res = await fetch(`/api/connections/${connectionId}/downloads?limit=10`);
      if (!res.ok) return;
      const data: DownloadsResponse = await res.json();
      setDownloads(data.downloads);
      setDownloadStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch downloads:', err);
    }
  }, [connectionId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchConnection();
      await Promise.all([fetchLogs(), fetchDownloads()]);
      setLoading(false);
    };
    load();
  }, [fetchConnection, fetchLogs, fetchDownloads]);

  const handleSave = async () => {
    if (!editName.trim()) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDesc || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to update connection');

      await fetchConnection();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: 'ACTIVE' | 'PAUSED') => {
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');
      fetchConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleRevoke = async () => {
    if (!connection) return;
    if (!confirm(`Are you sure you want to revoke "${connection.name}"? This action cannot be undone and will invalidate all associated tokens.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to revoke connection');
      router.push('/dashboard/connections');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    }
  };

  const copyUrl = async () => {
    if (!connection) return;
    await navigator.clipboard.writeText(connection.mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRegenerateOAuth = async () => {
    if (!connection) return;
    if (!confirm('Regenerate OAuth credentials? This will disconnect all currently connected clients (like Claude). They will need to be reconnected with the new credentials.')) {
      return;
    }

    setRegenerating(true);
    setNewOAuthSecret(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to regenerate credentials');
      }

      const data = await res.json();
      setNewOAuthSecret(data.connection.oauth.clientSecret);
      await fetchConnection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setRegenerating(false);
    }
  };

  const handleDownload = async (platform: string) => {
    if (!connection) return;
    setDownloading(platform);

    try {
      const res = await fetch(`/api/connections/${connectionId}/download?platform=${platform}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Download failed');
      }

      // Get filename from header or generate one
      const disposition = res.headers.get('content-disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `ScreenControl-${platform}`;

      // Create blob and trigger download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(null);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-500/20 text-green-400">Active</span>;
      case 'PAUSED':
        return <span className="px-3 py-1 text-sm font-medium rounded-full bg-amber-500/20 text-amber-400">Paused</span>;
      case 'REVOKED':
        return <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-500/20 text-red-400">Revoked</span>;
      default:
        return <span className="px-3 py-1 text-sm font-medium rounded-full bg-slate-500/20 text-slate-400">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Connection not found</p>
        <Link href="/dashboard/connections" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">
          Back to connections
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard/connections" className="text-slate-400 hover:text-white transition">
          &larr; Back to Connections
        </Link>
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

      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full max-w-md bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    className="w-full max-w-md bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !editName.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditName(connection.name);
                      setEditDesc(connection.description || '');
                    }}
                    className="px-4 py-2 text-slate-300 hover:text-white transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">{connection.name}</h1>
                  {getStatusBadge(connection.status)}
                  {connection.clientName && (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400">
                      {connection.clientName}
                    </span>
                  )}
                </div>
                {connection.description && (
                  <p className="text-slate-400 mt-2">{connection.description}</p>
                )}
              </>
            )}
          </div>
          {!editing && connection.status !== 'REVOKED' && (
            <button
              onClick={() => setEditing(true)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* MCP URL */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">MCP Endpoint URL</h2>
        <div className="flex items-center gap-4">
          <code className="flex-1 bg-slate-900 rounded-lg px-4 py-3 font-mono text-sm text-slate-300 break-all">
            {connection.mcpUrl}
          </code>
          <button
            onClick={copyUrl}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              copied
                ? 'bg-green-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
        <p className="text-slate-500 text-sm mt-2">
          Use this URL in your Claude config or other MCP clients
        </p>
      </div>

      {/* Claude Integration / OAuth Credentials */}
      {connection.status !== 'REVOKED' && connection.oauthClient && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Connect to Claude</h2>
              <p className="text-slate-400 text-sm mt-1">Use these credentials to connect Claude or other AI clients</p>
            </div>
            <button
              onClick={handleRegenerateOAuth}
              disabled={regenerating}
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg transition flex items-center gap-2"
            >
              {regenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Regenerating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate Credentials
                </>
              )}
            </button>
          </div>

          {/* New Secret Warning */}
          {newOAuthSecret && (
            <div className="mb-4 p-4 bg-amber-500/20 border border-amber-500/50 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-amber-200 font-medium">New credentials generated!</p>
                  <p className="text-amber-300/80 text-sm mt-1">Save the client secret below - it cannot be retrieved later. Previous connections have been revoked.</p>
                </div>
              </div>
            </div>
          )}

          {/* Credentials Table */}
          <div className="bg-slate-900 rounded-lg overflow-hidden">
            <table className="w-full">
              <tbody className="divide-y divide-slate-700">
                <tr>
                  <td className="px-4 py-3 text-slate-400 text-sm font-medium w-48">MCP Server URL</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-slate-200 font-mono text-sm break-all flex-1">{connection.mcpUrl}</code>
                      <button
                        onClick={() => copyToClipboard(connection.mcpUrl, 'mcpUrl')}
                        className={`px-2 py-1 text-xs rounded transition flex-shrink-0 ${
                          copiedField === 'mcpUrl' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {copiedField === 'mcpUrl' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-slate-400 text-sm font-medium">OAuth Client ID</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-slate-200 font-mono text-sm flex-1">{connection.oauthClient.clientId}</code>
                      <button
                        onClick={() => copyToClipboard(connection.oauthClient!.clientId, 'clientId')}
                        className={`px-2 py-1 text-xs rounded transition flex-shrink-0 ${
                          copiedField === 'clientId' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {copiedField === 'clientId' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr className={newOAuthSecret ? 'bg-amber-500/10' : ''}>
                  <td className="px-4 py-3 text-slate-400 text-sm font-medium">OAuth Client Secret</td>
                  <td className="px-4 py-3">
                    {newOAuthSecret ? (
                      <div className="flex items-center gap-2">
                        <code className="text-amber-200 font-mono text-sm break-all flex-1">{newOAuthSecret}</code>
                        <button
                          onClick={() => copyToClipboard(newOAuthSecret, 'clientSecret')}
                          className={`px-2 py-1 text-xs rounded transition flex-shrink-0 ${
                            copiedField === 'clientSecret' ? 'bg-green-600 text-white' : 'bg-amber-600 text-white hover:bg-amber-500'
                          }`}
                        >
                          {copiedField === 'clientSecret' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-500 text-sm italic">Hidden - click &quot;Regenerate Credentials&quot; to get a new one</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* OAuth Endpoints */}
          <div className="mt-4 p-4 bg-slate-900 rounded-lg">
            <h3 className="text-sm font-medium text-slate-300 mb-3">OAuth Endpoints (for reference)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-28">Authorization:</span>
                <code className="text-slate-400 font-mono text-xs">{connection.oauthEndpoints.authorization}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-28">Token:</span>
                <code className="text-slate-400 font-mono text-xs">{connection.oauthEndpoints.token}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-28">Discovery:</span>
                <code className="text-slate-400 font-mono text-xs">{connection.oauthEndpoints.discovery}</code>
              </div>
            </div>
          </div>

          {/* Claude Instructions */}
          <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="text-blue-300 font-medium mb-2">How to connect Claude</h3>
            <ol className="list-decimal list-inside space-y-1.5 text-blue-200/80 text-sm">
              <li>Go to <strong>Settings → Connectors</strong> in Claude</li>
              <li>Click <strong>&quot;Add custom connector&quot;</strong></li>
              <li>Enter your <strong>MCP Server URL</strong> from above</li>
              <li>Click <strong>&quot;Advanced settings&quot;</strong></li>
              <li>Enter the <strong>OAuth Client ID</strong> and <strong>Client Secret</strong></li>
              <li>Click <strong>&quot;Add&quot;</strong> to finish</li>
            </ol>
            <p className="text-blue-300/60 text-xs mt-3">
              The token endpoint supports both PKCE (for Claude Code) and client_secret_post (for Claude.ai).
            </p>
          </div>
        </div>
      )}

      {/* Stats & Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-400 text-sm">Total Requests</p>
          <p className="text-2xl font-bold text-white mt-1">{connection.totalRequests.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-400 text-sm">Success Rate</p>
          <p className="text-2xl font-bold text-white mt-1">
            {logStats && connection.totalRequests > 0
              ? `${Math.round((logStats.successCount / connection.totalRequests) * 100)}%`
              : 'N/A'}
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-400 text-sm">Last Used</p>
          <p className="text-2xl font-bold text-white mt-1">{formatRelativeTime(connection.lastUsedAt)}</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <p className="text-slate-400 text-sm">Active Tokens</p>
          <p className="text-2xl font-bold text-white mt-1">{connection._count.tokens}</p>
        </div>
      </div>

      {/* Actions */}
      {connection.status !== 'REVOKED' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            {connection.status === 'ACTIVE' ? (
              <button
                onClick={() => handleStatusChange('PAUSED')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pause Connection
              </button>
            ) : (
              <button
                onClick={() => handleStatusChange('ACTIVE')}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Resume Connection
              </button>
            )}
            <button
              onClick={handleRevoke}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Revoke Connection
            </button>
          </div>
        </div>
      )}

      {/* Agent Downloads */}
      {connection.status !== 'REVOKED' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-2">Download Agent</h2>
          <p className="text-slate-400 text-sm mb-4">
            Download a pre-configured agent for your platform. The agent will automatically connect to this MCP endpoint.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* macOS */}
            <button
              onClick={() => handleDownload('macos')}
              disabled={downloading !== null}
              className="flex flex-col items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition"
            >
              <span className="text-4xl">🍎</span>
              <div className="text-center">
                <p className="text-white font-medium">macOS</p>
                <p className="text-slate-400 text-xs">Universal (Intel & Apple Silicon)</p>
              </div>
              {downloading === 'macos' && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              )}
            </button>

            {/* Windows */}
            <button
              onClick={() => handleDownload('windows')}
              disabled={downloading !== null}
              className="flex flex-col items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition"
            >
              <span className="text-4xl">🪟</span>
              <div className="text-center">
                <p className="text-white font-medium">Windows</p>
                <p className="text-slate-400 text-xs">Windows 10/11 (x64)</p>
              </div>
              {downloading === 'windows' && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              )}
            </button>

            {/* Linux GUI */}
            <button
              onClick={() => handleDownload('linux-gui')}
              disabled={downloading !== null}
              className="flex flex-col items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition"
            >
              <span className="text-4xl">🐧</span>
              <div className="text-center">
                <p className="text-white font-medium">Linux (GUI)</p>
                <p className="text-slate-400 text-xs">Desktop with X11/Wayland</p>
              </div>
              {downloading === 'linux-gui' && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              )}
            </button>

            {/* Linux Headless */}
            <button
              onClick={() => handleDownload('linux-headless')}
              disabled={downloading !== null}
              className="flex flex-col items-center gap-3 p-4 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition"
            >
              <span className="text-4xl">🖥️</span>
              <div className="text-center">
                <p className="text-white font-medium">Linux (Headless)</p>
                <p className="text-slate-400 text-xs">Servers, no display</p>
              </div>
              {downloading === 'linux-headless' && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              )}
            </button>
          </div>
          <div className="mt-4 p-3 bg-slate-900 rounded-lg">
            <p className="text-slate-400 text-sm">
              <span className="text-blue-400 font-medium">Endpoint UUID:</span>{' '}
              <code className="text-slate-300 font-mono text-xs">{connection.endpointUuid}</code>
            </p>
            <p className="text-slate-500 text-xs mt-1">
              This ID will be embedded in the downloaded agent to connect it to this MCP endpoint.
            </p>
          </div>

          {/* Installation Instructions */}
          <div className="mt-6 border-t border-slate-700 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Installation Instructions</h3>
              <div className="flex gap-2">
                {['macos', 'windows', 'linux'].map((platform) => (
                  <button
                    key={platform}
                    onClick={() => setShowInstructions(showInstructions === platform ? null : platform)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition ${
                      showInstructions === platform
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {platform === 'macos' ? 'macOS' : platform === 'windows' ? 'Windows' : 'Linux'}
                  </button>
                ))}
              </div>
            </div>

            {showInstructions === 'macos' && (
              <div className="bg-slate-900 rounded-lg p-4 text-sm">
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li>Download the macOS agent above</li>
                  <li>Open the downloaded <code className="text-blue-400">.dmg</code> file</li>
                  <li>Drag <span className="text-white font-medium">ScreenControl.app</span> to your Applications folder</li>
                  <li>Open ScreenControl from Applications</li>
                  <li>Grant Accessibility permissions when prompted (System Settings &rarr; Privacy &amp; Security &rarr; Accessibility)</li>
                  <li>Grant Screen Recording permissions when prompted</li>
                  <li>The agent will automatically connect to this MCP endpoint</li>
                </ol>
                <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                  <p className="text-slate-400 text-xs">
                    <span className="text-amber-400 font-medium">Note:</span> You may need to right-click the app and select &quot;Open&quot; the first time to bypass Gatekeeper.
                  </p>
                </div>
              </div>
            )}

            {showInstructions === 'windows' && (
              <div className="bg-slate-900 rounded-lg p-4 text-sm">
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li>Download the Windows agent above</li>
                  <li>Run the <code className="text-blue-400">ScreenControl-Setup.exe</code> installer</li>
                  <li>Follow the installation wizard</li>
                  <li>Launch ScreenControl from the Start Menu or system tray</li>
                  <li>Allow Windows Firewall access if prompted</li>
                  <li>The agent will automatically connect to this MCP endpoint</li>
                </ol>
                <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                  <p className="text-slate-400 text-xs">
                    <span className="text-amber-400 font-medium">Note:</span> Windows may show a SmartScreen warning. Click &quot;More info&quot; then &quot;Run anyway&quot; to proceed.
                  </p>
                </div>
              </div>
            )}

            {showInstructions === 'linux' && (
              <div className="bg-slate-900 rounded-lg p-4 text-sm">
                <h4 className="text-white font-medium mb-2">GUI Desktop (X11/Wayland)</h4>
                <ol className="list-decimal list-inside space-y-2 text-slate-300 mb-4">
                  <li>Download the Linux GUI agent above</li>
                  <li>Extract: <code className="text-blue-400">tar xzf ScreenControl-linux-gui.tar.gz</code></li>
                  <li>Make executable: <code className="text-blue-400">chmod +x screencontrol</code></li>
                  <li>Run: <code className="text-blue-400">./screencontrol</code></li>
                </ol>
                <h4 className="text-white font-medium mb-2">Headless Server</h4>
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  <li>Download the Linux Headless agent above</li>
                  <li>Extract: <code className="text-blue-400">tar xzf ScreenControl-linux-headless.tar.gz</code></li>
                  <li>Make executable: <code className="text-blue-400">chmod +x screencontrol-headless</code></li>
                  <li>Run: <code className="text-blue-400">./screencontrol-headless</code></li>
                  <li>Optional: Install as systemd service for auto-start</li>
                </ol>
                <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                  <p className="text-slate-400 text-xs">
                    <span className="text-amber-400 font-medium">Systemd Service:</span> Copy the included <code className="text-blue-400">screencontrol.service</code> to <code className="text-blue-400">/etc/systemd/system/</code> and run <code className="text-blue-400">systemctl enable --now screencontrol</code>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Download History */}
      {downloadStats && downloadStats.total > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Download History</h2>
            <div className="flex gap-3 text-sm">
              {downloadStats.byPlatform.MACOS && (
                <span className="text-slate-400">macOS: <span className="text-white">{downloadStats.byPlatform.MACOS}</span></span>
              )}
              {downloadStats.byPlatform.WINDOWS && (
                <span className="text-slate-400">Windows: <span className="text-white">{downloadStats.byPlatform.WINDOWS}</span></span>
              )}
              {downloadStats.byPlatform.LINUX && (
                <span className="text-slate-400">Linux: <span className="text-white">{downloadStats.byPlatform.LINUX}</span></span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {downloads.map((download) => (
              <div key={download.id} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {download.platform === 'MACOS' ? '🍎' : download.platform === 'WINDOWS' ? '🪟' : '🐧'}
                  </span>
                  <div>
                    <p className="text-white text-sm">
                      {download.platform} {download.variant && `(${download.variant})`}
                    </p>
                    <p className="text-slate-500 text-xs">v{download.version}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-sm">{formatRelativeTime(download.downloadedAt)}</p>
                  {download.ipAddress && (
                    <p className="text-slate-500 text-xs font-mono">{download.ipAddress}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {downloadStats.total > downloads.length && (
            <p className="text-center text-slate-500 text-sm mt-3">
              Showing {downloads.length} of {downloadStats.total} downloads
            </p>
          )}
        </div>
      )}

      {/* Request Logs */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Request Logs</h2>
          {logStats && (
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              {Object.entries(logStats.byMethod).slice(0, 5).map(([method, count]) => (
                <span key={method} className="text-slate-400">
                  {method}: <span className="text-white">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-700 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-slate-400">No requests logged yet</p>
            <p className="text-slate-500 text-sm mt-1">
              Requests will appear here once the connection is used
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-700">
              {logs.map((log) => (
                <div key={log.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${log.success ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-white font-mono text-sm">{log.method}</span>
                        {log.toolName && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-700 text-slate-300">
                            {log.toolName}
                          </span>
                        )}
                      </div>
                      {log.errorMessage && (
                        <p className="text-red-400 text-sm mt-1">{log.errorMessage}</p>
                      )}
                    </div>
                    <div className="text-right text-sm text-slate-500 ml-4">
                      {log.durationMs !== null && <span className="mr-3">{log.durationMs}ms</span>}
                      <span>{formatRelativeTime(log.createdAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {logsPagination.hasMore && (
              <div className="p-4 text-center border-t border-slate-700">
                <button
                  onClick={() => fetchLogs(logsPagination.offset + 20)}
                  className="text-blue-400 hover:text-blue-300 font-medium"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Connection Details */}
      <div className="mt-6 bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Connection Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-400">Connection ID</dt>
            <dd className="text-white font-mono mt-1">{connection.id}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Endpoint UUID</dt>
            <dd className="text-white font-mono mt-1">{connection.endpointUuid}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Created</dt>
            <dd className="text-white mt-1">{new Date(connection.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Last Updated</dt>
            <dd className="text-white mt-1">{new Date(connection.updatedAt).toLocaleString()}</dd>
          </div>
          {connection.revokedAt && (
            <div>
              <dt className="text-slate-400">Revoked</dt>
              <dd className="text-red-400 mt-1">{new Date(connection.revokedAt).toLocaleString()}</dd>
            </div>
          )}
          {connection.connectedClientId && (
            <div>
              <dt className="text-slate-400">OAuth Client ID</dt>
              <dd className="text-white font-mono mt-1">{connection.connectedClientId}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
