'use client';

import { useEffect, useState } from 'react';

export default function MCPCallbackPage() {
  const [status, setStatus] = useState<'exchanging' | 'success' | 'error'>('exchanging');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      setStatus('error');
      setErrorMessage(urlParams.get('error_description') || error);
      if (window.opener) {
        window.opener.postMessage({ type: 'MCP_OAUTH_ERROR', error }, window.location.origin);
      }
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setErrorMessage('Missing OAuth authorization code or state');
      return;
    }

    // Exchange code for token
    fetch('/api/marketplace/oauth/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state })
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data.success) {
          setStatus('success');
          if (window.opener) {
            window.opener.postMessage({ type: 'MCP_OAUTH_SUCCESS', pluginId: data.plugin_id }, window.location.origin);
            setTimeout(() => {
              window.close();
            }, 1000);
          }
        } else {
          setStatus('error');
          setErrorMessage(data.detail || data.error || 'Failed to exchange authorization code');
        }
      })
      .catch(err => {
        setStatus('error');
        setErrorMessage(err.message || 'Network error');
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full p-8 rounded-3xl bg-[#141414] border border-[#262626] text-center shadow-2xl">
        {status === 'exchanging' && (
          <div>
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-base font-semibold">Completing connection...</h2>
            <p className="text-xs text-[#888] mt-2">Exchanging tokens and securing credentials.</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="w-12 h-12 bg-emerald-950/60 border border-emerald-700/60 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400 text-xl font-bold">
              ✓
            </div>
            <h2 className="text-base font-semibold">Connected Successfully!</h2>
            <p className="text-xs text-[#888] mt-2">You can close this window now.</p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="w-12 h-12 bg-red-950/60 border border-red-700/60 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400 text-xl font-bold">
              ✗
            </div>
            <h2 className="text-base font-semibold text-red-300">Connection Failed</h2>
            <p className="text-xs text-red-400/80 mt-2 bg-red-950/30 p-2.5 rounded-xl border border-red-900/40">
              {errorMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
