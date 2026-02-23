/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { TaskActionType, TaskExecutionModeWithDefault, TaskRuntimeProfile, TaskTemplateSystemPromptProfile, TaskTemplate, TaskTemplateAuthProfile, TaskTemplateLevel, TaskTemplateModelProfile, TaskTemplateRunProfile } from "./types.js";
export declare function normalizeTemplateLevel(value: unknown): TaskTemplateLevel | undefined;
export declare function normalizeActionType(value: unknown): TaskActionType | undefined;
export declare function normalizeExecutionMode(value: unknown): TaskExecutionModeWithDefault | undefined;
export declare function normalizeAuthProfile(value: unknown): TaskTemplateAuthProfile | undefined;
export declare function normalizeModelProfile(value: unknown): TaskTemplateModelProfile | undefined;
export declare function normalizeRunProfile(value: unknown): TaskTemplateRunProfile | undefined;
export declare function normalizeSystemPromptProfile(value: unknown): TaskTemplateSystemPromptProfile | undefined;
export declare function normalizeRuntimeProfile(value: unknown): TaskRuntimeProfile;
export declare function runtimeProfileFromTemplate(template: TaskTemplate): TaskRuntimeProfile;
export declare function mergeRuntimeProfiles(...profiles: Array<TaskRuntimeProfile | undefined>): TaskRuntimeProfile;
export declare function sanitizeRuntimeProfile(profile: TaskRuntimeProfile | undefined): TaskRuntimeProfile | undefined;
