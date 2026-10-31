'use client';

import React, { useState } from 'react';
import { Bot, CheckCircle2, AlertCircle, Loader2, ChevronRight, FileText, Wrench, Activity, Camera } from 'lucide-react';

export interface SubAgentExecution {
  execution_id: string;
  plugin_id: string;
  plugin_type: 'agent';
  agent_name: string;
  agent_slug: string;
  task: string;
  status: 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  steps?: Array<{ id: string; description: string; status: 'pending' | 'running' | 'completed' | 'failed'; started_at?: string; trace_index?: number }>;
  files?: Array<{ path: string; action: 'read' | 'write' | 'analyze' }>;
  tool_calls?: Array<{ name: string; status: 'running' | 'completed' | 'failed'; result?: string; toolCallId?: string; args?: any; trace_index?: number }>;
  screenshots?: Array<{ url?: string; title?: string; image: string; timestamp?: string }>;
  logs?: string[];
  result?: string;
  error?: string;
}

interface SubAgentCardProps {
  execution: SubAgentExecution;
  onInspect?: (execution: SubAgentExecution) => void;
  onOpenCanvas?: (execution: SubAgentExecution) => void;
}

export const SubAgentCard: React.FC<SubAgentCardProps> = ({ execution, onInspect, onOpenCanvas }) => {
  const isRunning = execution.status === 'running';
  const isFailed = execution.status === 'failed';
  const isCompleted = execution.status === 'completed';

  const completedSteps = (execution.steps || []).filter(s => s.status === 'completed').length;
  const totalSteps = (execution.steps || []).length;
  const currentStep = (execution.steps || []).find(s => s.status === 'running') ||
    (execution.steps && execution.steps.length > 0 ? execution.steps[execution.steps.length - 1] : null);

  return (
    <div
      className="my-2 rounded-2xl border bg-[#0f0f0f] overflow-hidden cursor-pointer hover:border-[#333] transition-colors group"
      style={{ borderColor: isRunning ? '#2a3a4a' : isFailed ? '#3a2a2a' : '#1e1e1e' }}
      onClick={() => onInspect?.(execution)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`flex items-center justify-center w-8 h-8 rounded-xl border ${
          isRunning ? 'bg-blue-950/40 border-blue-800/40' :
          isFailed ? 'bg-red-950/40 border-red-800/40' :
          'bg-[#1a1a1a] border-[#2a2a2a]'
        }`}>
          {isRunning ? (
            <Loader2 size={14} className="text-blue-400 animate-spin" />
          ) : isFailed ? (
            <AlertCircle size={14} className="text-red-400" />
          ) : (
            <CheckCircle2 size={14} className="text-emerald-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{execution.agent_name}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border text-blue-400 bg-blue-950/40 border-blue-800/40">
              <Bot size={9} />
              A2A Agent
            </span>
            {Boolean(execution.screenshots?.length) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCanvas?.(execution);
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border text-blue-300 bg-blue-950/50 border-blue-800/40 hover:bg-blue-900/70 hover:text-white transition-colors cursor-pointer"
                title="View browser screenshots in Canvas"
              >
                <Camera size={9} />
                <span>{execution.screenshots!.length} view{execution.screenshots!.length > 1 ? 's' : ''} · Canvas</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#666] truncate mt-0.5">
            {isRunning ? (
              currentStep?.description || execution.task
            ) : isFailed ? (
              execution.error || 'Task failed'
            ) : (
              execution.result
                ? `Completed — ${(execution.result || '').slice(0, 60)}${execution.result.length > 60 ? '...' : ''}`
                : 'Task completed'
            )}
          </p>
        </div>

        <ChevronRight size={14} className="text-[#555] group-hover:text-[#888] transition-colors shrink-0" />
      </div>
    </div>
  );
};

export default SubAgentCard;
