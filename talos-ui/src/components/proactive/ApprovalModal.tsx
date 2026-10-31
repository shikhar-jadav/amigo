'use client';

import React from 'react';
import { useProactive } from '@/context/ProactiveContext';
import { ShieldAlert, Terminal, Check } from 'lucide-react';

export const ApprovalModal: React.FC = () => {
  const { pendingApprovals, resolveApproval } = useProactive();

  if (!pendingApprovals || pendingApprovals.length === 0) return null;

  const currentAppr = pendingApprovals[0];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#0e0e0e] border border-amber-500/30 rounded-2xl shadow-2xl p-6 text-white animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <ShieldAlert size={24} />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-neutral-100">
              Remediation Approval Required
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              An autonomous task proposed a system-modifying action that requires your explicit confirmation before executing.
            </p>

            {currentAppr.impact_summary && (
              <div className="mt-3 p-3 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-neutral-300">
                <span className="font-medium text-amber-400">Impact: </span>
                {currentAppr.impact_summary}
              </div>
            )}

            {currentAppr.command && (
              <div className="mt-3">
                <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                  Proposed Command:
                </span>
                <div className="flex items-center gap-2 mt-1 p-2.5 rounded-lg bg-black border border-neutral-800 font-mono text-xs text-emerald-400 overflow-x-auto">
                  <Terminal size={14} className="text-neutral-500 shrink-0" />
                  <code>{currentAppr.command}</code>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => resolveApproval(currentAppr.id, false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Reject Action
              </button>
              <button
                onClick={() => resolveApproval(currentAppr.id, true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                <Check size={14} />
                <span>Approve &amp; Run</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
