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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchConnection();
      await fetchLogs();
      setLoading(false);
    };
    load();
  }, [fetchConnection, fetchLogs]);

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
