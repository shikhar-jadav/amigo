'use client';

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Info,
  Minus,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface McpCheckItem {
  title: string;
  status_code: number;
  state: 'done' | 'skipped' | 'warn' | 'error';
  detail?: string;
}

interface McpPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (plugin?: any) => void;
}

export const McpPublishModal: React.FC<McpPublishModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'input' | 'auth'>('input');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [customHeader, setCustomHeader] = useState('');

  // Live verification state
  const [isChecking, setIsChecking] = useState(false);
  const [checkPassed, setCheckPassed] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checks, setChecks] = useState<McpCheckItem[]>([]);
  const [detectedData, setDetectedData] = useState<{
    server_name?: string;
    description?: string;
    tools?: any[];
    requires_auth?: boolean;
    detected_auth?: 'no_signin' | 'signin_now' | 'signin_needed';
  } | null>(null);

  // Authentication selection
  const [authOption, setAuthOption] = useState<'signin_now' | 'signin_needed' | 'no_signin'>('no_signin');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time server probe
  const handleCheckServer = async (targetUrl?: string) => {
    const probeUrl = (targetUrl || url).trim();
    if (!probeUrl) return;

    setIsChecking(true);
    setCheckError(null);
    setCheckPassed(false);
    setChecks([
      { title: 'Connecting to the server', status_code: 0, state: 'done', detail: 'Connecting...' },
    ]);

    try {
      const res = await fetch('/api/marketplace/verify/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint_url: probeUrl, auth_header: customHeader || undefined }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        setChecks(data.checks || [
          { title: 'Connecting to the server', status_code: data.status_code || 200, state: 'done' },
          { title: 'Looking up sign-in settings', status_code: 200, state: 'skipped' },
          { title: 'Checking the sign-in provider', status_code: 200, state: 'skipped' },
        ]);
        setDetectedData(data);
        setCheckPassed(true);

        // Pre-fill server name if user hasn't typed one
        if (!name && data.server_name) {
          setName(data.server_name);
        }

        // Accurately pre-select detected auth option
        if (data.detected_auth) {
          setAuthOption(data.detected_auth);
        } else if (data.requires_auth) {
          setAuthOption('signin_now');
        } else {
          setAuthOption('no_signin');
        }
      } else {
        setCheckError(data.error || 'Failed to connect to MCP server');
        if (data.checks && Array.isArray(data.checks)) {
          setChecks(data.checks);
        }
      }
    } catch (err: any) {
      setCheckError(err.message || 'Network error while checking server');
      setChecks([
        { title: 'Connecting to the server', status_code: 0, state: 'error', detail: err.message },
        { title: 'Looking up sign-in settings', status_code: 0, state: 'skipped' },
        { title: 'Checking the sign-in provider', status_code: 0, state: 'skipped' },
      ]);
    } finally {
      setIsChecking(false);
    }
  };

  const handleContinue = async () => {
    if (!checkPassed) {
      await handleCheckServer();
      return;
    }
    setStep('auth');
  };

  const handlePublish = async () => {
    if (!name.trim() || !url.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mcp-server';

    try {
      const res = await fetch('/api/marketplace/publish/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: detectedData?.description || `${name} remote MCP server`,
          endpoint_url: url.trim(),
          auth_type: authOption === 'no_signin' ? 'none' : 'bearer',
          // MCP connectors do NOT have versions
          version: '1.0.0',
          category: 'MCP Servers',
          tags: ['MCP', 'Remote Tools'],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to publish MCP connector');
      }

      onSuccess(data.plugin || data);
      onClose();
    } catch (err: any) {
      setSubmitError(err.message || 'Error publishing MCP connector');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-[500px] overflow-hidden rounded-3xl bg-[#141414] border border-[#242424] shadow-2xl p-6 sm:p-7 text-[#ccc]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-[#777] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Title & Subtitle */}
        <h2 className="text-xl font-bold text-white tracking-tight">Add custom connector</h2>
        <p className="text-xs text-[#8e8e8e] mt-1.5 leading-relaxed">
          Connect Talos to your data and tools.{' '}
          <span className="text-[#a8a8a8] hover:text-white underline cursor-pointer">Learn more about connectors</span>{' '}
          or get started with{' '}
          <span className="text-[#a8a8a8] hover:text-white underline cursor-pointer">pre-built ones</span>.
        </p>

        {step === 'input' ? (
          /* STEP 1: Name, URL and Live Server Verification */
          <div className="mt-5 space-y-4">
            <div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full rounded-xl bg-[#1d1d1d] border border-[#2b2b2b] px-3.5 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
              />
              <p className="text-[11px] text-[#777] mt-1 pl-1">Shown in the connectors list.</p>
            </div>

            <div>
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setCheckPassed(false);
                }}
                onBlur={() => {
                  if (url.trim().startsWith('http')) {
                    handleCheckServer();
                  }
                }}
                placeholder="MCP server URL"
                className="w-full rounded-xl bg-[#1d1d1d] border border-[#2b2b2b] px-3.5 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
              />
              <p className="text-[11px] text-[#777] mt-1 pl-1">
                The HTTPS address where the server accepts MCP requests, for example https://mcp.example.com/mcp.
              </p>
            </div>

            {/* Live Verification Box */}
            {(isChecking || checks.length > 0) && (
              <div className="pt-2 animate-in fade-in duration-200">
                <h4 className="text-xs font-semibold text-white mb-2.5 flex items-center justify-between">
                  <span>Checking the server...</span>
                  {isChecking && <Loader2 size={13} className="animate-spin text-white" />}
                </h4>

                <div className="space-y-2 border-l border-[#242424] pl-3 ml-1.5 py-0.5">
                  {checks.map((chk, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {chk.state === 'done' ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={12} className="text-emerald-400" />
                          </div>
                        ) : chk.state === 'error' ? (
                          <div className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                            <AlertTriangle size={12} className="text-red-400" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-[#222] text-[#666] flex items-center justify-center shrink-0">
                            <Minus size={10} />
                          </div>
                        )}
                        <div>
                          <p className="text-[#ccc] text-[12px]">{chk.title}</p>
                          <p className="text-[10px] text-[#666] capitalize">{chk.state}</p>
                        </div>
                      </div>

                      {chk.status_code > 0 && (
                        <span
                          className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                            chk.status_code >= 200 && chk.status_code < 300
                              ? 'text-emerald-400 bg-emerald-950/40'
                              : chk.status_code === 401 || chk.status_code === 403
                              ? 'text-amber-400 bg-amber-950/40'
                              : 'text-red-400 bg-red-950/40'
                          }`}
                        >
                          {chk.status_code}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Status Result Pill */}
                {checkPassed && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a1a1a] border border-[#262626] text-xs text-white">
                    <Info size={14} className="text-white shrink-0" />
                    <span className="font-medium">Server found</span>
                    {detectedData?.tools && detectedData.tools.length > 0 && (
                      <span className="text-[#888] ml-auto text-[11px]">
                        {detectedData.tools.length} tool(s) detected
                      </span>
                    )}
                  </div>
                )}

                {checkError && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-950/30 border border-red-900/50 text-xs text-red-400">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{checkError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Disclaimer */}
            <div className="pt-2 text-[11px] text-[#6e6e6e] leading-relaxed border-t border-[#1e1e1e]">
              <p>
                Only use connectors from developers you trust. Talos does not control which tools developers make
                available and cannot verify that they will work as intended or that they won't change.
              </p>
              <p className="mt-2 text-[#7e7e7e]">
                Building an MCP server?{' '}
                <span className="text-[#a0a0a0] hover:text-white underline cursor-pointer">
                  Report issues and subscribe to updates here
                </span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={!url.trim() || isChecking}
                className="px-4 py-2 rounded-xl bg-white hover:bg-[#e4e4e4] text-black text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isChecking && <Loader2 size={12} className="animate-spin" />}
                Continue
              </button>
            </div>
          </div>
        ) : (
          /* STEP 2: Authentication Detection & Review (Image 3) */
          <div className="mt-5 space-y-4">
            {/* Header info */}
            <div>
              <h3 className="text-sm font-semibold text-white">{name || 'Custom connector'}</h3>
              <p className="text-xs font-mono text-[#777] truncate mt-0.5">{url}</p>
            </div>

            {/* Authentication Radios */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-white">Authentication</span>
                <Info size={12} className="text-[#666]" />
              </div>

              {/* Radio 1: Sign in now */}
              <label
                onClick={() => setAuthOption('signin_now')}
                className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  authOption === 'signin_now'
                    ? 'border-blue-500/50 bg-[#191919]'
                    : 'border-transparent hover:bg-[#1a1a1a]'
                }`}
              >
                <input
                  type="radio"
                  name="auth"
                  checked={authOption === 'signin_now'}
                  onChange={() => setAuthOption('signin_now')}
                  className="mt-0.5 accent-blue-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">Sign in now</span>
                    {detectedData?.detected_auth === 'signin_now' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#2a2a2a] text-[#aaa]">
                        Detected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#777] mt-0.5 leading-relaxed">
                    Each user signs in through the server's OAuth flow before they can use any tools or resources.
                  </p>
                </div>
              </label>

              {/* Radio 2: Sign in when needed */}
              <label
                onClick={() => setAuthOption('signin_needed')}
                className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  authOption === 'signin_needed'
                    ? 'border-blue-500/50 bg-[#191919]'
                    : 'border-transparent hover:bg-[#1a1a1a]'
                }`}
              >
                <input
                  type="radio"
                  name="auth"
                  checked={authOption === 'signin_needed'}
                  onChange={() => setAuthOption('signin_needed')}
                  className="mt-0.5 accent-blue-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">Sign in when needed</span>
                    {detectedData?.detected_auth === 'signin_needed' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#2a2a2a] text-[#aaa]">
                        Detected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#777] mt-0.5 leading-relaxed">
                    Talos connects without credentials first and prompts users to sign in when the server asks. Pick
                    this for servers that offer some tools without an account.
                  </p>
                </div>
              </label>

              {/* Radio 3: No sign-in */}
              <label
                onClick={() => setAuthOption('no_signin')}
                className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  authOption === 'no_signin'
                    ? 'border-blue-500/50 bg-[#191919]'
                    : 'border-transparent hover:bg-[#1a1a1a]'
                }`}
              >
                <input
                  type="radio"
                  name="auth"
                  checked={authOption === 'no_signin'}
                  onChange={() => setAuthOption('no_signin')}
                  className="mt-0.5 accent-blue-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">No sign-in</span>
                    {detectedData?.detected_auth === 'no_signin' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[#2a2a2a] text-[#aaa]">
                        Detected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#777] mt-0.5 leading-relaxed">
                    Pick this for servers with open access, or for servers that use an API key instead of OAuth.
                  </p>
                </div>
              </label>
            </div>

            {/* Warning Banner for No sign-in */}
            {authOption === 'no_signin' && (
              <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#231709] border border-[#4d320d] text-amber-500 text-xs leading-relaxed animate-in fade-in duration-150">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>Without sign-in, anyone with the server URL can use this connector.</span>
              </div>
            )}

            {/* Collapsible Advanced section */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-[#888] hover:text-white transition-colors cursor-pointer"
              >
                {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>Advanced</span>
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3.5 rounded-2xl bg-[#191919] border border-[#262626] space-y-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[11px] text-[#888] mb-1 font-medium">Custom Authorization Header</label>
                    <input
                      type="text"
                      value={customHeader}
                      onChange={(e) => setCustomHeader(e.target.value)}
                      placeholder="e.g. Bearer my-custom-secret-key"
                      className="w-full rounded-xl bg-[#121212] border border-[#2b2b2b] px-3 py-1.5 text-xs text-white placeholder-[#555] focus:outline-none"
                    />
                  </div>

                  {detectedData?.tools && detectedData.tools.length > 0 && (
                    <div>
                      <span className="block text-[11px] text-[#888] mb-1 font-medium">
                        Discovered Tools ({detectedData.tools.length})
                      </span>
                      <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                        {detectedData.tools.map((t: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px] text-[#aaa]">
                            <span className="font-mono text-emerald-400">{t.name}</span>
                            {t.description && <span className="text-[#666] truncate">- {t.description}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error Message */}
            {submitError && (
              <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-400">
                {submitError}
              </div>
            )}

            {/* Disclaimer */}
            <div className="pt-2 text-[11px] text-[#6e6e6e] leading-relaxed border-t border-[#1e1e1e]">
              <p>
                Only use connectors from developers you trust. Talos does not control which tools developers make
                available and cannot verify that they will work as intended or that they won't change.
              </p>
              <p className="mt-2 text-[#7e7e7e]">
                Building an MCP server?{' '}
                <span className="text-[#a0a0a0] hover:text-white underline cursor-pointer">
                  Report issues and subscribe to updates here
                </span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => setStep('input')}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-white hover:bg-[#e4e4e4] text-black text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSubmitting && <Loader2 size={12} className="animate-spin" />}
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
