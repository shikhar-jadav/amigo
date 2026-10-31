'use client';

import React from 'react';
import { Calendar, Activity, Zap, Search, Plus } from 'lucide-react';
import type { TriggerType } from '@/types/proactive';

interface EmptyStateProps {
  filter: 'all' | TriggerType;
  searchQuery?: string;
  onCreate: (type?: TriggerType) => void;
  onClearSearch?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  filter,
  searchQuery,
  onCreate,
  onClearSearch,
}) => {
  if (searchQuery && searchQuery.trim().length > 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center my-6 rounded-2xl bg-[#0f0f0f] border border-[#1f1f1f]">
        <div className="p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-500 mb-3.5">
          <Search size={22} />
        </div>
        <h4 className="text-sm font-medium text-neutral-200">No matching automations</h4>
        <p className="text-xs text-neutral-500 mt-1 max-w-xs leading-relaxed">
          No tasks found matching &ldquo;<span className="text-neutral-300 font-mono">{searchQuery}</span>&rdquo;.
        </p>
        {onClearSearch && (
          <button
            onClick={onClearSearch}
            className="mt-4 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors cursor-pointer"
          >
            Clear Search
          </button>
        )}
      </div>
    );
  }

  const configs: Record<
    'all' | TriggerType,
    {
      icon: React.ReactNode;
      title: string;
      desc: string;
      cta: string;
      targetType?: TriggerType;
    }
  > = {
    all: {
      icon: <Zap size={22} className="text-amber-400" />,
      title: 'No automations configured',
      desc: 'Let Talos handle routine checks, daily reports, or monitor process health in the background.',
      cta: 'Create Automation',
    },
    scheduled: {
      icon: <Calendar size={22} className="text-cyan-400" />,
      title: 'No scheduled reports yet',
      desc: 'Set up automated daily morning summaries, standup digests, or precision cron jobs.',
      cta: 'New Scheduled Task',
      targetType: 'scheduled',
    },
    heartbeat: {
      icon: <Activity size={22} className="text-emerald-400" />,
      title: 'No heartbeat monitors active',
      desc: 'Set up quiet periodic sweeps to audit test suites, port availability, or workspace integrity.',
      cta: 'New Heartbeat Sweep',
      targetType: 'heartbeat',
    },
    event: {
      icon: <Zap size={22} className="text-violet-400" />,
      title: 'No event watchers active',
      desc: 'Trigger autonomous diagnosis and alerts when development servers crash or files change.',
      cta: 'New Event Watcher',
      targetType: 'event',
    },
  };

  const current = configs[filter];

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center my-6 rounded-2xl bg-[#0d0d0d] border border-[#1e1e1e]">
      <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#242424] mb-3.5">
        {current.icon}
      </div>
      <h4 className="text-sm font-semibold text-neutral-100">{current.title}</h4>
      <p className="text-xs text-neutral-400 mt-1.5 max-w-xs leading-relaxed">
        {current.desc}
      </p>

      <button
        onClick={() => onCreate(current.targetType)}
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-md transition-all cursor-pointer active:scale-95"
      >
        <Plus size={14} />
        <span>{current.cta}</span>
      </button>

      <div className="mt-4 pt-4 border-t border-[#1a1a1a] text-[11px] text-neutral-500">
        Or request naturally in chat:
        <span className="block mt-1 text-neutral-400 italic">
          &ldquo;Review this repo every morning at 9 AM&rdquo;
        </span>
      </div>
    </div>
  );
};
