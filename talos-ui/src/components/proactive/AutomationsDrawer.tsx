'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useProactive } from '@/context/ProactiveContext';
import type { TriggerType, ProactiveTaskItem, CreateTaskInput } from '@/types/proactive';
import { AutomationsHeader } from './AutomationsHeader';
import { AutomationCard } from './AutomationCard';
import { AutomationDetailView } from './AutomationDetailView';
import { CreateAutomationSheet } from './CreateAutomationSheet';
import { StandingOrdersView } from './StandingOrdersView';
import { EmptyState } from './EmptyState';
import { RotateCcw, CheckCircle2 } from 'lucide-react';

export const AutomationsDrawer: React.FC = () => {
  const {
    tasks,
    activeCount,
    pausedCount,
    failedCount,
    totalSilentChecks,
    isDrawerOpen,
    closeDrawer,
    createTask,
    updateTask,
    runTaskNow,
    pauseTask,
    resumeTask,
    pauseAllTasks,
    resumeAllTasks,
    deleteTask,
    fetchTaskExecutions,
    pendingApprovals,
    resolveApproval,
  } = useProactive();

  // Mode: 'list' | 'detail' | 'create' | 'edit' | 'standing_orders'
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'create' | 'edit' | 'standing_orders'>('list');
  const [selectedTask, setSelectedTask] = useState<ProactiveTaskItem | null>(null);
  const [editingTask, setEditingTask] = useState<ProactiveTaskItem | null>(null);
  const [prefilledCreateType, setPrefilledCreateType] = useState<TriggerType>('scheduled');

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<'all' | TriggerType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Execution Feedback
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Soft Delete / Undo Toast State
  const [deletedTaskUndo, setDeletedTaskUndo] = useState<{
    task: ProactiveTaskItem;
    timeoutId: NodeJS.Timeout;
  } | null>(null);

  // Keyboard navigation: Escape key closes modal, details, or drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        if (viewMode === 'create' || viewMode === 'edit') {
          setViewMode(selectedTask ? 'detail' : 'list');
        } else if (viewMode === 'detail' || viewMode === 'standing_orders') {
          setViewMode('list');
        } else {
          closeDrawer();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, viewMode, selectedTask, closeDrawer]);

  // Compute live counts per type
  const countsByType = useMemo(() => {
    return {
      all: tasks.length,
      scheduled: tasks.filter((t) => t.trigger_type === 'scheduled').length,
      heartbeat: tasks.filter((t) => t.trigger_type === 'heartbeat').length,
      event: tasks.filter((t) => t.trigger_type === 'event').length,
    };
  }, [tasks]);

  // Filter tasks based on activeFilter and searchQuery
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Type filter
      if (activeFilter !== 'all' && t.trigger_type !== activeFilter) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = t.name.toLowerCase().includes(q);
        const descMatch = (t.description || '').toLowerCase().includes(q);
        const typeMatch = t.trigger_type.toLowerCase().includes(q);
        const cronMatch = (t.schedule?.cron || '').toLowerCase().includes(q);
        return nameMatch || descMatch || typeMatch || cronMatch;
      }
      return true;
    });
  }, [tasks, activeFilter, searchQuery]);

  const isAllPaused = tasks.length > 0 && activeCount === 0 && pausedCount > 0;

  // Run Now with animated state
  const handleRunNow = async (taskId: string) => {
    setRunningTaskId(taskId);
    try {
      const ok = await runTaskNow(taskId);
      if (ok) {
        setToastMessage('Task triggered immediately');
        setTimeout(() => setToastMessage(null), 3500);
      }
    } finally {
      setTimeout(() => setRunningTaskId(null), 1200);
    }
  };

  // Toggle Pause / Resume
  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    if (currentStatus === 'active') {
      await pauseTask(taskId);
    } else {
      await resumeTask(taskId);
    }
  };

  // Duplicate task
  const handleDuplicate = async (task: ProactiveTaskItem) => {
    const copyName = `${task.name} (Copy)`;
    const input: CreateTaskInput = {
      name: copyName,
      description: task.description,
      trigger_type: task.trigger_type,
      cron: task.schedule?.cron,
      exact_timestamp: task.schedule?.exact_timestamp,
      interval_seconds: task.schedule?.interval_seconds,
      is_recurring: task.schedule?.is_recurring,
      requires_approval: task.action_policy?.requires_approval,
      metadata: task.metadata,
    };
    const res = await createTask(input);
    if (res.success) {
      setToastMessage(`Duplicated as "${copyName}"`);
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Soft Delete with 5-Second Undo Toast
  const handleDeleteWithUndo = useCallback(
    (taskId: string) => {
      const target = tasks.find((t) => t.id === taskId);
      if (!target) return;

      // Clear existing undo timer if any
      if (deletedTaskUndo) {
        clearTimeout(deletedTaskUndo.timeoutId);
      }

      // Schedule permanent backend delete after 5s
      const timer = setTimeout(async () => {
        await deleteTask(taskId);
        setDeletedTaskUndo(null);
      }, 5000);

      setDeletedTaskUndo({
        task: target,
        timeoutId: timer,
      });

      // If viewing detail of deleted task, switch back to list
      if (selectedTask?.id === taskId) {
        setViewMode('list');
        setSelectedTask(null);
      }
    },
    [tasks, deletedTaskUndo, deleteTask, selectedTask]
  );

  const handleUndoDelete = async () => {
    if (!deletedTaskUndo) return;
    clearTimeout(deletedTaskUndo.timeoutId);
    setDeletedTaskUndo(null);
    setToastMessage(`Restored "${deletedTaskUndo.task.name}"`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  if (!isDrawerOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1500] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Automations and Watchers Control Center"
    >
      <div className="w-full max-w-[540px] min-w-[360px] h-full bg-[#0a0a0a] border-l border-[#222222] flex flex-col shadow-2xl text-white animate-in slide-in-from-right duration-300 relative overflow-hidden">
        {/* VIEW 0: AGENTS.md EDITOR VIEW (OpenClaw Standard) */}
        {viewMode === 'standing_orders' ? (
          <StandingOrdersView onBack={() => setViewMode('list')} />
        ) : viewMode === 'detail' && selectedTask ? (
          /* VIEW 1: DETAIL INSPECTION VIEW */
          <AutomationDetailView
            task={selectedTask}
            onBack={() => setViewMode('list')}
            onEdit={(task) => {
              setEditingTask(task);
              setViewMode('edit');
            }}
            onRunNow={handleRunNow}
            onToggleStatus={handleToggleStatus}
            fetchExecutions={fetchTaskExecutions}
            pendingApproval={
              pendingApprovals.find((a) => a.task_id === selectedTask.id) || null
            }
            onResolveApproval={async (apprId, approved) => {
              await resolveApproval(apprId, approved);
            }}
          />
        ) : (
          /* VIEW 2: MISSION-CONTROL DASHBOARD LIST */
          <>
            {/* Header with Live Overview Strip, Kill Switch & Search */}
            <AutomationsHeader
              totalCount={tasks.length}
              activeCount={activeCount}
              pausedCount={pausedCount}
              failedCount={failedCount}
              totalSilentChecks={totalSilentChecks}
              activeFilter={activeFilter}
              countsByType={countsByType}
              onSelectFilter={setActiveFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onClose={closeDrawer}
              onNewAutomation={() => {
                setEditingTask(null);
                setPrefilledCreateType(activeFilter === 'all' ? 'scheduled' : activeFilter);
                setViewMode('create');
              }}
              onOpenStandingOrders={() => setViewMode('standing_orders')}
              onPauseAll={async () => {
                await pauseAllTasks();
              }}
              onResumeAll={async () => {
                await resumeAllTasks();
              }}
              isAllPaused={isAllPaused}
            />

            {/* Notification / Toast Banner if any */}
            {toastMessage && (
              <div className="px-5 py-2 bg-emerald-950/60 border-b border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-1.5 animate-in slide-in-from-top-1">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>{toastMessage}</span>
              </div>
            )}

            {/* Task Card List Area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
              {filteredTasks.length === 0 ? (
                <EmptyState
                  filter={activeFilter}
                  searchQuery={searchQuery}
                  onCreate={(targetType) => {
                    setEditingTask(null);
                    setPrefilledCreateType(targetType || 'scheduled');
                    setViewMode('create');
                  }}
                  onClearSearch={() => setSearchQuery('')}
                />
              ) : (
                filteredTasks.map((task) => (
                  <AutomationCard
                    key={task.id}
                    task={task}
                    isRunningNow={runningTaskId === task.id}
                    onRunNow={handleRunNow}
                    onToggleStatus={handleToggleStatus}
                    onOpenDetails={(t) => {
                      setSelectedTask(t);
                      setViewMode('detail');
                    }}
                    onEdit={(t) => {
                      setEditingTask(t);
                      setViewMode('edit');
                    }}
                    onDuplicate={handleDuplicate}
                    onDelete={handleDeleteWithUndo}
                  />
                ))
              )}
            </div>

            {/* Footer Promise */}
            <div className="px-5 py-3 border-t border-[#181818] bg-[#080808] text-center shrink-0">
              <p className="text-[11px] text-neutral-500 font-mono tracking-tight">
                🔒 Tasks execute locally with bounded context and path jailing.
              </p>
            </div>
          </>
        )}

        {/* VIEW 3: DEDICATED SLIDE-UP CREATE / EDIT SHEET */}
        {(viewMode === 'create' || viewMode === 'edit') && (
          <CreateAutomationSheet
            initialTask={editingTask}
            initialType={prefilledCreateType}
            onClose={() => setViewMode(selectedTask ? 'detail' : 'list')}
            onSubmit={async (data) => {
              const res = await createTask(data);
              return res;
            }}
            onUpdate={async (taskId, data) => {
              const ok = await updateTask(taskId, data);
              if (ok && selectedTask) {
                // Update selected task in state
                setSelectedTask((prev) => (prev ? { ...prev, ...data } : null));
              }
              return ok;
            }}
          />
        )}

        {/* 5-SECOND SOFT DELETE UNDO TOAST */}
        {deletedTaskUndo && (
          <div className="absolute bottom-14 left-5 right-5 p-3 rounded-xl bg-[#1c1c1c] border border-amber-500/40 text-white shadow-2xl flex items-center justify-between z-40 animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center gap-2 text-xs truncate">
              <span className="text-neutral-400">Deleted</span>
              <span className="font-semibold text-neutral-200 truncate max-w-[180px]">
                &ldquo;{deletedTaskUndo.task.name}&rdquo;
              </span>
            </div>
            <button
              onClick={handleUndoDelete}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>Undo (5s)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
