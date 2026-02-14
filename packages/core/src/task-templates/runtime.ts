/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TaskActionType,
  TaskExecutionModeWithDefault,
  TaskRuntimeProfile,
  TaskTemplate,
  TaskTemplateAuthProfile,
  TaskTemplateLevel,
  TaskTemplateModelProfile,
  TaskTemplateRunProfile,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function normalizeTemplateLevel(value: unknown): TaskTemplateLevel | undefined {
  if (value === "project" || value === "user" || value === "builtin") {
    return value;
  }
  return undefined;
}

export function normalizeActionType(value: unknown): TaskActionType | undefined {
  if (value === "prompt" || value === "slash_command") {
    return value;
  }
  return undefined;
}

export function normalizeExecutionMode(
  value: unknown,
): TaskExecutionModeWithDefault | undefined {
  if (
    value === "default" ||
    value === "headless" ||
    value === "zellij_tab" ||
    value === "in_process"
  ) {
    return value;
  }
  return undefined;
}

export function normalizeAuthProfile(value: unknown): TaskTemplateAuthProfile | undefined {
  if (!isRecord(value)) return undefined;
  const selectedType = asTrimmedString(value["selectedType"]);
  const providerId = asTrimmedString(value["providerId"]);
  const baseUrl = asTrimmedString(value["baseUrl"]);
  const apiKeyEnvVar = asTrimmedString(value["apiKeyEnvVar"]);
  if (!selectedType && !providerId && !baseUrl && !apiKeyEnvVar) {
    return undefined;
  }
  return { selectedType, providerId, baseUrl, apiKeyEnvVar };
}

export function normalizeModelProfile(
  value: unknown,
): TaskTemplateModelProfile | undefined {
  if (!isRecord(value)) return undefined;
  const name = asTrimmedString(value["name"]);
  if (!name) return undefined;
  return { name };
}

export function normalizeRunProfile(value: unknown): TaskTemplateRunProfile | undefined {
  if (!isRecord(value)) return undefined;
  const returnToSessionRaw = value["returnToSession"];
  const allowRecursiveRaw = value["allowRecursive"];
  const returnToSession =
    typeof returnToSessionRaw === "boolean"
      ? returnToSessionRaw
      : asTrimmedString(returnToSessionRaw);
  const allowRecursive =
    typeof allowRecursiveRaw === "boolean" ? allowRecursiveRaw : undefined;
  if (returnToSession === undefined && allowRecursive === undefined) {
    return undefined;
  }
  return { returnToSession, allowRecursive };
}

export function normalizeRuntimeProfile(value: unknown): TaskRuntimeProfile {
  if (!isRecord(value)) return {};
  return {
    template_id: asTrimmedString(value["template_id"]),
    template_level: normalizeTemplateLevel(value["template_level"]),
    action_type: normalizeActionType(value["action_type"]),
    action_value: asTrimmedString(value["action_value"]),
    execution_mode: normalizeExecutionMode(value["execution_mode"]),
    auth: normalizeAuthProfile(value["auth"]),
    model: normalizeModelProfile(value["model"]),
    run: normalizeRunProfile(value["run"]),
  };
}

export function runtimeProfileFromTemplate(template: TaskTemplate): TaskRuntimeProfile {
  return {
    template_id: template.id,
    template_level: template.level,
    action_type: template.action?.type,
    action_value: template.action?.value ?? template.prompt,
    execution_mode: template.execution?.mode,
    auth: template.auth,
    model: template.model,
    run: template.run,
  };
}

export function mergeRuntimeProfiles(
  ...profiles: Array<TaskRuntimeProfile | undefined>
): TaskRuntimeProfile {
  const merged: TaskRuntimeProfile = {};
  for (const profile of profiles) {
    if (!profile) continue;
    if (profile.template_id) merged.template_id = profile.template_id;
    if (profile.template_level) merged.template_level = profile.template_level;
    if (profile.action_type) merged.action_type = profile.action_type;
    if (profile.action_value) merged.action_value = profile.action_value;
    if (profile.execution_mode) merged.execution_mode = profile.execution_mode;
    if (profile.auth) merged.auth = { ...merged.auth, ...profile.auth };
    if (profile.model) merged.model = { ...merged.model, ...profile.model };
    if (profile.run) merged.run = { ...merged.run, ...profile.run };
  }
  return merged;
}

export function sanitizeRuntimeProfile(
  profile: TaskRuntimeProfile | undefined,
): TaskRuntimeProfile | undefined {
  if (!profile) return undefined;
  const auth = profile.auth
    ? {
        selectedType: profile.auth.selectedType,
        providerId: profile.auth.providerId,
        baseUrl: profile.auth.baseUrl,
        apiKeyEnvVar: profile.auth.apiKeyEnvVar,
      }
    : undefined;
  return {
    template_id: profile.template_id,
    template_level: profile.template_level,
    action_type: profile.action_type,
    action_value: profile.action_value,
    execution_mode: profile.execution_mode,
    auth,
    model: profile.model ? { ...profile.model } : undefined,
    run: profile.run ? { ...profile.run } : undefined,
  };
}

