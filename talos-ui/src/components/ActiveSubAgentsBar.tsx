'use client';

import React from 'react';
import { Loader2, Bot, ChevronDown } from 'lucide-react';
import type { SubAgentExecution } from './SubAgentCard';

interface ActiveSubAgentsBarProps {
  executions: SubAgentExecution[];
  onInspect?: (execution: SubAgentExecution) => void;
}

export const ActiveSubAgentsBar: React.FC<ActiveSubAgentsBarProps> = ({ executions, onInspect }) => {
  const running = executions.filter(e => e.status === 'running');
  if (running.length === 0) return null;

  const primary = running[0];
  const currentStep = (primary.steps || []).find(s => s.status === 'running');

  return (
    <div className="px-4 pb-1">
      <div
        className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-[#0d1a26] border border-blue-900/40 text-xs cursor-pointer hover:border-blue-800/60 transition-colors"
        onClick={() => onInspect?.(primary)}
      >
        {/* Animated pulse dot */}
        <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
          <span className="absolute inline-flex h-3 w-3 rounded-full bg-blue-400 opacity-50 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
        </div>

        <Bot size={12} className="text-blue-400 shrink-0" />

        <span className="text-blue-200 font-medium">
          {running.length === 1
            ? `${primary.agent_name}`
            : `${running.length} subagents running`
          }
        </span>

        <span className="text-blue-400/60 mx-0.5">·</span>

        <span className="text-blue-400/80 truncate flex-1">
          {currentStep?.description || primary.task}
        </span>

        <Loader2 size={11} className="text-blue-400/60 animate-spin shrink-0" />
      </div>
    </div>
  );
};

export default ActiveSubAgentsBar;
