'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar,
  Activity,
  Zap,
  Play,
  MoreVertical,
  Clock,
  Shield,
  Trash2,
  Edit2,
  Copy,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ProactiveTaskItem } from '@/types/proactive';
import { humanizeSchedule, formatRelativeTime } from '@/utils/cronHelpers';

interface AutomationCardProps {
  task: ProactiveTaskItem;
  isRunningNow: boolean;
  onRunNow: (taskId: string) => void;
  onToggleStatus: (taskId: string, currentStatus: string) => void;
  onOpenDetails: (task: ProactiveTaskItem) => void;
  onEdit: (task: ProactiveTaskItem) => void;
  onDuplicate: (task: ProactiveTaskItem) => void;
  onDelete: (taskId: string) => void;
  recentRuns?: Array<{ status: string; timestamp: number }>;
}

export const AutomationCard: React.FC<AutomationCardProps> = ({
  task,
  isRunningNow,
  onRunNow,
  onToggleStatus,
  onOpenDetails,
  onEdit,
  onDuplicate,
  onDelete,
  recentRuns = [],
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isGoalExpanded, setIsGoalExpanded] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isActive = task.status === 'active';
  const isPaused = task.status === 'paused';
  const isFailed = task.last_status === 'failed' || task.status === 'failed';
  const requiresApproval = task.action_policy?.requires_approval ?? false;

  // Close overflow menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
        setIsConfirmingDelete(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  // Type styling
  const typeConfigs = {
    scheduled: {
      label: 'Scheduled',
      icon: <Calendar size={12} />,
      badge: 'bg-cyan-950/40 text-cyan-300 border-cyan-800/40',
    },
    heartbeat: {
      label: 'Heartbeat',
      icon: <Activity size={12} className={isActive ? 'animate-pulse' : ''} />,
      badge: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
    },
    event: {
      label: 'Event Watcher',
      icon: <Zap size={12} />,
      badge: 'bg-violet-950/40 text-violet-300 border-violet-800/40',
    },
  };

  const typeConfig = typeConfigs[task.trigger_type] || typeConfigs.scheduled;
  const scheduleText = humanizeSchedule(task);

  // Timing
  const nextRunRelative = task.schedule?.next_run_at
    ? formatRelativeTime(task.schedule.next_run_at)
    : task.trigger_type === 'event'
    ? 'On trigger'
    : task.schedule?.cron
    ? 'Next cycle'
    : 'Manual';

  const nextRunExact = task.schedule?.next_run_at
    ? new Date(task.schedule.next_run_at * 1000).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const lastRunRelative = task.last_run_at ? formatRelativeTime(task.last_run_at) : 'Never';

  // Generate 7-dot sparkline (pad with default dots if less than 7)
  const sparklineDots = (() => {
    const dots = [...recentRuns].slice(0, 7);
    while (dots.length < 7) {
      dots.push({ status: 'none', timestamp: 0 });
    }
    return dots;
  })();

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 overflow-hidden ${
        isPaused
          ? 'bg-[#0a0a0a]/80 border-[#1c1c1c] opacity-75'
          : isFailed
          ? 'bg-[#0d0d0d] border-red-950/60 hover:border-red-900/80 shadow-md'
          : 'bg-[#0e0e0e] border-[#222222] hover:border-[#333333] shadow-md'
      }`}
    >
      {/* Top Banner if Running Now */}
      {isRunningNow && (
        <div className="h-0.5 w-full bg-linear-to-r from-amber-500 via-amber-300 to-amber-500 animate-pulse" />
      )}

      <div className="p-4">
        {/* Header Row: Type Chip + Status + Name + Menu */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {/* Type Chip */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ${typeConfig.badge}`}
              >
                {typeConfig.icon}
                <span>{typeConfig.label}</span>
              </span>

              {/* Status Indicator */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  isRunningNow
                    ? 'bg-amber-950/40 text-amber-300 border-amber-800/40'
                    : isFailed
                    ? 'bg-red-950/40 text-red-400 border-red-800/40'
                    : isActive
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-800/30'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isRunningNow
                      ? 'bg-amber-400 animate-ping'
                      : isFailed
                      ? 'bg-red-400'
                      : isActive
                      ? 'bg-emerald-400'
                      : 'bg-neutral-500'
                  }`}
                />
                <span>{isRunningNow ? 'Running...' : isFailed ? 'Failed' : isActive ? 'Active' : 'Paused'}</span>
              </span>

              {/* Safety Shield if approval required */}
              {requiresApproval && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  title="Modifications require explicit human approval"
                >
                  <Shield size={10} />
                  <span>Jailed / Approval</span>
                </span>
              )}

              {/* Delivery Target Chip */}
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${
                  task.action_policy?.delivery_target === 'silent'
                    ? 'bg-amber-950/20 text-amber-300 border-amber-800/40'
                    : 'bg-[#141414] text-neutral-300 border-[#262626]'
                }`}
                title={
                  task.action_policy?.delivery_target === 'silent'
                    ? 'Silent Journal mode: All popups and chat alerts suppressed'
                    : 'Delivered to Workspace Chat & In-App Floating Alert'
                }
              >
                <span>
                  {task.action_policy?.delivery_target === 'silent'
                    ? '🔇 Silent Journal'
                    : '💬 Chat + 🔔 Alert'}
                </span>
              </span>

              {/* Quiet Hours / Idle Only Chips */}
              {task.schedule?.active_hours_start && task.schedule?.active_hours_end && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-[#141414] text-neutral-400 border border-[#262626]"
                  title={`Active hours: ${task.schedule.active_hours_start} - ${task.schedule.active_hours_end}`}
                >
                  <span>🌙 {task.schedule.active_hours_start}-{task.schedule.active_hours_end}</span>
                </span>
              )}

              {task.schedule?.idle_only && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-[#141414] text-neutral-400 border border-[#262626]"
                  title="Only triggers when user is idle"
                >
                  <span>Idle only</span>
                </span>
              )}

              {/* Quiet-by-Default (NO_REPLY) Count */}
              {(task.silent_checks_count ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-950/30 text-emerald-300 border border-emerald-800/30"
                  title="Quiet runs: Checked and found nothing needing attention (NO_REPLY)"
                >
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  <span>Checked {task.silent_checks_count}x clean</span>
                </span>
              )}
            </div>

            {/* Task Name (Clickable to open details) */}
            <h3
              onClick={() => onOpenDetails(task)}
              className="text-sm font-semibold text-neutral-100 hover:text-amber-400 transition-colors cursor-pointer truncate"
              title={task.name}
            >
              {task.name}
            </h3>
          </div>

          {/* Pause / Resume Switch + Overflow Menu */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Real Toggle Switch */}
            <button
              onClick={() => onToggleStatus(task.id, task.status)}
              role="switch"
              aria-checked={isActive}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                isActive ? 'bg-emerald-600' : 'bg-neutral-800'
              }`}
              title={isActive ? 'Click to Pause' : 'Click to Activate'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>

            {/* Overflow Menu Button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen((prev) => !prev)}
                className="p-1 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
                title="More options"
                aria-label="More options"
              >
                <MoreVertical size={15} />
              </button>

              {/* Overflow Dropdown */}
              {isMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-[#141414] border border-[#2a2a2a] shadow-2xl py-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenDetails(task);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                  >
                    <Info size={13} className="text-cyan-400" />
                    <span>View Details & Logs</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onEdit(task);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                  >
                    <Edit2 size={13} className="text-amber-400" />
                    <span>Edit Configuration</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onDuplicate(task);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer text-left"
                  >
                    <Copy size={13} className="text-blue-400" />
                    <span>Duplicate Task</span>
                  </button>

                  <div className="my-1 border-t border-[#222222]" />

                  {isConfirmingDelete ? (
                    <div className="p-2 bg-red-950/40 rounded-lg mx-1 text-center">
                      <p className="text-[11px] text-red-300 font-medium mb-1.5">Delete this task?</p>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setIsMenuOpen(false);
                            setIsConfirmingDelete(false);
                            onDelete(task.id);
                          }}
                          className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[10px] font-semibold"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setIsConfirmingDelete(false)}
                          className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsConfirmingDelete(true)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors cursor-pointer text-left"
                    >
                      <Trash2 size={13} />
                      <span>Delete...</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Goal / Description (One-line with expand) */}
        {task.description && (
          <div className="mt-2 text-xs text-neutral-400 leading-relaxed">
            <p className={isGoalExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}>
              {task.description}
            </p>
            {task.description.length > 70 && (
              <button
                onClick={() => setIsGoalExpanded((prev) => !prev)}
                className="inline-flex items-center gap-0.5 text-[10px] text-neutral-500 hover:text-neutral-300 font-medium mt-0.5 cursor-pointer"
              >
                <span>{isGoalExpanded ? 'Show less' : 'Show more'}</span>
                {isGoalExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}
          </div>
        )}

        {/* Schedule & Timing Info Bar */}
        <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4 mt-3 pt-3 border-t border-[#1a1a1a] text-[11px] text-neutral-400">
          {/* Schedule string */}
          <div className="flex items-center gap-1.5 text-neutral-300 min-w-0" title={scheduleText}>
            <Clock size={12} className="text-amber-400/80 shrink-0" />
            <span className="font-medium truncate">{scheduleText}</span>
          </div>

          {/* Next run */}
          <div
            className="flex items-center gap-1 text-neutral-400 hover:text-neutral-200 transition-colors cursor-default"
            title={nextRunExact ? `Exact: ${nextRunExact}` : 'Next scheduled trigger'}
          >
            <span className="text-neutral-500">Next:</span>
            <span className="font-mono text-neutral-300">{nextRunRelative}</span>
          </div>
        </div>

        {/* Footer: Sparkline History + Run Now CTA */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-[#181818]">
          {/* Recent History Sparkline (7 dots) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-500 mr-0.5">Runs:</span>
            <div className="flex items-center gap-1" title={`Recent history: Last run ${lastRunRelative}`}>
              {sparklineDots.map((run, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    run.status === 'succeeded'
                      ? 'bg-emerald-500/80'
                      : run.status === 'failed'
                      ? 'bg-red-500'
                      : run.status === 'running'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-neutral-800'
                  }`}
                  title={
                    run.status !== 'none'
                      ? `${run.status.toUpperCase()} · ${formatRelativeTime(run.timestamp)}`
                      : 'No recent run'
                  }
                />
              ))}
            </div>
            <span className="text-[10px] text-neutral-500 ml-1">({lastRunRelative})</span>
          </div>

          {/* Run Now CTA Button */}
          <button
            onClick={() => onRunNow(task.id)}
            disabled={isRunningNow}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 hover:text-white border border-neutral-700 hover:border-neutral-600 transition-all cursor-pointer disabled:opacity-50 active:scale-95 shadow-xs"
            title="Trigger execution immediately"
          >
            <Play size={11} className={isRunningNow ? 'animate-spin' : ''} />
            <span>{isRunningNow ? 'Running...' : 'Run Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
