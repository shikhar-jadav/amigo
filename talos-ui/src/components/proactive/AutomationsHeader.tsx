'use client';

import React from 'react';
import {
  Zap,
  X,
  Plus,
  Play,
  Pause,
  Search,
  AlertCircle,
  Shield,
  FileText,
} from 'lucide-react';
import type { TriggerType } from '@/types/proactive';

interface AutomationsHeaderProps {
  totalCount: number;
  activeCount: number;
  pausedCount: number;
  failedCount: number;
  totalSilentChecks?: number;
  activeFilter: 'all' | TriggerType;
  countsByType: Record<'all' | TriggerType, number>;
  onSelectFilter: (tab: 'all' | TriggerType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  onNewAutomation: () => void;
  onOpenStandingOrders?: () => void;
  onPauseAll: () => Promise<void>;
  onResumeAll: () => Promise<void>;
  isAllPaused: boolean;
}

export const AutomationsHeader: React.FC<AutomationsHeaderProps> = ({
  totalCount,
  activeCount,
  pausedCount,
  failedCount,
  totalSilentChecks = 0,
  activeFilter,
  countsByType,
  onSelectFilter,
  searchQuery,
  onSearchChange,
  onClose,
  onNewAutomation,
  onOpenStandingOrders,
  onPauseAll,
  onResumeAll,
  isAllPaused,
}) => {
  return (
    <div className="shrink-0 border-b border-[#1e1e1e] bg-[#080808]">
      {/* Top Banner if All Paused */}
      {isAllPaused && totalCount > 0 && (
        <div className="flex items-center justify-between px-5 py-2 bg-amber-950/40 border-b border-amber-800/40 text-amber-300 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <Pause size={13} className="text-amber-400" />
            <span>Kill Switch Active: All background automations are paused</span>
          </div>
          <button
            onClick={onResumeAll}
            className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-semibold transition-colors cursor-pointer"
          >
            Resume All
          </button>
        </div>
      )}

      {/* Main Header Row */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            <Zap size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-neutral-100 tracking-tight flex items-center gap-2">
              <span>Automations & Watchers</span>
            </h2>
            {/* Live context-aware summary strip */}
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400">
              <span className="font-medium text-neutral-300">{totalCount} total</span>
              <span className="text-neutral-600">·</span>
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {activeCount} running
              </span>
              {pausedCount > 0 && (
                <>
                  <span className="text-neutral-600">·</span>
                  <span className="inline-flex items-center gap-1 text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                    {pausedCount} paused
                  </span>
                </>
              )}
              {failedCount > 0 && (
                <>
                  <span className="text-neutral-600">·</span>
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertCircle size={10} />
                    {failedCount} failed
                  </span>
                </>
              )}
              {totalSilentChecks > 0 && (
                <>
                  <span className="text-neutral-600">·</span>
                  <span className="inline-flex items-center gap-1 text-cyan-400" title="Clean background sweeps with nothing to report (NO_REPLY)">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    {totalSilentChecks} quiet sweeps
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenStandingOrders && (
            <button
              onClick={onOpenStandingOrders}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#141414] hover:bg-neutral-800 text-neutral-300 border border-[#262626] hover:border-amber-500/40 transition-colors cursor-pointer"
              title="Workspace Operating Instructions & Rules (AGENTS.md)"
              aria-label="Manage workspace instructions (AGENTS.md)"
            >
              <FileText size={13} className="text-amber-400 shrink-0" />
              <span className="font-mono text-[11px] font-semibold text-neutral-200">AGENTS.md</span>
            </button>
          )}

          {totalCount > 0 && (
            <button
              onClick={isAllPaused ? onResumeAll : onPauseAll}
              className={`p-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                isAllPaused
                  ? 'bg-amber-950/40 text-amber-300 border-amber-700/50 hover:bg-amber-900/60'
                  : 'bg-[#141414] text-neutral-400 border-[#262626] hover:text-white hover:bg-neutral-800'
              }`}
              title={isAllPaused ? 'Resume all automations' : 'Emergency pause all automations (Kill-switch)'}
              aria-label={isAllPaused ? 'Resume all automations' : 'Emergency pause all automations'}
            >
              {isAllPaused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}

          <button
            onClick={onNewAutomation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-sm transition-all cursor-pointer active:scale-95"
            aria-label="Create new automation"
          >
            <Plus size={14} />
            <span>New</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800/80 transition-colors cursor-pointer ml-1"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Search Input (Always visible or when > 3 items) */}
      {totalCount > 2 && (
        <div className="px-5 pb-3">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search automations by name, trigger or schedule..."
              className="w-full bg-[#121212] border border-[#222222] rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/60 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-0.5"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs with Count Badges */}
      <div className="flex items-center gap-1 px-5 py-2 border-t border-[#161616] bg-[#0a0a0a] overflow-x-auto no-scrollbar">
        {(['all', 'scheduled', 'heartbeat'] as const).map((tab) => {
          const isSelected = activeFilter === tab;
          const count = countsByType[tab] ?? 0;
          return (
            <button
              key={tab}
              onClick={() => onSelectFilter(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <span>{tab}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-neutral-700 text-neutral-200' : 'bg-neutral-900 text-neutral-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
