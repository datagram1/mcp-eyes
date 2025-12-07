'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Agent {
  id: string;
  agentKey: string;
  hostname: string;
  machineId: string;
  fingerprint: string | null;
  fingerprintDetails: Record<string, unknown> | null;
  customerId: string | null;
  licenseUuid: string | null;
  osType: 'MACOS' | 'WINDOWS' | 'LINUX';
  osVersion: string | null;
  arch: string | null;
  agentVersion: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'SUSPENDED';
  state: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
  powerState: 'ACTIVE' | 'PASSIVE' | 'SLEEP';
  isScreenLocked: boolean;
  currentTask: string | null;
  ipAddress: string | null;
  localIpAddress: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastActivity: string | null;
  activatedAt: string | null;
  label: string | null;
  groupName: string | null;
  tags: string[];
  notes: string | null;
}

const osIcons: Record<string, string> = {
  MACOS: '🍎',
  WINDOWS: '🪟',
  LINUX: '🐧',
};

const statusColors: Record<string, string> = {
  ONLINE: 'bg-green-500',
  OFFLINE: 'bg-gray-500',
  SUSPENDED: 'bg-red-500',
};

const stateColors: Record<string, string> = {
  PENDING: 'bg-yellow-500',
  ACTIVE: 'bg-green-500',
  BLOCKED: 'bg-red-500',
  EXPIRED: 'bg-gray-500',
};

const powerStateColors: Record<string, string> = {
  ACTIVE: 'bg-green-400',
  PASSIVE: 'bg-blue-400',
  SLEEP: 'bg-purple-400',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AgentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [label, setLabel] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchAgent = async () => {
    try {
      const res = await fetch(`/api/agents/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Agent not found');
        } else {
          throw new Error('Failed to fetch agent');
        }
        return;
      }
      const data = await res.json();
      setAgent(data.agent);
      setLabel(data.agent.label || '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgent();
    const interval = setInterval(fetchAgent, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleStateChange = async (newState: string) => {
    setActionLoading(newState);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      });
      if (!res.ok) throw new Error('Failed to update state');
      await fetchAgent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLabelSave = async () => {
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error('Failed to update label');
      await fetchAgent();
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete agent');
      router.push('/dashboard/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setShowDeleteModal(false);
    }
  };

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const formatRelativeTime = (ts: string | null) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return `${Math.floor(diff / 86400000)} days ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/agents" className="text-blue-400 hover:text-blue-300">
          &larr; Back to Agents
        </Link>
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
          {error || 'Agent not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard/agents" className="text-slate-400 hover:text-white">
            &larr;
          </Link>
          <span className="text-4xl">{osIcons[agent.osType] || '💻'}</span>
          <div>
            {editMode ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={agent.hostname}
                  className="px-3 py-1 bg-slate-700 border border-slate-600 rounded text-white"
                />
                <button
                  onClick={handleLabelSave}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-3 py-1 bg-slate-600 text-white rounded hover:bg-slate-500"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h1
                className="text-2xl font-bold text-white cursor-pointer hover:text-blue-400"
                onClick={() => setEditMode(true)}
                title="Click to edit label"
              >
                {agent.label || agent.hostname}
              </h1>
            )}
            <p className="text-slate-400 text-sm">
              {agent.osType} {agent.osVersion} • {agent.arch}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowDeleteModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Delete Agent
        </button>
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-3">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${statusColors[agent.status]}`}>
          {agent.status === 'ONLINE' && (
            <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
          )}
          {agent.status}
        </span>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${stateColors[agent.state]}`}>
          {agent.state}
        </span>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${powerStateColors[agent.powerState]}`}>
          Power: {agent.powerState}
        </span>
        {agent.isScreenLocked && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-yellow-400 bg-yellow-900/50">
            🔒 Screen Locked
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="bg-slate-800 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">Actions</h3>
        <div className="flex flex-wrap gap-3">
          {agent.state === 'PENDING' && (
            <button
              onClick={() => handleStateChange('ACTIVE')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === 'ACTIVE' ? 'Activating...' : 'Activate Agent'}
            </button>
          )}
          {agent.state === 'ACTIVE' && (
            <button
              onClick={() => handleStateChange('PENDING')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
            >
              {actionLoading === 'PENDING' ? 'Deactivating...' : 'Deactivate Agent'}
            </button>
          )}
          {agent.state !== 'BLOCKED' && (
            <button
              onClick={() => handleStateChange('BLOCKED')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {actionLoading === 'BLOCKED' ? 'Blocking...' : 'Block Agent'}
            </button>
          )}
          {agent.state === 'BLOCKED' && (
            <button
              onClick={() => handleStateChange('PENDING')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {actionLoading === 'PENDING' ? 'Unblocking...' : 'Unblock Agent'}
            </button>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Machine Info */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Machine Information</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-slate-400">Hostname</dt>
              <dd className="text-white">{agent.hostname}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Machine ID</dt>
              <dd className="text-white font-mono text-sm">{agent.machineId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">OS Type</dt>
              <dd className="text-white">{agent.osType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">OS Version</dt>
              <dd className="text-white">{agent.osVersion || 'Unknown'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Architecture</dt>
              <dd className="text-white">{agent.arch || 'Unknown'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Agent Version</dt>
              <dd className="text-white">{agent.agentVersion || 'Unknown'}</dd>
            </div>
          </dl>
        </div>

        {/* Network Info */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Network</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-slate-400">Public IP</dt>
              <dd className="text-white font-mono">{agent.ipAddress || 'Unknown'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Local IP</dt>
              <dd className="text-white font-mono">{agent.localIpAddress || 'Unknown'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Customer ID</dt>
              <dd className="text-white font-mono text-sm">{agent.customerId || 'None'}</dd>
            </div>
          </dl>
        </div>

        {/* License Info */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">License</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-slate-400">State</dt>
              <dd>
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white ${stateColors[agent.state]}`}>
                  {agent.state}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">License UUID</dt>
              <dd className="text-white font-mono text-sm break-all">
                {agent.licenseUuid || 'Not licensed'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Activated At</dt>
              <dd className="text-white">{formatTimestamp(agent.activatedAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Activity Info */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Activity</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-slate-400">First Seen</dt>
              <dd className="text-white">{formatTimestamp(agent.firstSeenAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Last Seen</dt>
              <dd className="text-white">
                {formatTimestamp(agent.lastSeenAt)}
                <span className="text-slate-400 text-sm ml-2">
                  ({formatRelativeTime(agent.lastSeenAt)})
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Last Activity</dt>
              <dd className="text-white">{formatTimestamp(agent.lastActivity)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Current Task</dt>
              <dd className="text-white">{agent.currentTask || 'None'}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Fingerprint Details */}
      {agent.fingerprintDetails && (
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Hardware Fingerprint</h3>
          <div className="bg-slate-900 rounded p-3 font-mono text-sm text-slate-300 overflow-x-auto">
            <pre>{JSON.stringify(agent.fingerprintDetails, null, 2)}</pre>
          </div>
          {agent.fingerprint && (
            <p className="mt-2 text-slate-400 text-sm">
              Hash: <code className="text-slate-300">{agent.fingerprint}</code>
            </p>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">Delete Agent?</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete <strong>{agent.label || agent.hostname}</strong>?
              This action cannot be undone. The agent will need to be re-registered if you want
              to use it again.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
