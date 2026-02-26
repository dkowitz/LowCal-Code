/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  TaskActionType,
  TaskTemplateApprovalMode,
  TaskExecutionModeWithDefault,
  TaskRuntimeProfile,
  TaskTemplateSystemPromptProfile,
  TaskTemplate,
  TaskTemplateAuthProfile,
  TaskTemplateLevel,
  TaskTemplateModelProfile,
  TaskTemplateRunProfile,
  TaskTemplateToolsetProfile,
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

export function normalizeApprovalMode(
  value: unknown,
): TaskTemplateApprovalMode | undefined {
  if (
    value === "plan" ||
    value === "default" ||
    value === "auto-edit" ||
    value === "yolo"
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

export function normalizeSystemPromptProfile(
  value: unknown,
): TaskTemplateSystemPromptProfile | undefined {
  if (!isRecord(value)) return undefined;
  const namesRaw = value["names"];
  const names = Array.isArray(namesRaw)
    ? namesRaw
        .map((entry) => asTrimmedString(entry))
        .filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const exclusive =
    typeof value["exclusive"] === "boolean" ? value["exclusive"] : undefined;
  const disable =
    typeof value["disable"] === "boolean" ? value["disable"] : undefined;

  if (disable === true) {
    return { disable: true };
  }
  if (!names || names.length === 0) {
    return undefined;
  }
  return {
    names,
    exclusive: exclusive === true,
  };
}

export function normalizeToolsetProfile(
  value: unknown,
): TaskTemplateToolsetProfile | undefined {
  if (typeof value === "string") {
    const collection = asTrimmedString(value);
    return collection ? { collection } : undefined;
  }
  if (!isRecord(value)) return undefined;
  const collection = asTrimmedString(value["collection"]);
  if (!collection) return undefined;
  return { collection };
}

export function normalizeRuntimeProfile(value: unknown): TaskRuntimeProfile {
  if (!isRecord(value)) return {};
  return {
    template_id: asTrimmedString(value["template_id"]),
    template_level: normalizeTemplateLevel(value["template_level"]),
    action_type: normalizeActionType(value["action_type"]),
    action_value: asTrimmedString(value["action_value"]),
    approval_mode: normalizeApprovalMode(value["approval_mode"]),
    execution_mode: normalizeExecutionMode(value["execution_mode"]),
    auth: normalizeAuthProfile(value["auth"]),
    model: normalizeModelProfile(value["model"]),
    run: normalizeRunProfile(value["run"]),
    system_prompt: normalizeSystemPromptProfile(value["system_prompt"]),
    toolset: normalizeToolsetProfile(value["toolset"]),
  };
}

export function runtimeProfileFromTemplate(template: TaskTemplate): TaskRuntimeProfile {
  return {
    template_id: template.id,
    template_level: template.level,
    action_type: template.action?.type,
    action_value: template.action?.value ?? template.prompt,
    approval_mode: template.approvalMode,
    execution_mode: template.execution?.mode,
    auth: template.auth,
    model: template.model,
    run: template.run,
    system_prompt: template.systemPrompt,
    toolset: template.toolset,
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
    if (profile.approval_mode) merged.approval_mode = profile.approval_mode;
    if (profile.execution_mode) merged.execution_mode = profile.execution_mode;
    if (profile.auth) merged.auth = { ...merged.auth, ...profile.auth };
    if (profile.model) merged.model = { ...merged.model, ...profile.model };
    if (profile.run) merged.run = { ...merged.run, ...profile.run };
    if (profile.system_prompt) {
      merged.system_prompt = {
        ...merged.system_prompt,
        ...profile.system_prompt,
      };
    }
    if (profile.toolset) {
      merged.toolset = {
        ...merged.toolset,
        ...profile.toolset,
      };
    }
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
    approval_mode: profile.approval_mode,
    execution_mode: profile.execution_mode,
    auth,
    model: profile.model ? { ...profile.model } : undefined,
    run: profile.run ? { ...profile.run } : undefined,
    system_prompt: profile.system_prompt
      ? { ...profile.system_prompt }
      : undefined,
    toolset: profile.toolset ? { ...profile.toolset } : undefined,
  };
}
