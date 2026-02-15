/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { toolConfig, ToolNames } from "@qwen-code/qwen-code-core";

export type PromptMode = "auto" | "full" | "concise";

export interface CustomPromptMetadata {
  content: string;
  exclusive: boolean;
  createdAt: number;
  tokenCount: number;
}

export interface ActiveCustomPrompt {
  /**
   * List of active prompt names. Allows stacking multiple prompts.
   */
  name: string[];
  exclusive: boolean;
}

export interface CliToolConfig {
  promptMode: PromptMode;
  activeCollection: string;
  collections: Record<string, string[]>;
  customPrompts?: Record<string, CustomPromptMetadata>;
  activeCustomPrompt?: ActiveCustomPrompt | null;
}

const DEFAULT_COLLECTIONS: Record<string, string[]> = {
  full: [
    ToolNames.READ_FILE,
    ToolNames.READ_IMAGE,
    ToolNames.WRITE_FILE,
    ToolNames.READ_MANY_FILES,
    ToolNames.GLOB,
    ToolNames.GREP,
    ToolNames.EDIT,
    ToolNames.SHELL,
    ToolNames.TODO_WRITE,
    ToolNames.MEMORY,
    ToolNames.TASK,
    ToolNames.EXIT_PLAN_MODE,
    ToolNames.WEB_FETCH,
    ToolNames.WEB_SEARCH,
    ToolNames.SEARXNG_SEARCH,
    ToolNames.SCHEDULE_TASK,
    ToolNames.LAUNCH_TASK,
    ToolNames.READ_SESSION_MESSAGES,
  ],
  minimal: [ToolNames.READ_FILE, ToolNames.WRITE_FILE, ToolNames.SHELL],
  "shell-only": [ToolNames.SHELL],
};

const CANONICAL_TOOL_NAMES: Record<string, string> = Object.values(
  ToolNames,
).reduce<Record<string, string>>((map, name) => {
  map[name] = name;
  map[name.toUpperCase()] = name;
  return map;
}, {});

const DEFAULT_CONFIG: CliToolConfig = {
  promptMode: toolConfig.promptMode ?? "auto",
  activeCollection: toolConfig.activeCollection ?? "full",
  collections: applyToolCollectionPolicies(
    cloneCollections(
      Object.keys(toolConfig.collections).length > 0
        ? toolConfig.collections
        : DEFAULT_COLLECTIONS,
    ),
  ),
  customPrompts: {},
  activeCustomPrompt: null,
};

/**
 * Get the global tool config path in ~/.qwen/tool-config.json
 */
export function resolveToolConfigPath(): string {
  const homeDir = homedir();
  if (!homeDir) {
    return path.join("/tmp", ".qwen", "tool-config.json");
  }
  return path.join(homeDir, ".qwen", "tool-config.json");
}

/**
 * Estimate token count (roughly 1 token per 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function loadCliToolConfig(): CliToolConfig {
  const configPath = resolveToolConfigPath();
  if (!fs.existsSync(configPath)) {
    return {
      ...DEFAULT_CONFIG,
      collections: cloneCollections(DEFAULT_CONFIG.collections),
    };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) ?? {};
    const promptMode = normalizePromptMode(parsed.promptMode);
    const mergedCollections = applyToolCollectionPolicies({
      ...cloneCollections(DEFAULT_COLLECTIONS),
      ...normalizeCollections(parsed.collections ?? {}),
    });
    const active =
      typeof parsed.activeCollection === "string" &&
      mergedCollections[parsed.activeCollection]
        ? parsed.activeCollection
        : DEFAULT_CONFIG.activeCollection;

    const customPrompts = normalizeCustomPrompts(parsed.customPrompts ?? {});
    const activeCustomPrompt = normalizeActiveCustomPrompt(
      parsed.activeCustomPrompt,
      customPrompts,
    );

    return {
      promptMode,
      activeCollection: active,
      collections: mergedCollections,
      customPrompts,
      activeCustomPrompt,
    };
  } catch {
    return {
      ...DEFAULT_CONFIG,
      collections: cloneCollections(DEFAULT_CONFIG.collections),
    };
  }
}

export function saveCliToolConfig(cfg: CliToolConfig): void {
  const configPath = resolveToolConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const payload: CliToolConfig = {
    promptMode: cfg.promptMode,
    activeCollection: cfg.activeCollection,
    collections: cloneCollections(cfg.collections),
    customPrompts: cfg.customPrompts ?? {},
    activeCustomPrompt: cfg.activeCustomPrompt ?? null,
  };
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), "utf8");
}

export function syncCoreToolConfig(cfg: CliToolConfig): void {
  toolConfig.promptMode = cfg.promptMode;
  toolConfig.activeCollection = cfg.activeCollection;
  toolConfig.collections = cloneCollections(cfg.collections);
}

export function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return trimmed;
  }
  const upper = trimmed.toUpperCase();
  if (CANONICAL_TOOL_NAMES[upper]) {
    return CANONICAL_TOOL_NAMES[upper];
  }
  return trimmed;
}

export function normalizeToolList(toolNames: string[]): string[] {
  return Array.from(
    new Set(
      toolNames
        .map((name) => normalizeToolName(String(name)))
        .filter((name) => name.length > 0),
    ),
  );
}

function normalizeCollections(
  collections: Record<string, unknown>,
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(collections)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const list = normalizeToolList(value as string[]);
    if (list.length > 0) {
      normalized[name] = list;
    }
  }
  return normalized;
}

function applyToolCollectionPolicies(
  collections: Record<string, string[]>,
): Record<string, string[]> {
  const normalized = cloneCollections(collections);

  // Keep "full" current with all known core tools, even for older configs.
  const fullSet = new Set(normalized["full"] ?? []);
  for (const toolName of Object.values(ToolNames)) {
    fullSet.add(toolName);
  }
  normalized["full"] = Array.from(fullSet);

  // launch_task depends on read_session_messages for mailbox-based returns.
  for (const [collectionName, toolList] of Object.entries(normalized)) {
    let nextToolList = [...toolList];

    if (
      nextToolList.includes(ToolNames.READ_FILE) &&
      !nextToolList.includes(ToolNames.READ_IMAGE)
    ) {
      nextToolList = [...nextToolList, ToolNames.READ_IMAGE];
    }

    if (
      nextToolList.includes(ToolNames.LAUNCH_TASK) &&
      !nextToolList.includes(ToolNames.READ_SESSION_MESSAGES)
    ) {
      nextToolList = [...nextToolList, ToolNames.READ_SESSION_MESSAGES];
    }

    normalized[collectionName] = nextToolList;
  }

  return normalized;
}

function normalizePromptMode(value: unknown): PromptMode {
  if (typeof value !== "string") {
    return DEFAULT_CONFIG.promptMode;
  }
  const lower = value.toLowerCase();
  return lower === "full" || lower === "concise" || lower === "auto"
    ? (lower as PromptMode)
    : DEFAULT_CONFIG.promptMode;
}

function normalizeCustomPrompts(
  prompts: Record<string, unknown>,
): Record<string, CustomPromptMetadata> {
  const normalized: Record<string, CustomPromptMetadata> = {};
  for (const [name, value] of Object.entries(prompts)) {
    if (typeof value !== "object" || value === null) {
      continue;
    }
    const obj = value as Record<string, unknown>;
    if (
      typeof obj["content"] === "string" &&
      typeof obj["exclusive"] === "boolean" &&
      typeof obj["createdAt"] === "number" &&
      typeof obj["tokenCount"] === "number"
    ) {
      normalized[name] = {
        content: obj["content"],
        exclusive: obj["exclusive"],
        createdAt: obj["createdAt"],
        tokenCount: obj["tokenCount"],
      };
    }
  }
  return normalized;
}

function normalizeActiveCustomPrompt(
  value: unknown,
  customPrompts: Record<string, CustomPromptMetadata>,
): ActiveCustomPrompt | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return null;
  }
  const obj = value as Record<string, unknown>;
  // Support name as string or array of strings
  const rawName = obj["name"];
  let names: string[] | undefined;
  if (typeof rawName === "string") {
    if (customPrompts[rawName]) {
      names = [rawName];
    }
  } else if (Array.isArray(rawName)) {
    // Filter to existing prompts
    const filtered = rawName.filter(
      (n) => typeof n === "string" && customPrompts[n as string],
    );
    if (filtered.length > 0) {
      names = filtered as string[];
    }
  }
  if (names && typeof obj["exclusive"] === "boolean") {
    return {
      name: names,
      exclusive: obj["exclusive"] as boolean,
    };
  }
  return null;
}

function cloneCollections(
  collections: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(collections).map(([name, tools]) => [name, [...tools]]),
  );
}
