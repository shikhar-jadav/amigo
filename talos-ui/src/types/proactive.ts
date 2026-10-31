export type TriggerType = 'scheduled' | 'heartbeat' | 'event';
export type TaskStatus = 'active' | 'paused' | 'completed' | 'failed';
export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'awaiting_approval'
  | 'cancelled';

export interface TaskScheduleData {
  cron?: string;
  exact_timestamp?: number;
  interval_seconds?: number;
  timezone?: string;
  is_recurring?: boolean;
  next_run_at?: number;
  active_hours_start?: string;
  active_hours_end?: string;
  idle_only?: boolean;
}

export interface TaskActionPolicyData {
  type: string;
  delivery_target: 'originating_chat' | 'global_alert' | 'webhook' | 'silent';
  requires_approval: boolean;
  silent_if_no_action?: boolean;
  webhook_url?: string;
  model_name?: string;
  capabilities?: string[];
  allowed_commands?: string[];
}

export interface TaskPermissionsData {
  allowed_capabilities?: string[];
  allowed_paths?: string[];
  forbidden_paths?: string[];
  allowed_commands?: string[];
  allow_network?: boolean;
}

export interface StandingOrdersData {
  workspace_id: string;
  autonomy_level: 'full_autonomous' | 'semi_autonomous' | 'strict_approval';
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  allowed_directories: string[];
  protected_files: string[];
  allowed_commands: string[];
  custom_instructions: string;
  updated_at?: number;
}

export interface ProactiveTaskItem {
  id: string;
  name: string;
  description?: string;
  workspace_id: string;
  originating_thread_id: string;
  trigger_type: TriggerType;
  schedule: TaskScheduleData;
  action_policy?: TaskActionPolicyData;
  permissions?: TaskPermissionsData;
  status: TaskStatus;
  created_at?: number;
  last_run_at?: number;
  last_status?: string;
  silent_checks_count?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskExecutionItem {
  id: string;
  task_id: string;
  workspace_id: string;
  originating_thread_id: string;
  trigger_type: TriggerType;
  status: ExecutionStatus;
  priority: number;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  output_summary?: string;
  artifact_path?: string;
  error_details?: string;
}

export interface ProactiveNotificationItem {
  id: string;
  task_id?: string;
  execution_id?: string;
  thread_id: string;
  workspace_id: string;
  notification_type: 'alert' | 'scheduled_report' | 'health_check';
  title: string;
  content_markdown: string;
  artifact_path?: string;
  actions?: Array<{ label: string; action: string; path?: string }>;
  created_at: number;
}

export interface ApprovalRequestItem {
  id: string;
  execution_id: string;
  task_id: string;
  workspace_id: string;
  originating_thread_id: string;
  action_type: string;
  command?: string;
  target_path?: string;
  impact_summary: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  workspace_id?: string;
  originating_thread_id?: string;
  trigger_type: TriggerType;
  cron?: string;
  exact_timestamp?: number;
  interval_seconds?: number;
  is_recurring?: boolean;
  requires_approval?: boolean;
  capabilities?: string[];
  active_hours_start?: string;
  active_hours_end?: string;
  idle_only?: boolean;
  delivery_target?: 'originating_chat' | 'global_alert' | 'webhook' | 'silent';
  silent_if_no_action?: boolean;
  webhook_url?: string;
  model_name?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  name?: string;
  description?: string;
  trigger_type?: TriggerType;
  cron?: string;
  interval_seconds?: number;
  requires_approval?: boolean;
  status?: TaskStatus;
  active_hours_start?: string;
  active_hours_end?: string;
  idle_only?: boolean;
  delivery_target?: 'originating_chat' | 'global_alert' | 'webhook' | 'silent';
  silent_if_no_action?: boolean;
  webhook_url?: string;
  model_name?: string;
  metadata?: Record<string, unknown>;
}

export type EventTriggerType =
  | 'process_crash'
  | 'file_change'
  | 'git_commit'
  | 'webhook'
  | 'custom';
