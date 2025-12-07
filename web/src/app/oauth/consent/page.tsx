'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ConsentData {
  clientName: string;
  clientLogo?: string;
  clientUri?: string;
  scopes: Array<{ scope: string; name: string; description: string }>;
  agents: Array<{ id: string; hostname: string; osType: string; status: string }>;
  requestId: string;
  redirectUri: string;
  state?: string;
}

function ConsentForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestId = searchParams.get('request_id');

  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setError('Invalid authorization request');
      setIsLoading(false);
      return;
    }

    // Fetch consent data
    fetch('/api/oauth/consent?request_id=' + requestId)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load authorization request');
        return res.json();
      })
      .then(data => {
        setConsentData(data);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [requestId]);

  const handleDecision = async (allow: boolean) => {
    if (!requestId) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/oauth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, allow }),
      });

      const data = await res.json();
      
      if (data.redirect) {
        window.location.href = data.redirect;
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to process your decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
        <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-slate-400">Loading authorization request...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Authorization Error</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!consentData) return null;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
      {/* Client Info */}
      <div className="text-center mb-6">
        {consentData.clientLogo ? (
          <img 
            src={consentData.clientLogo} 
            alt={consentData.clientName}
            className="w-16 h-16 rounded-xl mx-auto mb-4"
          />
        ) : (
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">
              {consentData.clientName.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-white mb-2">
          Authorize {consentData.clientName}
        </h1>
        {consentData.clientUri && (
          <a 
            href={consentData.clientUri} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-slate-400 text-sm hover:text-slate-300"
          >
            {new URL(consentData.clientUri).hostname}
          </a>
        )}
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-yellow-200 font-medium">This application wants to control your computers</p>
            <p className="text-yellow-200/70 text-sm mt-1">
              Only authorize applications you trust. This grants remote access capabilities.
            </p>
          </div>
        </div>
      </div>

      {/* Requested Permissions */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Requested Permissions</h3>
        <div className="space-y-2">
          {consentData.scopes.map(scope => (
            <div key={scope.scope} className="flex items-start gap-3 bg-slate-700/50 rounded-lg p-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-white font-medium">{scope.name}</p>
                <p className="text-slate-400 text-sm">{scope.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Accessible Agents */}
      {consentData.agents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Accessible Machines</h3>
          <div className="space-y-2">
            {consentData.agents.map(agent => (
              <div key={agent.id} className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3">
                <div className={"w-2 h-2 rounded-full " + (agent.status === 'ONLINE' ? 'bg-green-400' : 'bg-slate-500')} />
                <div className="flex-1">
                  <p className="text-white">{agent.hostname || 'Unknown'}</p>
                  <p className="text-slate-400 text-sm">{agent.osType}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleDecision(false)}
          disabled={isSubmitting}
          className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg transition"
        >
          Deny
        </button>
        <button
          onClick={() => handleDecision(true)}
          disabled={isSubmitting}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </>
          ) : (
            'Allow Access'
          )}
        </button>
      </div>

      {/* Info Footer */}
      <p className="text-center text-slate-500 text-sm mt-6">
        You can revoke access at any time from your{' '}
        <Link href="/dashboard/connections" className="text-blue-400 hover:text-blue-300">
          dashboard
        </Link>
      </p>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">SC</span>
            </div>
            <span className="text-2xl font-bold text-white">ScreenControl</span>
          </Link>
        </div>

        {/* Consent Form */}
        <Suspense fallback={
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
            <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4" />
            </svg>
          </div>
        }>
          <ConsentForm />
        </Suspense>
      </div>
    </div>
  );
}
