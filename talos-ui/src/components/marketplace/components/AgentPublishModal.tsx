'use client';

import React, { useState } from 'react';
import { ArrowLeft, Bot, Loader2, Upload, X } from 'lucide-react';
import { AgentScanResult, scanAgentPackage } from '@/lib/securityScanner';

interface AgentPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onSuccess: () => void;
}

export function AgentPublishModal({ isOpen, onClose, onBack, onSuccess }: AgentPublishModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<AgentScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const selectFile = async (selected: File | undefined) => {
    if (!selected) return;
    setFile(selected);
    setError('');
    setScan(await scanAgentPackage(selected));
  };

  const publish = async () => {
    if (!file || !scan?.valid) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('short_desc', scan.description.slice(0, 160));
      body.append('category', 'AI Agents');
      const tagList = Array.isArray(scan.tags) ? scan.tags : (scan.tags ? [String(scan.tags)] : ['AI Agents']);
      body.append('tags', tagList.join(','));
      const response = await fetch('/api/marketplace/publish/agent', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || 'Could not publish this agent package.');
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not publish this agent package.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl rounded-2xl border border-[#292929] bg-[#101010] p-6 text-white shadow-2xl">
        <header className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="text-blue-400" size={20} />
            <div>
              <h2 className="font-semibold">Publish specialist sub-agent</h2>
              <p className="text-xs text-[#888]">Upload a ZIP with agent.yaml (instructions can be inline or in instructions.md)</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[#888] hover:text-white"><X size={18} /></button>
        </header>

        <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#383838] bg-[#151515] p-7 text-center hover:border-blue-500/60">
          <input type="file" accept=".zip,.agent" className="hidden" onChange={(event) => void selectFile(event.target.files?.[0])} />
          <Upload size={22} className="mb-2 text-[#888]" />
          <span className="text-sm">{file?.name || 'Choose an agent package'}</span>
          <span className="mt-1 text-xs text-[#777]">Instructions are run by Talos; uploaded code is not executed.</span>
        </label>

        {scan && (
          <div className="mt-4 rounded-xl border border-[#262626] bg-[#141414] p-4">
            <div className="font-medium">{scan.name} <span className="text-xs text-[#888]">v{scan.version}</span></div>
            <p className="mt-1 text-sm text-[#999]">{scan.description}</p>
            {scan.findings.length > 0 && <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-amber-300">{scan.findings.map((finding) => <li key={finding}>{finding}</li>)}</ul>}
            {!scan.valid && <p className="mt-3 text-xs text-red-300">This package does not pass the required manifest checks.</p>}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <footer className="mt-5 flex justify-between">
          <button onClick={onBack} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#aaa] hover:bg-[#202020]"><ArrowLeft size={14} />Back</button>
          <button onClick={() => void publish()} disabled={!scan?.valid || busy} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
            {busy && <Loader2 size={14} className="animate-spin" />}{busy ? 'Publishing…' : 'Publish agent'}
          </button>
        </footer>
      </section>
    </div>
  );
}
