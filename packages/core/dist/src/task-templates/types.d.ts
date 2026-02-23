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
export type TaskTemplateApprovalMode = "plan" | "default" | "auto-edit" | "yolo";
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
/**
 * File-backed task template model.
 */
export interface TaskTemplate {
    id: string;
    name?: string;
    description?: string;
    tags?: string[];
    approvalMode?: TaskTemplateApprovalMode;
    prompt?: string;
    action?: TaskTemplateAction;
    execution?: TaskTemplateExecutionProfile;
    auth?: TaskTemplateAuthProfile;
    model?: TaskTemplateModelProfile;
    run?: TaskTemplateRunProfile;
    systemPrompt?: TaskTemplateSystemPromptProfile;
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
