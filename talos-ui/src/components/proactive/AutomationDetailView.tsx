'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Calendar,
  Activity,
  Zap,
  Play,
  Pause,
  Clock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Edit2,
  ExternalLink,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import type { ProactiveTaskItem, TaskExecutionItem } from '@/types/proactive';
import { humanizeSchedule, formatRelativeTime } from '@/utils/cronHelpers';

interface AutomationDetailViewProps {
  task: ProactiveTaskItem;
  onBack: () => void;
  onEdit: (task: ProactiveTaskItem) => void;
  onRunNow: (taskId: string) => void;
  onToggleStatus: (taskId: string, currentStatus: string) => void;
  fetchExecutions: (taskId: string) => Promise<TaskExecutionItem[]>;
  pendingApproval?: {
    id: string;
    impact_summary: string;
    command?: string;
    target_path?: string;
    created_at: number;
  } | null;
  onResolveApproval?: (approvalId: string, approved: boolean) => Promise<void>;
  onOpenFile?: (path: string) => void;
}

export const AutomationDetailView: React.FC<AutomationDetailViewProps> = ({
  task,
  onBack,
  onEdit,
  onRunNow,
  onToggleStatus,
  fetchExecutions,
  pendingApproval,
  onResolveApproval,
  onOpenFile,
}) => {
  const [executions, setExecutions] = useState<TaskExecutionItem[]>([]);
  const [loadingExecs, setLoadingExecs] = useState(true);
  const [selectedExec, setSelectedExec] = useState<TaskExecutionItem | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoadingExecs(true);
      try {
        const list = await fetchExecutions(task.id);
        if (mounted) {
          setExecutions(list);
          if (list.length > 0) {
            setSelectedExec(list[0]);
          }
        }
      } finally {
        if (mounted) setLoadingExecs(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [task.id, fetchExecutions]);

  const isActive = task.status === 'active';
  const scheduleText = humanizeSchedule(task);

  const handleApprovalAction = async (approved: boolean) => {
    if (!pendingApproval || !onResolveApproval) return;
    setIsResolving(true);
    try {
      await onResolveApproval(pendingApproval.id, approved);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white overflow-hidden animate-in fade-in duration-150">
      {/* Top Header with Breadcrumb Back Button */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e1e1e] bg-[#0c0c0c] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
          <span>Back to Automations</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(task)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[#141414] hover:bg-[#202020] text-neutral-200 border border-[#2a2a2a] transition-colors cursor-pointer"
          >
            <Edit2 size={12} className="text-amber-400" />
            <span>Edit</span>
          </button>

          <button
            onClick={() => onRunNow(task.id)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-xs transition-colors cursor-pointer"
          >
            <Play size={12} />
            <span>Run Now</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Pending Approval Banner if any */}
        {pendingApproval && (
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-600/40 text-amber-200 space-y-3 shadow-lg animate-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-amber-400 shrink-0" />
              <h4 className="text-xs font-bold text-amber-300">Action Requires Your Approval</h4>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              {pendingApproval.impact_summary}
            </p>

            {pendingApproval.target_path && (
              <div className="p-2 rounded bg-black/40 border border-amber-800/30 font-mono text-[11px] text-amber-300">
                Target: {pendingApproval.target_path}
              </div>
            )}

            {pendingApproval.command && (
              <div className="p-2 rounded bg-black/40 border border-amber-800/30 font-mono text-[11px] text-neutral-300 overflow-x-auto">
                $ {pendingApproval.command}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => handleApprovalAction(false)}
                disabled={isResolving}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <X size={12} />
                <span>Reject</span>
              </button>
              <button
                onClick={() => handleApprovalAction(true)}
                disabled={isResolving}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isResolving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                <span>Approve & Execute</span>
              </button>
            </div>
          </div>
        )}

        {/* Task Overview Card */}
        <div className="p-4 rounded-xl bg-[#111111] border border-[#222222] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                    task.trigger_type === 'scheduled'
                      ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800/40'
                      : task.trigger_type === 'heartbeat'
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40'
                      : 'bg-violet-950/40 text-violet-300 border-violet-800/40'
                  }`}
                >
                  {task.trigger_type === 'scheduled' ? (
                    <Calendar size={11} />
                  ) : task.trigger_type === 'heartbeat' ? (
                    <Activity size={11} />
                  ) : (
                    <Zap size={11} />
                  )}
                  <span className="capitalize">{task.trigger_type}</span>
                </span>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    isActive
                      ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/30'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                  <span>{isActive ? 'Active' : 'Paused'}</span>
                </span>
              </div>

              <h2 className="text-base font-bold text-neutral-100">{task.name}</h2>
            </div>

            <button
              onClick={() => onToggleStatus(task.id, task.status)}
              className={`p-2 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                  : 'bg-amber-950/30 text-amber-400 border-amber-800/40 hover:bg-amber-900/40'
              }`}
              title={isActive ? 'Pause Automation' : 'Resume Automation'}
            >
              {isActive ? <Pause size={15} /> : <Play size={15} />}
            </button>
          </div>

          {task.description && (
            <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap bg-[#161616] p-3 rounded-lg border border-[#262626]">
              {task.description}
            </p>
          )}

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-xs">
            <div className="p-2.5 rounded-lg bg-[#161616] border border-[#222222]">
              <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                Schedule
              </span>
              <span className="font-medium text-neutral-200 mt-0.5 block truncate">
                {scheduleText}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#161616] border border-[#222222]">
              <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                Next Execution
              </span>
              <span className="font-mono text-neutral-200 mt-0.5 block truncate">
                {task.schedule?.next_run_at ? formatRelativeTime(task.schedule.next_run_at) : 'Manual'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#161616] border border-[#222222]">
              <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                Delivery Target
              </span>
              <span className="font-mono text-amber-300 mt-0.5 block truncate capitalize">
                {task.action_policy?.delivery_target === 'silent'
                  ? '🔇 Silent Journal'
                  : '💬 Chat + 🔔 Toast'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#161616] border border-[#222222]">
              <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                Quiet Sweeps
              </span>
              <span className="font-mono text-emerald-300 mt-0.5 block truncate">
                {task.silent_checks_count ?? 0} clean (NO_REPLY)
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#161616] border border-[#222222]">
              <span className="block text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">
                Quiet Hours
              </span>
              <span className="font-mono text-neutral-300 mt-0.5 block truncate">
                {task.schedule?.active_hours_start && task.schedule?.active_hours_end
                  ? `🌙 ${task.schedule.active_hours_start}-${task.schedule.active_hours_end}`
                  : '24/7 Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Execution History Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
              Run History ({executions.length})
            </h3>
            <span className="text-[10px] text-neutral-500">Local Journal</span>
          </div>

          {loadingExecs ? (
            <div className="flex items-center justify-center p-8 text-neutral-500 text-xs gap-2">
              <Loader2 size={14} className="animate-spin text-amber-500" />
              <span>Loading run history...</span>
            </div>
          ) : executions.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-[#121212] border border-[#222222] text-neutral-500 text-xs">
              No executions logged yet. Click &ldquo;Run Now&rdquo; to trigger an immediate run.
            </div>
          ) : (
            <div className="space-y-2">
              {executions.map((exec) => {
                const isSelected = selectedExec?.id === exec.id;
                const isSuccess = exec.status === 'succeeded';
                const isRunning = exec.status === 'running';
                const isFailed = exec.status === 'failed';

                return (
                  <div
                    key={exec.id}
                    onClick={() => setSelectedExec(exec)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#181818] border-amber-500/50 shadow-md'
                        : 'bg-[#121212] border-[#222222] hover:border-[#333333]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {isSuccess ? (
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        ) : isRunning ? (
                          <Loader2 size={14} className="text-amber-400 animate-spin shrink-0" />
                        ) : isFailed ? (
                          <AlertCircle size={14} className="text-red-400 shrink-0" />
                        ) : (
                          <Clock size={14} className="text-neutral-500 shrink-0" />
                        )}
                        <span className="font-semibold text-neutral-200 capitalize">
                          {exec.status}
                        </span>
                      </div>

                      <span className="text-[11px] text-neutral-500 font-mono">
                        {formatRelativeTime(exec.created_at)}
                      </span>
                    </div>

                    {exec.output_summary && (
                      <p className="text-xs text-neutral-400 mt-1.5 line-clamp-2 leading-relaxed">
                        {exec.output_summary}
                      </p>
                    )}

                    {exec.artifact_path && onOpenFile && (
                      <div className="mt-2 pt-2 border-t border-[#222222] flex items-center justify-between">
                        <span className="text-[10px] text-neutral-500 truncate max-w-[200px]">
                          Artifact: {exec.artifact_path.split('/').pop()}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFile(exec.artifact_path!);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                        >
                          <ExternalLink size={11} />
                          <span>View Artifact</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
