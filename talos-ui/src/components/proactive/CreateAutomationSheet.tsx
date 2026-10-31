'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Activity,
  Zap,
  Check,
  X,
  AlertCircle,
  Clock,
  Shield,
  Loader2,
  Moon,
  Bell,
  VolumeX,
  Copy,
} from 'lucide-react';
import type { TriggerType, ProactiveTaskItem, CreateTaskInput, UpdateTaskInput } from '@/types/proactive';
import {
  isValidCron,
  humanizeCron,
  getNextCronRuns,
  buildCronFromConfig,
} from '@/utils/cronHelpers';

interface CreateAutomationSheetProps {
  initialTask?: ProactiveTaskItem | null;
  initialType?: TriggerType;
  onClose: () => void;
  onSubmit: (data: CreateTaskInput) => Promise<{ success: boolean; alreadyExists?: boolean; message?: string }>;
  onUpdate?: (taskId: string, data: UpdateTaskInput) => Promise<boolean>;
}

export const CreateAutomationSheet: React.FC<CreateAutomationSheetProps> = ({
  initialTask,
  initialType = 'scheduled',
  onClose,
  onSubmit,
  onUpdate,
}) => {
  const isEditing = !!initialTask;

  // Form State
  const [name, setName] = useState(initialTask?.name || '');
  const [triggerType, setTriggerType] = useState<TriggerType>(initialTask?.trigger_type || initialType);
  const [description, setDescription] = useState(initialTask?.description || '');

  // Scheduled State
  const [scheduleMode, setScheduleMode] = useState<'friendly' | 'cron'>('friendly');
  const [cronExpression, setCronExpression] = useState(initialTask?.schedule?.cron || '0 9 * * *');
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'hourly' | 'interval' | 'monthly'>('daily');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [intervalMins, setIntervalMins] = useState(30);

  // Heartbeat State
  const [hbValue, setHbValue] = useState(
    initialTask?.schedule?.interval_seconds
      ? initialTask.schedule.interval_seconds >= 3600
        ? Math.round(initialTask.schedule.interval_seconds / 3600)
        : Math.round(initialTask.schedule.interval_seconds / 60)
      : 5
  );
  const [hbUnit, setHbUnit] = useState<'seconds' | 'minutes' | 'hours'>(
    initialTask?.schedule?.interval_seconds
      ? initialTask.schedule.interval_seconds >= 3600
        ? 'hours'
        : initialTask.schedule.interval_seconds >= 60
        ? 'minutes'
        : 'seconds'
      : 'minutes'
  );
  const [onlyIfChanged, setOnlyIfChanged] = useState(true);

  // Event State
  const [eventTrigger, setEventTrigger] = useState<string>(
    (initialTask?.metadata?.event_trigger as string) || 'process_crash'
  );
  const [eventTargetPath, setEventTargetPath] = useState<string>(
    (initialTask?.metadata?.target_path as string) || 'src/'
  );

  // OpenClaw Proactive Parameters
  const [isSilentJournal, setIsSilentJournal] = useState(
    initialTask?.action_policy?.delivery_target === 'silent'
  );
  const [silentIfNoAction, setSilentIfNoAction] = useState(
    initialTask?.action_policy?.silent_if_no_action ?? true
  );
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(
    !!(initialTask?.schedule?.active_hours_start || initialTask?.schedule?.active_hours_end)
  );
  const [quietStart, setQuietStart] = useState(initialTask?.schedule?.active_hours_start || '22:00');
  const [quietEnd, setQuietEnd] = useState(initialTask?.schedule?.active_hours_end || '08:00');
  const [idleOnly, setIdleOnly] = useState(initialTask?.schedule?.idle_only ?? false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  // Safety Defaults (Default ON)
  const [requiresApproval, setRequiresApproval] = useState(
    initialTask ? initialTask.action_policy?.requires_approval ?? true : true
  );

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compute effective cron expression
  const effectiveCron = useMemo(() => {
    if (scheduleMode === 'friendly') {
      return buildCronFromConfig({
        frequency: freq,
        hour,
        minute,
        weekdays,
        intervalMinutes: intervalMins,
        dayOfMonth: 1,
      });
    }
    return cronExpression;
  }, [scheduleMode, freq, hour, minute, weekdays, intervalMins, cronExpression]);

  // Cron Validation & Previews
  const isCronValid = isValidCron(effectiveCron);
  const cronHuman = isCronValid ? humanizeCron(effectiveCron) : 'Invalid cron expression';
  const nextRuns = isCronValid ? getNextCronRuns(effectiveCron, 3) : [];

  // Heartbeat seconds calculation
  const totalHbSeconds =
    hbUnit === 'hours' ? hbValue * 3600 : hbUnit === 'minutes' ? hbValue * 60 : hbValue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Please enter an automation name.');
      return;
    }
    if (triggerType === 'scheduled' && !isCronValid) {
      setErrorMessage('Please provide a valid cron schedule.');
      return;
    }
    if (triggerType === 'heartbeat' && totalHbSeconds < 30) {
      setErrorMessage('Heartbeat interval must be at least 30 seconds.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isEditing && initialTask && onUpdate) {
        const updateData: UpdateTaskInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          trigger_type: triggerType,
          cron: triggerType === 'scheduled' ? effectiveCron : undefined,
          interval_seconds: triggerType === 'heartbeat' ? totalHbSeconds : undefined,
          requires_approval: requiresApproval,
          delivery_target: isSilentJournal ? 'silent' : 'originating_chat',
          silent_if_no_action: silentIfNoAction,
          active_hours_start: quietHoursEnabled ? quietStart : undefined,
          active_hours_end: quietHoursEnabled ? quietEnd : undefined,
          idle_only: idleOnly,
          metadata: {
            event_trigger: triggerType === 'event' ? eventTrigger : undefined,
            target_path: triggerType === 'event' ? eventTargetPath : undefined,
            only_if_changed: onlyIfChanged,
          },
        };
        const ok = await onUpdate(initialTask.id, updateData);
        if (ok) {
          onClose();
        } else {
          setErrorMessage('Failed to update task.');
        }
      } else {
        const createData: CreateTaskInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          trigger_type: triggerType,
          cron: triggerType === 'scheduled' ? effectiveCron : undefined,
          interval_seconds: triggerType === 'heartbeat' ? totalHbSeconds : undefined,
          is_recurring: true,
          requires_approval: requiresApproval,
          delivery_target: isSilentJournal ? 'silent' : 'originating_chat',
          silent_if_no_action: silentIfNoAction,
          active_hours_start: quietHoursEnabled ? quietStart : undefined,
          active_hours_end: quietHoursEnabled ? quietEnd : undefined,
          idle_only: idleOnly,
          metadata: {
            event_trigger: triggerType === 'event' ? eventTrigger : undefined,
            target_path: triggerType === 'event' ? eventTargetPath : undefined,
            only_if_changed: onlyIfChanged,
          },
        };
        const res = await onSubmit(createData);
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.message || 'Failed to create automation.');
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const exampleChips = [
    {
      title: 'Daily Standup Briefing',
      type: 'scheduled' as const,
      desc: 'Synthesize recent git commits, file modifications, and pending tasks every morning at 9 AM.',
      cron: '0 9 * * *',
    },
    {
      title: 'Hourly Health Sweep',
      type: 'heartbeat' as const,
      desc: 'Run a silent background sweep to verify test suites remain green and no uncommitted broken code exists.',
      hbVal: 1,
      hbUnit: 'hours' as const,
    },
    {
      title: '15-Min Continuous Check',
      type: 'heartbeat' as const,
      desc: 'Periodically monitor workspace errors and test health with quiet-by-default (NO_REPLY).',
      hbVal: 15,
      hbUnit: 'minutes' as const,
    },
  ];

  return (
    <div className="fixed inset-0 z-[1600] flex justify-end bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg h-full bg-[#0c0c0c] border-l border-[#262626] flex flex-col shadow-2xl text-white animate-in slide-in-from-right duration-300">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e1e] bg-[#080808]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-100">
                {isEditing ? 'Edit Automation' : 'New Proactive Automation'}
              </h2>
              <p className="text-[11px] text-neutral-500">
                Executes locally with bounded context and path jailing
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="Cancel and close sheet"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick Example Chips for One-Click Preset Filling */}
          {!isEditing && (
            <div className="space-y-2">
              <span className="block text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Quick Templates
              </span>
              <div className="grid grid-cols-3 gap-2">
                {exampleChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setName(chip.title);
                      setDescription(chip.desc);
                      setTriggerType(chip.type);
                      if (chip.cron) setCronExpression(chip.cron);
                      if (chip.hbVal && chip.hbUnit) {
                        setHbValue(chip.hbVal);
                        setHbUnit(chip.hbUnit);
                      }
                    }}
                    className="p-2.5 text-left rounded-xl bg-[#141414] hover:bg-[#1f1f1f] border border-[#242424] hover:border-amber-500/40 transition-all cursor-pointer group"
                  >
                    <span className="block text-xs font-semibold text-neutral-200 group-hover:text-amber-400 truncate">
                      {chip.title}
                    </span>
                    <span className="block text-[10px] text-neutral-500 mt-1 capitalize">
                      {chip.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 1. Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-200">
              Automation Name <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Standup Digest, Server Watcher"
              className="w-full bg-[#141414] border border-[#262626] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/60 transition-colors shadow-inner"
              required
            />
          </div>

          {/* 2. Type Selector (Segmented Control with Explanations) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-neutral-200">
              Trigger Engine
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  type: 'scheduled' as const,
                  label: 'Scheduled',
                  desc: 'Exact time / cron calendar',
                  icon: <Calendar size={14} />,
                  activeClass: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/60 shadow-xs',
                },
                {
                  type: 'heartbeat' as const,
                  label: 'Heartbeat',
                  desc: 'Periodic sweep / pulse',
                  icon: <Activity size={14} />,
                  activeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/60 shadow-xs',
                },
              ].map((item) => {
                const isSelected = triggerType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setTriggerType(item.type)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? item.activeClass
                        : 'bg-[#141414] text-neutral-400 border-[#242424] hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <span className="block text-[10px] text-neutral-500 mt-1">
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Type-Specific Configuration */}

          {/* 3A. SCHEDULED BUILDER */}
          {triggerType === 'scheduled' && (
            <div className="p-4 rounded-xl bg-[#141414] border border-[#242424] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Clock size={13} />
                  <span>Precision Schedule</span>
                </span>

                <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded-lg text-[10px]">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('friendly')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                      scheduleMode === 'friendly' ? 'bg-cyan-900/60 text-cyan-200' : 'text-neutral-400'
                    }`}
                  >
                    Visual
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('cron')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                      scheduleMode === 'cron' ? 'bg-cyan-900/60 text-cyan-200' : 'text-neutral-400'
                    }`}
                  >
                    Cron
                  </button>
                </div>
              </div>

              {scheduleMode === 'friendly' ? (
                <div className="space-y-3">
                  {/* Frequency Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {(['daily', 'weekly', 'hourly', 'interval'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFreq(f)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors cursor-pointer ${
                          freq === f
                            ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/60'
                            : 'bg-[#1e1e1e] text-neutral-400 border border-[#2c2c2c] hover:bg-[#252525]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* Time Pickers for Daily / Weekly */}
                  {(freq === 'daily' || freq === 'weekly') && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-neutral-400 mb-1">Time of Day</label>
                        <div className="flex items-center gap-2">
                          <select
                            value={hour}
                            onChange={(e) => setHour(Number(e.target.value))}
                            className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            {Array.from({ length: 24 }).map((_, h) => (
                              <option key={h} value={h}>
                                {h.toString().padStart(2, '0')}:00 {h < 12 ? 'AM' : 'PM'}
                              </option>
                            ))}
                          </select>
                          <select
                            value={minute}
                            onChange={(e) => setMinute(Number(e.target.value))}
                            className="bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            {[0, 15, 30, 45].map((m) => (
                              <option key={m} value={m}>
                                :{m.toString().padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-neutral-500">Local Time</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Weekday Selector for Weekly */}
                  {freq === 'weekly' && (
                    <div className="space-y-1">
                      <label className="block text-[10px] text-neutral-400">Run On Days</label>
                      <div className="flex items-center gap-1.5">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayChar, dIdx) => {
                          const isDaySelected = weekdays.includes(dIdx);
                          return (
                            <button
                              key={dIdx}
                              type="button"
                              onClick={() => {
                                setWeekdays((prev) =>
                                  prev.includes(dIdx) ? prev.filter((d) => d !== dIdx) : [...prev, dIdx]
                                );
                              }}
                              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                isDaySelected
                                  ? 'bg-cyan-500 text-black shadow-xs'
                                  : 'bg-[#1e1e1e] text-neutral-400 hover:bg-[#282828]'
                              }`}
                            >
                              {dayChar}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Interval Slider for Interval */}
                  {freq === 'interval' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Repeat Every</span>
                        <span className="font-mono text-cyan-300 font-bold">{intervalMins} minutes</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={55}
                        step={5}
                        value={intervalMins}
                        onChange={(e) => setIntervalMins(Number(e.target.value))}
                        className="w-full accent-cyan-400"
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* Advanced Cron Expression Input */
                <div className="space-y-2">
                  <label className="block text-[11px] text-neutral-400 font-mono">
                    Cron Expression (min hr dom mon dow)
                  </label>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="0 9 * * *"
                    className={`w-full bg-[#1e1e1e] border rounded-lg px-3 py-2 text-xs font-mono transition-colors ${
                      isCronValid ? 'border-[#333333] text-cyan-300' : 'border-red-600 text-red-300'
                    }`}
                  />
                  {/* Preset chips */}
                  <div className="flex gap-1.5 pt-1">
                    {[
                      { label: '9 AM Daily', expr: '0 9 * * *' },
                      { label: '6 PM Daily', expr: '0 18 * * *' },
                      { label: 'Every 30m', expr: '*/30 * * * *' },
                      { label: 'Hourly', expr: '0 * * * *' },
                    ].map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCronExpression(p.expr)}
                        className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 hover:text-cyan-300 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Plain English & Next Run Preview */}
              <div className="p-3 rounded-lg bg-[#0e0e0e] border border-[#222222] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Summary:</span>
                  <span
                    className={`font-semibold ${isCronValid ? 'text-cyan-300' : 'text-red-400'}`}
                    aria-live="polite"
                  >
                    {cronHuman}
                  </span>
                </div>

                {nextRuns.length > 0 && (
                  <div className="text-[10px] text-neutral-500 pt-1 border-t border-[#1c1c1c]">
                    <span className="block font-medium text-neutral-400 mb-0.5">Next 3 runs:</span>
                    {nextRuns.map((r, idx) => (
                      <div key={idx} className="font-mono text-neutral-400">
                        • {r.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3B. HEARTBEAT BUILDER */}
          {triggerType === 'heartbeat' && (
            <div className="p-4 rounded-xl bg-[#141414] border border-[#242424] space-y-4">
              <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <Activity size={13} />
                <span>Heartbeat Interval Sweep</span>
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">Interval Value</label>
                  <input
                    type="number"
                    min={1}
                    value={hbValue}
                    onChange={(e) => setHbValue(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg px-3 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-neutral-400 mb-1">Unit</label>
                  <select
                    value={hbUnit}
                    onChange={(e) => setHbUnit(e.target.value as 'seconds' | 'minutes' | 'hours')}
                    className="w-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
              </div>

              {totalHbSeconds < 60 && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-[11px] flex items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>Sub-minute intervals consume higher local processing. Ensure checks are lightweight.</span>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={onlyIfChanged}
                  onChange={(e) => setOnlyIfChanged(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-emerald-500 focus:ring-0"
                />
                <span>Only trigger notification if changes or anomalies are detected</span>
              </label>
            </div>
          )}

          {/* 3C. EVENT BUILDER */}
          {triggerType === 'event' && (
            <div className="p-4 rounded-xl bg-[#141414] border border-[#242424] space-y-4">
              <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
                <Zap size={13} />
                <span>Event Trigger Engine</span>
              </span>

              <div className="space-y-1.5">
                <label className="block text-[11px] text-neutral-400">Trigger On Event</label>
                <select
                  value={eventTrigger}
                  onChange={(e) => setEventTrigger(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="process_crash">Process or Dev Server Crash (Exit code != 0)</option>
                  <option value="file_change">Filesystem Modification in Workspace</option>
                  <option value="git_commit">Git Commit or Branch Push</option>
                  <option value="webhook">Incoming Local / Webhook Trigger</option>
                </select>
              </div>

              {eventTrigger === 'file_change' && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-neutral-400">Target Folder / Path (Jailed)</label>
                  <input
                    type="text"
                    value={eventTargetPath}
                    onChange={(e) => setEventTargetPath(e.target.value)}
                    placeholder="e.g. src/, package.json"
                    className="w-full bg-[#1e1e1e] border border-[#2e2e2e] rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-[10px] text-neutral-500">
                    Constrained strictly to your local workspace boundary.
                  </span>
                </div>
              )}

              {eventTrigger === 'webhook' && (
                <div className="p-3 rounded-xl bg-violet-950/20 border border-violet-800/40 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-violet-300">Inbound Trigger URL</span>
                    {isEditing && initialTask?.id && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`http://localhost:8001/api/proactive/webhooks/${initialTask.id}`);
                          setCopiedWebhookUrl(true);
                          setTimeout(() => setCopiedWebhookUrl(false), 2000);
                        }}
                        className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-200 transition-colors cursor-pointer"
                      >
                        <Copy size={11} />
                        <span>{copiedWebhookUrl ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Trigger this automation externally from CI/CD, GitHub webhooks, or scripts by issuing an HTTP POST:
                  </p>
                  <code className="block p-2 rounded-lg bg-black/60 font-mono text-[11px] text-violet-200 break-all select-all border border-violet-900/40">
                    POST {isEditing && initialTask?.id ? `http://localhost:8001/api/proactive/webhooks/${initialTask.id}` : 'http://localhost:8001/api/proactive/webhooks/{task_id}'}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* 4. Goal / Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-neutral-200">
              Task Goal & Instructions
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what the agent should evaluate, synthesize, or verify..."
              rows={3}
              className="w-full bg-[#141414] border border-[#262626] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/60 transition-colors resize-none shadow-inner leading-relaxed"
            />
          </div>

          {/* 5. Autonomous Vigilance & Quiet Hours (OpenClaw-style NO_REPLY) */}
          <div className="p-4 rounded-xl bg-[#141414] border border-[#242424] space-y-3.5">
            <div className="flex items-center gap-2">
              <Moon size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-neutral-200">Autonomous Vigilance & Quiet Hours</span>
            </div>

            {/* Silent if no action (NO_REPLY) */}
            <label className="flex items-start gap-2.5 text-xs text-neutral-200 cursor-pointer">
              <input
                type="checkbox"
                checked={silentIfNoAction}
                onChange={(e) => setSilentIfNoAction(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <div>
                <span className="font-medium text-neutral-200">Stay silent unless something matters (NO_REPLY)</span>
                <span className="block text-[11px] text-neutral-500 mt-0.5">
                  Suppresses messages if sweeps find no errors or changes. Recorded as clean sweeps in task history.
                </span>
              </div>
            </label>

            {/* Quiet Hours Window */}
            <div className="pt-2 border-t border-[#1e1e1e] space-y-2.5">
              <label className="flex items-center justify-between text-xs text-neutral-300 cursor-pointer">
                <span className="font-medium">Enforce Quiet Hours Window</span>
                <input
                  type="checkbox"
                  checked={quietHoursEnabled}
                  onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 cursor-pointer"
                />
              </label>

              {quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-black/40 border border-[#262626]">
                  <div>
                    <label className="block text-[10px] text-neutral-500 mb-1">Quiet Start (Sleep)</label>
                    <input
                      type="time"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#333333] rounded px-2 py-1 text-xs text-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-neutral-500 mb-1">Quiet End (Wake)</label>
                    <input
                      type="time"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-[#333333] rounded px-2 py-1 text-xs text-neutral-200"
                    />
                  </div>
                </div>
              )}

              {/* Idle Only */}
              <label className="flex items-start gap-2.5 text-xs text-neutral-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={idleOnly}
                  onChange={(e) => setIdleOnly(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="font-medium">Idle-only sweeps</span>
                  <span className="block text-[11px] text-neutral-500 mt-0.5">
                    Only execute background sweeps when you are not actively sending chat messages.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 6. Delivery Targets & Integrations */}
          <div className="p-4 rounded-xl bg-[#141414] border border-[#242424] space-y-3.5">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-cyan-400" />
              <span className="text-xs font-semibold text-neutral-200">Delivery &amp; Notification Targets</span>
            </div>

            {/* Default Delivery Card (Always Active Unless Silent Journal is selected) */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                isSilentJournal
                  ? 'bg-[#121212] border-[#222222] opacity-45'
                  : 'bg-emerald-950/20 border-emerald-500/40 text-neutral-200 shadow-xs'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    isSilentJournal
                      ? 'bg-neutral-800 text-neutral-500'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  <Check size={12} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-100">
                      Default Delivery
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isSilentJournal
                          ? 'bg-neutral-800 text-neutral-500 line-through'
                          : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                      }`}
                    >
                      {isSilentJournal ? 'Suspended by Silent Mode' : 'Fixed & Active'}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                    💬 <strong>Originating Chat</strong> (appends report in thread) + 🔔 <strong>In-App Alert</strong> (floating banner).
                  </p>
                </div>
              </div>
            </div>

            {/* Silent Journal Toggle (Stops Default Delivery) */}
            <div
              className={`p-3 rounded-xl border transition-all ${
                isSilentJournal
                  ? 'bg-amber-950/20 border-amber-500/50'
                  : 'bg-[#181818] border-[#262626] hover:bg-[#1e1e1e]'
              }`}
            >
              <label className="flex items-start gap-2.5 text-xs text-neutral-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSilentJournal}
                  onChange={(e) => setIsSilentJournal(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 cursor-pointer"
                />
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-neutral-200">
                    <VolumeX size={13} className="text-amber-400" />
                    <span>Silent Journal Mode (Suppress All Notifications)</span>
                  </div>
                  <span className="block text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                    Stops chat replies and floating toasts. Results are recorded purely in the local SQLite database audit log without popups.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 7. Safety & Permissions (Default ON) */}
          <div className="p-4 rounded-xl bg-[#111111] border border-[#222222] space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-neutral-200">Local-First Safety & Isolation</span>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-neutral-200 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <span className="font-medium">
                Require human approval before modifying files or executing commands
              </span>
            </label>

            <div className="p-2.5 rounded-lg bg-black/40 border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
              <div>
                <span className="text-neutral-500 font-semibold">Scope: </span>
                <span className="font-mono text-neutral-300">Local workspace (.)</span>
              </div>
              <div>
                <span className="text-neutral-500 font-semibold">Protected: </span>
                <span className="font-mono text-neutral-300">.env, secrets, credentials</span>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#1e1e1e] bg-[#080808] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>{isEditing ? 'Save Changes' : 'Create Automation'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
