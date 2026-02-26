/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthType } from "../core/contentGenerator.js";

export type TaskTemplateLevel = "project" | "user" | "builtin";

export type TaskExecutionMode = "headless" | "zellij_tab" | "in_process";
export type TaskExecutionModeWithDefault = TaskExecutionMode | "default";

export type TaskActionType = "prompt" | "slash_command";
export type TaskTemplateApprovalMode =
  | "plan"
  | "default"
  | "auto-edit"
  | "yolo";
export type TaskTemplateDeployMode = "launch" | "schedule";
export type TaskTemplateScheduleStartMode = "start_idle" | "run_immediately";

export interface TaskTemplateAction {
  type?: TaskActionType;
  value?: string;
}

export interface TaskTemplateAuthProfile {
  selectedType?: AuthType | string;
  providerId?: string;
  baseUrl?: string;
  apiKeyEnvVar?: string;
}

export interface TaskTemplateModelProfile {
  name?: string;
}

export interface TaskTemplateRunProfile {
  returnToSession?: boolean | string;
  allowRecursive?: boolean;
}

export interface TaskTemplateSystemPromptProfile {
  names?: string[];
  exclusive?: boolean;
  disable?: boolean;
}

export interface TaskTemplateExecutionProfile {
  mode?: TaskExecutionModeWithDefault;
}

export interface TaskTemplateToolsetProfile {
  collection?: string;
}

export interface TaskTemplateDeployProfile {
  mode?: TaskTemplateDeployMode;
  schedule?: string;
  jobId?: string;
  scheduleStart?: TaskTemplateScheduleStartMode;
}

/**
 * File-backed task template model.
 */
export interface TaskTemplate {
  id: string;
  name?: string;
  description?: string;
  tags?: string[];
  approvalMode?: TaskTemplateApprovalMode;
  deploy?: TaskTemplateDeployProfile;
  prompt?: string;
  action?: TaskTemplateAction;
  execution?: TaskTemplateExecutionProfile;
  auth?: TaskTemplateAuthProfile;
  model?: TaskTemplateModelProfile;
  run?: TaskTemplateRunProfile;
  systemPrompt?: TaskTemplateSystemPromptProfile;
  toolset?: TaskTemplateToolsetProfile;
  level: TaskTemplateLevel;
  filePath: string;
  isBuiltin?: boolean;
}

/**
 * Runtime profile used when launching/scheduling a task.
 */
export interface TaskRuntimeProfile {
  template_id?: string;
  template_level?: TaskTemplateLevel;
  action_type?: TaskActionType;
  action_value?: string;
  approval_mode?: TaskTemplateApprovalMode;
  execution_mode?: TaskExecutionModeWithDefault;
  auth?: TaskTemplateAuthProfile;
  model?: TaskTemplateModelProfile;
  run?: TaskTemplateRunProfile;
  system_prompt?: TaskTemplateSystemPromptProfile;
  toolset?: TaskTemplateToolsetProfile;
}

export interface ListTaskTemplatesOptions {
  level?: TaskTemplateLevel;
  tag?: string;
  force?: boolean;
}

export interface CreateTaskTemplateOptions {
  level: TaskTemplateLevel;
  overwrite?: boolean;
  customPath?: string;
}

export interface ResolveTaskTemplateOptions {
  level?: TaskTemplateLevel;
}
