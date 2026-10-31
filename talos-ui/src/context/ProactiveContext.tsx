'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type {
  ProactiveTaskItem,
  ProactiveNotificationItem,
  ApprovalRequestItem,
  CreateTaskInput,
  UpdateTaskInput,
  TaskExecutionItem,
  StandingOrdersData,
} from '@/types/proactive';

export type {
  ProactiveTaskItem,
  ProactiveNotificationItem,
  ApprovalRequestItem,
  CreateTaskInput,
  UpdateTaskInput,
  TaskExecutionItem,
  StandingOrdersData,
};

interface ProactiveContextValue {
  tasks: ProactiveTaskItem[];
  activeTaskCount: number;
  activeCount: number;
  pausedCount: number;
  failedCount: number;
  totalSilentChecks: number;
  isDrawerOpen: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  activeToast: ProactiveNotificationItem | null;
  latestNotification: ProactiveNotificationItem | null;
  dismissToast: () => void;
  pendingApprovals: ApprovalRequestItem[];
  standingOrders: StandingOrdersData | null;
  refreshTasks: () => Promise<void>;
  createTask: (data: CreateTaskInput) => Promise<{ success: boolean; alreadyExists?: boolean; message?: string }>;
  updateTask: (taskId: string, data: UpdateTaskInput) => Promise<boolean>;
  runTaskNow: (taskId: string) => Promise<boolean>;
  pauseTask: (taskId: string) => Promise<boolean>;
  resumeTask: (taskId: string) => Promise<boolean>;
  pauseAllTasks: () => Promise<boolean>;
  resumeAllTasks: () => Promise<boolean>;
  deleteTask: (taskId: string) => Promise<boolean>;
  resolveApproval: (approvalId: string, approved: boolean) => Promise<boolean>;
  fetchTaskExecutions: (taskId: string) => Promise<TaskExecutionItem[]>;
  fetchStandingOrders: (workspaceId?: string) => Promise<StandingOrdersData | null>;
  saveStandingOrders: (orders: StandingOrdersData) => Promise<boolean>;
  agentsMdContent: string;
  fetchAgentsMd: (workspaceId?: string) => Promise<string>;
  saveAgentsMd: (content: string, workspaceId?: string) => Promise<boolean>;
  heartbeatStatus: 'ok' | 'standby' | 'alert';
}

const ProactiveContext = createContext<ProactiveContextValue | undefined>(undefined);

export const ProactiveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<ProactiveTaskItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<ProactiveNotificationItem | null>(null);
  const [latestNotification, setLatestNotification] = useState<ProactiveNotificationItem | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequestItem[]>([]);
  const [heartbeatStatus, setHeartbeatStatus] = useState<'ok' | 'standby' | 'alert'>('ok');

  const backendUrl = process.env.NEXT_PUBLIC_TALOS_BACKEND_URL || 'http://localhost:8001';

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks`);
      if (res.ok) {
        const data = await res.json();
        if (data.tasks) {
          setTasks(data.tasks);
        }
      }
    } catch {
      // Backend may be starting up
    }
  }, [backendUrl]);

  const refreshApprovals = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/approvals`);
      if (res.ok) {
        const data = await res.json();
        if (data.approvals) {
          setPendingApprovals(data.approvals);
        }
      }
    } catch {
      // Ignore network errors during boot
    }
  }, [backendUrl]);

  const [standingOrders, setStandingOrders] = useState<StandingOrdersData | null>(null);
  const [agentsMdContent, setAgentsMdContent] = useState<string>('');

  const fetchAgentsMd = useCallback(async (workspaceId: string = 'default_workspace') => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/agents-md?workspace_id=${encodeURIComponent(workspaceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.content) {
          setAgentsMdContent(data.content);
          return data.content;
        }
      }
    } catch (e) {
      console.error('Failed to fetch AGENTS.md:', e);
    }
    return '';
  }, [backendUrl]);

  const saveAgentsMd = useCallback(async (content: string, workspaceId: string = 'default_workspace') => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/agents-md`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, workspace_id: workspaceId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.content) {
          setAgentsMdContent(data.content);
          return true;
        }
      }
    } catch (e) {
      console.error('Failed to save AGENTS.md:', e);
    }
    return false;
  }, [backendUrl]);

  const fetchStandingOrders = useCallback(async (workspaceId: string = 'default_workspace') => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/standing-orders?workspace_id=${encodeURIComponent(workspaceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.standing_orders) {
          setStandingOrders(data.standing_orders);
          return data.standing_orders;
        }
      }
    } catch (e) {
      console.error('Failed to fetch standing orders:', e);
    }
    return null;
  }, [backendUrl]);

  const saveStandingOrders = useCallback(async (orders: StandingOrdersData) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/standing-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orders),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.standing_orders) {
          setStandingOrders(data.standing_orders);
          return true;
        }
      }
    } catch (e) {
      console.error('Failed to save standing orders:', e);
    }
    return false;
  }, [backendUrl]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      try {
        const [tasksRes, apprsRes, ordersRes] = await Promise.all([
          fetch(`${backendUrl}/api/proactive/tasks`).catch(() => null),
          fetch(`${backendUrl}/api/proactive/approvals`).catch(() => null),
          fetch(`${backendUrl}/api/proactive/standing-orders`).catch(() => null),
        ]);
        if (mounted && tasksRes && tasksRes.ok) {
          const data = await tasksRes.json();
          if (data.tasks) setTasks(data.tasks);
        }
        if (mounted && apprsRes && apprsRes.ok) {
          const data = await apprsRes.json();
          if (data.approvals) setPendingApprovals(data.approvals);
        }
        if (mounted && ordersRes && ordersRes.ok) {
          const data = await ordersRes.json();
          if (data.standing_orders) setStandingOrders(data.standing_orders);
        }
      } catch {
        // Backend starting up
      }
    };
    loadInitial();
    return () => {
      mounted = false;
    };
  }, [backendUrl]);

  // SSE Event Stream for live proactive messages & crash alerts
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(`${backendUrl}/api/proactive/events`);

        eventSource.addEventListener('proactive_notification', (event: MessageEvent) => {
          try {
            const notif: ProactiveNotificationItem = JSON.parse(event.data);
            setActiveToast(notif);
            setLatestNotification(notif);
            if (notif.notification_type === 'alert') {
              setHeartbeatStatus('alert');
            }
            refreshTasks();
            refreshApprovals();
          } catch (e) {
            console.error('Failed to parse proactive SSE notification:', e);
          }
        });

        eventSource.onopen = () => {
          setHeartbeatStatus('ok');
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
          }
          // Reconnect with backoff
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch {
        reconnectTimeout = setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [backendUrl, refreshTasks, refreshApprovals]);

  const runTaskNow = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks/${taskId}/run-now`, {
        method: 'POST',
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to run task now:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const pauseTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks/${taskId}/pause`, {
        method: 'POST',
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to pause task:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const resumeTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks/${taskId}/resume`, {
        method: 'POST',
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to resume task:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks/${taskId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const resolveApproval = useCallback(async (approvalId: string, approved: boolean) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/approvals/${approvalId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        await refreshApprovals();
        return true;
      }
    } catch (e) {
      console.error('Failed to resolve approval:', e);
    }
    return false;
  }, [backendUrl, refreshApprovals]);

  const createTask = useCallback(async (data: CreateTaskInput) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok) {
        await refreshTasks();
        return {
          success: true,
          alreadyExists: resData.already_exists || false,
          message: resData.message,
        };
      }
      return { success: false, message: resData.detail || resData.message || 'Failed to create task' };
    } catch (e: unknown) {
      console.error('Failed to create task:', e);
      return { success: false, message: e instanceof Error ? e.message : 'Network error' };
    }
  }, [backendUrl, refreshTasks]);

  const updateTask = useCallback(async (taskId: string, data: UpdateTaskInput) => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to update task:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const pauseAllTasks = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/pause-all`, {
        method: 'POST',
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to pause all tasks:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const resumeAllTasks = useCallback(async () => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/resume-all`, {
        method: 'POST',
      });
      if (res.ok) {
        await refreshTasks();
        return true;
      }
    } catch (e) {
      console.error('Failed to resume all tasks:', e);
    }
    return false;
  }, [backendUrl, refreshTasks]);

  const fetchTaskExecutions = useCallback(async (taskId: string): Promise<TaskExecutionItem[]> => {
    try {
      const res = await fetch(`${backendUrl}/api/proactive/tasks/${taskId}/executions?limit=15`);
      if (res.ok) {
        const data = await res.json();
        return data.executions || [];
      }
    } catch (e) {
      console.error('Failed to fetch task executions:', e);
    }
    return [];
  }, [backendUrl]);

  const activeCount = tasks.filter((t) => t.status === 'active').length;
  const pausedCount = tasks.filter((t) => t.status === 'paused').length;
  const failedCount = tasks.filter((t) => t.status === 'failed' || t.last_status === 'failed').length;
  const totalSilentChecks = tasks.reduce((sum, t) => sum + (t.silent_checks_count || 0), 0);

  return (
    <ProactiveContext.Provider
      value={{
        tasks,
        activeTaskCount: activeCount,
        activeCount,
        pausedCount,
        failedCount,
        totalSilentChecks,
        isDrawerOpen,
        toggleDrawer: () => setIsDrawerOpen((prev) => !prev),
        openDrawer: () => setIsDrawerOpen(true),
        closeDrawer: () => setIsDrawerOpen(false),
        activeToast,
        latestNotification,
        dismissToast: () => setActiveToast(null),
        pendingApprovals,
        standingOrders,
        refreshTasks,
        createTask,
        updateTask,
        runTaskNow,
        pauseTask,
        resumeTask,
        pauseAllTasks,
        resumeAllTasks,
        deleteTask,
        resolveApproval,
        fetchTaskExecutions,
        fetchStandingOrders,
        saveStandingOrders,
        agentsMdContent,
        fetchAgentsMd,
        saveAgentsMd,
        heartbeatStatus,
      }}
    >
      {children}
    </ProactiveContext.Provider>
  );
};

export const useProactive = (): ProactiveContextValue => {
  const context = useContext(ProactiveContext);
  if (!context) {
    throw new Error('useProactive must be used within a ProactiveProvider');
  }
  return context;
};
