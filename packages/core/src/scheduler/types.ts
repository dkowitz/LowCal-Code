/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TaskActionType,
  TaskTemplateApprovalMode,
  TaskRuntimeProfile,
  TaskTemplateAuthProfile,
  TaskTemplateLevel,
  TaskTemplateModelProfile,
  TaskTemplateRunProfile,
} from "../task-templates/types.js";

/**
 * Status of a scheduled job
 */
export type JobStatus =
  | "scheduled"
  | "running"
  | "paused"
  | "error"
  | "completed";

/**
 * Execution mode for a scheduled job
 */
export type JobExecutionMode = "headless" | "zellij_tab" | "in_process";

export type ScheduleTaskExecutionMode = JobExecutionMode | "default";

/**
 * Represents a single scheduled job
 */
export interface Job {
  /** Unique identifier for the job (URL-safe slug) */
  id: string;

  /** Cron expression (5 fields: minute, hour, day, month, day_of_week) */
  schedule: string;

  /** The prompt to execute when the job is triggered */
  prompt: string;

  /** Whether the job is enabled */
  enabled: boolean;

  /** ISO timestamp when the job was created */
  created_at: string;

  /** ISO timestamp of the last execution */
  last_run: string | null;

  /** Pre-calculated next execution time */
  next_run: string | null;

  /** Total number of successful executions */
  run_count: number;

  /** Total number of failed executions */
  error_count: number;

  /** Current status of the job */
  status: JobStatus;

  /** Optional description for the job */
  description?: string;

  /** Maximum execution time in minutes (default: 10) */
  timeout_minutes?: number;

  /** Number of consecutive failures before auto-pausing */
  max_failures?: number;

  /** Optional execution mode override for this job */
  execution_mode?: JobExecutionMode;

  /** Optional action type for the job payload */
  action_type?: TaskActionType;

  /** Optional action payload (prompt text or slash command) */
  action_value?: string;

  /** Optional originating task template id */
  template_id?: string;

  /** Optional originating task template level */
  template_level?: TaskTemplateLevel;

  /** Optional session id for in_process execution targets */
  return_to_session_id?: string;

  /** Optional merged runtime profile for this job */
  runtime_profile?: TaskRuntimeProfile;
}

/**
 * Root structure of the cron.json file
 */
export interface CronStore {
  /** Schema version for migration purposes */
  version: string;

  /** Array of all scheduled jobs */
  jobs: Job[];

  /** ISO timestamp of last modification */
  last_modified: string;
}

/**
 * Result of a job execution
 */
export interface JobExecutionResult {
  /** Job ID */
  job_id: string;

  /** Execution start time */
  started_at: string;

  /** Execution end time */
  completed_at: string;

  /** Execution status */
  status: "success" | "error" | "timeout";

  /** Full output from the execution */
  output: string;

  /** Error message if status is error */
  error: string | null;

  /** Exit code if applicable */
  exit_code?: number;
}

/**
 * Parameters for creating a new job
 */
export interface CreateJobParams {
  id: string;
  schedule: string;
  prompt: string;
  description?: string;
  enabled?: boolean;
  timeout_minutes?: number;
  max_failures?: number;
  execution_mode?: JobExecutionMode;
  action_type?: TaskActionType;
  action_value?: string;
  approval_mode?: TaskTemplateApprovalMode;
  template_id?: string;
  template_level?: TaskTemplateLevel;
  return_to_session_id?: string;
  runtime_profile?: TaskRuntimeProfile;
}

/**
 * Parameters for updating an existing job
 */
export interface UpdateJobParams {
  id: string;
  schedule?: string;
  prompt?: string;
  description?: string;
  enabled?: boolean;
  next_run?: string;
  timeout_minutes?: number;
  max_failures?: number;
  execution_mode?: JobExecutionMode | null;
  action_type?: TaskActionType | null;
  action_value?: string | null;
  template_id?: string | null;
  template_level?: TaskTemplateLevel | null;
  return_to_session_id?: string | null;
  runtime_profile?: TaskRuntimeProfile | null;
}

/**
 * Valid actions for the schedule_task tool
 */
export type ScheduleTaskAction =
  | "create"
  | "list"
  | "get"
  | "update"
  | "delete"
  | "pause"
  | "resume"
  | "run_now";

/**
 * Parameters for the schedule_task tool
 */
export interface ScheduleTaskParams {
  action: ScheduleTaskAction;
  id?: string;
  schedule?: string;
  prompt?: string;
  description?: string;
  enabled?: boolean;
  timeout_minutes?: number;
  max_failures?: number;
  execution_mode?: ScheduleTaskExecutionMode;
  execution_mode_override?: boolean;
  action_type?: TaskActionType;
  action_value?: string;
  approval_mode?: TaskTemplateApprovalMode;
  template_id?: string;
  template_level?: TaskTemplateLevel | "auto";
  template_overrides?: TaskRuntimeProfile;
  auth?: TaskTemplateAuthProfile;
  model?: TaskTemplateModelProfile;
  run?: TaskTemplateRunProfile;
  return_to_session_id?: string;
}

/**
 * Configuration for the scheduler daemon
 */
export interface SchedulerConfig {
  /** Tick interval in milliseconds (default: 60000) */
  tick_interval_ms: number;

  /** Maximum number of concurrent job executions */
  max_concurrent_jobs: number;

  /** Default timeout for job execution in minutes */
  default_timeout_minutes: number;

  /** Number of consecutive failures before auto-pausing */
  default_max_failures: number;

  /** Maximum number of jobs allowed */
  max_jobs: number;

  /** Maximum executions per minute per job */
  max_executions_per_minute: number;

  /** Log retention in days */
  log_retention_days: number;

  /** Number of log files to keep per job */
  logs_per_job: number;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  tick_interval_ms: 60000, // 1 minute
  max_concurrent_jobs: 5,
  default_timeout_minutes: 10,
  default_max_failures: 3,
  max_jobs: 100,
  max_executions_per_minute: 1,
  log_retention_days: 30,
  logs_per_job: 10,
};

/**
 * Daemon status information
 */
export interface DaemonStatus {
  /** Whether the daemon is running */
  running: boolean;

  /** Process ID if running */
  pid?: number;

  /** When the daemon was started */
  started_at?: string;

  /** Last tick timestamp */
  last_tick?: string;

  /** Number of jobs currently executing */
  active_executions: number;

  /** Total jobs in the store */
  total_jobs: number;

  /** Jobs scheduled to run in the next tick */
  upcoming_jobs: string[];
}
