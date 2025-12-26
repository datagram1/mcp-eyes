'use client';

import { useState, useEffect } from 'react';

interface EmailAgentSettings {
  id: string | null;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  imapTls: boolean;
  imapMailbox: string;
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  isEnabled: boolean;
  processInterval: number;
  autoReply: boolean;
  replySmtpHost: string;
  replySmtpPort: number;
  replySmtpUser: string;
  replySmtpPass: string;
  replySmtpTls: boolean;
  replyFromEmail: string;
  replyFromName: string;
  allowedSenders: string[];
  systemPrompt: string | null;
}

interface ServiceStatus {
  running: boolean;
  connected: boolean;
  llmProvider: string | null;
  queueLength: number;
}

interface EmailTask {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  status: string;
  priority: number;
  llmProvider: string | null;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export default function EmailAgentPage() {
  const [settings, setSettings] = useState<EmailAgentSettings | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [tasks, setTasks] = useState<EmailTask[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState<EmailAgentSettings>({
    id: null,
    imapHost: '',
    imapPort: 143,
    imapUser: '',
    imapPassword: '',
    imapTls: false,
    imapMailbox: 'INBOX',
    llmProvider: 'vllm',
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    isEnabled: false,
    processInterval: 60,
    autoReply: true,
    replySmtpHost: '',
    replySmtpPort: 25,
    replySmtpUser: '',
    replySmtpPass: '',
    replySmtpTls: false,
    replyFromEmail: '',
    replyFromName: 'ScreenControl AI',
    allowedSenders: [],
    systemPrompt: null,
  });

  // State for the allowed senders input
  const [allowedSendersInput, setAllowedSendersInput] = useState('');

  useEffect(() => {
    fetchData();
    // Refresh status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    await Promise.all([fetchSettings(), fetchStatus()]);
    setLoading(false);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/email-agent/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettings(data);
      setFormData(data);
      // Set the allowed senders input to show existing values
      setAllowedSendersInput((data.allowedSenders || []).join(', '));
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to load settings');
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/email-agent');
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus(data.service);
      setTasks(data.recentTasks || []);
      setStats(data.stats || {});
    } catch {
      // Status fetch is optional
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    // Parse allowed senders from comma-separated input
    const allowedSenders = allowedSendersInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      const res = await fetch('/api/email-agent/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, allowedSenders }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      showMessage('success', 'Settings saved successfully');
      fetchData();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleServiceAction = async (action: 'start' | 'stop') => {
    try {
      const res = await fetch('/api/email-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error(`Failed to ${action} service`);

      showMessage('success', `Email agent ${action === 'start' ? 'started' : 'stopped'}`);
      fetchStatus();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  const updateForm = (field: keyof EmailAgentSettings, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getStatusColor = (taskStatus: string) => {
    switch (taskStatus) {
      case 'COMPLETED':
        return 'text-green-400 bg-green-500/10';
      case 'FAILED':
        return 'text-red-400 bg-red-500/10';
      case 'ANALYZING':
      case 'EXECUTING':
        return 'text-yellow-400 bg-yellow-500/10';
      case 'PENDING':
        return 'text-blue-400 bg-blue-500/10';
      default:
        return 'text-slate-400 bg-slate-500/10';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Email Agent</h1>
        <p className="text-slate-400 mt-1">
          AI-powered email automation. Receive emails, analyze with LLM, execute ScreenControl actions.
        </p>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Status Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl mb-6">
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                status?.running && status?.connected
                  ? 'bg-green-500/20'
                  : status?.running
                    ? 'bg-yellow-500/20'
                    : 'bg-slate-700'
              }`}
            >
              <svg
                className={`w-6 h-6 ${
                  status?.running && status?.connected
                    ? 'text-green-400'
                    : status?.running
                      ? 'text-yellow-400'
                      : 'text-slate-400'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {status?.running && status?.connected
                  ? 'Connected & Running'
                  : status?.running
                    ? 'Running (Disconnected)'
                    : 'Stopped'}
              </h2>
              <p className="text-slate-400 text-sm">
                {status?.llmProvider ? `Using ${status.llmProvider.toUpperCase()}` : 'No LLM configured'}
                {status?.queueLength ? ` • ${status.queueLength} in queue` : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {status?.running ? (
              <button
                onClick={() => handleServiceAction('stop')}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => handleServiceAction('start')}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Start
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {Object.keys(stats).length > 0 && (
          <div className="border-t border-slate-700 p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(stats).map(([key, value]) => (
                <div key={key} className="text-center">
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-slate-400 text-sm">{key}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings Form */}
        <div className="space-y-6">
          {/* IMAP Settings */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Email Server (IMAP)</h2>
              <p className="text-slate-400 text-sm mt-1">Configure the incoming email server.</p>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">IMAP Host</label>
                  <input
                    type="text"
                    value={formData.imapHost}
                    onChange={(e) => updateForm('imapHost', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="mail.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={formData.imapPort}
                    onChange={(e) => updateForm('imapPort', parseInt(e.target.value) || 143)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={formData.imapUser}
                  onChange={(e) => updateForm('imapUser', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="agent@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={formData.imapPassword}
                  onChange={(e) => updateForm('imapPassword', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Mailbox</label>
                  <input
                    type="text"
                    value={formData.imapMailbox}
                    onChange={(e) => updateForm('imapMailbox', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="INBOX"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.imapTls}
                      onChange={(e) => updateForm('imapTls', e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-slate-300">Use TLS/SSL</span>
                  </label>
                </div>
              </div>
            </form>
          </div>

          {/* LLM Settings */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">AI/LLM Provider</h2>
              <p className="text-slate-400 text-sm mt-1">Configure the AI that processes emails.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Provider</label>
                <select
                  value={formData.llmProvider}
                  onChange={(e) => updateForm('llmProvider', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="vllm">vLLM / Open WebUI</option>
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai">OpenAI / ChatGPT</option>
                </select>
              </div>

              {formData.llmProvider === 'vllm' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Base URL</label>
                  <input
                    type="url"
                    value={formData.llmBaseUrl}
                    onChange={(e) => updateForm('llmBaseUrl', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="http://192.168.11.26:8080"
                  />
                </div>
              )}

              {(formData.llmProvider === 'claude' || formData.llmProvider === 'openai') && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                  <input
                    type="password"
                    value={formData.llmApiKey}
                    onChange={(e) => updateForm('llmApiKey', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="sk-..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Model (optional)</label>
                <input
                  type="text"
                  value={formData.llmModel}
                  onChange={(e) => updateForm('llmModel', e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    formData.llmProvider === 'claude'
                      ? 'claude-sonnet-4-20250514'
                      : formData.llmProvider === 'openai'
                        ? 'gpt-4o'
                        : 'default'
                  }
                />
              </div>
            </div>
          </div>

          {/* Reply SMTP Settings */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Reply SMTP Server</h2>
              <p className="text-slate-400 text-sm mt-1">Configure the outgoing email server for replies.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={formData.replySmtpHost}
                    onChange={(e) => updateForm('replySmtpHost', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="192.168.10.6"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Port</label>
                  <input
                    type="number"
                    value={formData.replySmtpPort}
                    onChange={(e) => updateForm('replySmtpPort', parseInt(e.target.value) || 25)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Username (optional)</label>
                  <input
                    type="text"
                    value={formData.replySmtpUser}
                    onChange={(e) => updateForm('replySmtpUser', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty for no auth"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Password (optional)</label>
                  <input
                    type="password"
                    value={formData.replySmtpPass}
                    onChange={(e) => updateForm('replySmtpPass', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty for no auth"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">From Email</label>
                  <input
                    type="email"
                    value={formData.replyFromEmail}
                    onChange={(e) => updateForm('replyFromEmail', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ai@screencontrol.local"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">From Name</label>
                  <input
                    type="text"
                    value={formData.replyFromName}
                    onChange={(e) => updateForm('replyFromName', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ScreenControl AI"
                  />
                </div>
              </div>

              <div className="flex items-center pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.replySmtpTls}
                    onChange={(e) => updateForm('replySmtpTls', e.target.checked)}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-slate-300">Use TLS/SSL</span>
                </label>
              </div>
            </div>
          </div>

          {/* Security Settings */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Security</h2>
              <p className="text-slate-400 text-sm mt-1">Control who can trigger the email agent.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Allowed Senders</label>
                <textarea
                  value={allowedSendersInput}
                  onChange={(e) => setAllowedSendersInput(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="richard.brown@knws.co.uk"
                  rows={3}
                />
                <p className="text-slate-500 text-sm mt-1">
                  Comma-separated email addresses. Use *@domain.com for wildcard matching.
                  <span className="text-yellow-400"> If empty, all emails will be rejected.</span>
                </p>
              </div>
            </div>
          </div>

          {/* Behavior Settings */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl">
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Behavior</h2>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isEnabled}
                  onChange={(e) => updateForm('isEnabled', e.target.checked)}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <span className="text-white font-medium">Enable Email Agent</span>
                  <p className="text-slate-400 text-sm">Start processing emails automatically</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoReply}
                  onChange={(e) => updateForm('autoReply', e.target.checked)}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500"
                />
                <div>
                  <span className="text-white font-medium">Auto-Reply</span>
                  <p className="text-slate-400 text-sm">Send reply emails with results</p>
                </div>
              </label>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white px-6 py-2 rounded-lg font-medium transition"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl">
          <div className="p-6 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Recent Email Tasks</h2>
            <p className="text-slate-400 text-sm mt-1">Emails processed by the agent.</p>
          </div>
          <div className="divide-y divide-slate-700 max-h-[600px] overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p>No emails processed yet</p>
                <p className="text-sm mt-1">Emails will appear here when received</p>
              </div>
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="p-4 hover:bg-slate-700/50 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{task.subject}</p>
                      <p className="text-slate-400 text-sm truncate">
                        {task.fromName || task.fromAddress}
                      </p>
                      <p className="text-slate-500 text-xs mt-1">
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                  </div>
                  {task.errorMessage && (
                    <p className="text-red-400 text-sm mt-2 truncate">{task.errorMessage}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
