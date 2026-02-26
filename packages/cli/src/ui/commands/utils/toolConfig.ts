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

interface CliToolConfigSharedState {
  collections: Record<string, string[]>;
  customPrompts: Record<string, CustomPromptMetadata>;
}

interface CliToolConfigSessionState {
  promptMode: PromptMode;
  activeCollection: string;
  activeCustomPrompt: ActiveCustomPrompt | null;
}

interface SaveCliToolConfigOptions {
  persistShared?: boolean;
  persistSession?: boolean;
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
    ToolNames.READ_COLLAB_MESSAGES,
    ToolNames.POST_COLLAB_MESSAGE,
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

const INSTANCE_ID_ENV_VAR = "LOWCAL_INSTANCE_ID";
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Get the global tool config path in ~/.qwen/tool-config.json
 */
export function resolveToolConfigPath(): string {
  const homeDir = homedir();
  const baseDir = homeDir
    ? path.join(homeDir, ".qwen")
    : path.join("/tmp", ".qwen");
  const rawInstanceId = process.env[INSTANCE_ID_ENV_VAR];
  const instanceId =
    typeof rawInstanceId === "string" ? rawInstanceId.trim() : "";
  if (INSTANCE_ID_PATTERN.test(instanceId)) {
    return path.join(baseDir, "instances", instanceId, "tool-config.json");
  }
  return path.join(baseDir, "tool-config.json");
}

/**
 * Get the shared tool config path in ~/.qwen/tool-config.json
 */
export function resolveSharedToolConfigPath(): string {
  const homeDir = homedir();
  const baseDir = homeDir
    ? path.join(homeDir, ".qwen")
    : path.join("/tmp", ".qwen");
  return path.join(baseDir, "tool-config.json");
}

/**
 * Estimate token count (roughly 1 token per 4 characters)
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function loadCliToolConfig(): CliToolConfig {
  const sharedPath = resolveSharedToolConfigPath();
  const sessionPath = resolveToolConfigPath();
  const sharedConfig = readToolConfigFile(sharedPath);
  const sessionConfig =
    sessionPath === sharedPath ? sharedConfig : readToolConfigFile(sessionPath);

  const sharedState = normalizeSharedState(
    sharedConfig ?? sessionConfig ?? undefined,
  );
  const sessionState = normalizeSessionState(
    sessionConfig ?? sharedConfig ?? undefined,
    sharedState.collections,
    sharedState.customPrompts,
  );

  return {
    promptMode: sessionState.promptMode,
    activeCollection: sessionState.activeCollection,
    collections: sharedState.collections,
    customPrompts: sharedState.customPrompts,
    activeCustomPrompt: sessionState.activeCustomPrompt,
  };
}

export function saveCliToolConfig(
  cfg: CliToolConfig,
  options: SaveCliToolConfigOptions = {},
): void {
  const sessionPath = resolveToolConfigPath();
  const sharedPath = resolveSharedToolConfigPath();
  const pathsCollide = sessionPath === sharedPath;
  const persistShared = options.persistShared ?? true;
  const persistSession = options.persistSession ?? true;
  const shouldPersistShared = persistShared || pathsCollide;

  if (shouldPersistShared) {
    const existingShared = readToolConfigFile(sharedPath);
    const sharedPayload = buildSharedPayload(cfg, existingShared);
    writeConfigFile(sharedPath, sharedPayload);
  }

  if (persistSession && !pathsCollide) {
    const sessionPayload = buildSessionPayload(cfg);
    writeConfigFile(sessionPath, sessionPayload);
  }
}

export function saveCliToolConfigAsGlobalDefault(cfg: CliToolConfig): void {
  const sharedPath = resolveSharedToolConfigPath();
  const payload: CliToolConfig = {
    promptMode: cfg.promptMode,
    activeCollection: cfg.activeCollection,
    collections: cloneCollections(cfg.collections),
    customPrompts: cfg.customPrompts ?? {},
    activeCustomPrompt: cfg.activeCustomPrompt ?? null,
  };
  writeConfigFile(sharedPath, payload);
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

    if (
      nextToolList.includes(ToolNames.POST_COLLAB_MESSAGE) &&
      !nextToolList.includes(ToolNames.READ_COLLAB_MESSAGES)
    ) {
      nextToolList = [...nextToolList, ToolNames.READ_COLLAB_MESSAGES];
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

function readToolConfigFile(
  configPath: string,
): Record<string, unknown> | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore and fall back to defaults
  }
  return undefined;
}

function normalizeSharedState(
  source?: Record<string, unknown>,
): CliToolConfigSharedState {
  const collections = applyToolCollectionPolicies({
    ...cloneCollections(DEFAULT_COLLECTIONS),
    ...normalizeCollections(
      source && typeof source["collections"] === "object"
        ? (source["collections"] as Record<string, unknown>)
        : {},
    ),
  });
  const customPrompts = normalizeCustomPrompts(
    source && typeof source["customPrompts"] === "object"
      ? (source["customPrompts"] as Record<string, unknown>)
      : {},
  );
  return {
    collections,
    customPrompts,
  };
}

function normalizeSessionState(
  source: Record<string, unknown> | undefined,
  collections: Record<string, string[]>,
  customPrompts: Record<string, CustomPromptMetadata>,
): CliToolConfigSessionState {
  const promptMode = normalizePromptMode(source?.["promptMode"]);
  const activeCollection =
    typeof source?.["activeCollection"] === "string" &&
    collections[source["activeCollection"]]
      ? source["activeCollection"]
      : DEFAULT_CONFIG.activeCollection;
  const activeCustomPrompt = normalizeActiveCustomPrompt(
    source?.["activeCustomPrompt"],
    customPrompts,
  );

  return {
    promptMode,
    activeCollection,
    activeCustomPrompt,
  };
}

function buildSharedPayload(
  cfg: CliToolConfig,
  existingShared?: Record<string, unknown>,
): CliToolConfig {
  const customPrompts = cfg.customPrompts ?? {};
  const preservedPromptMode = normalizePromptMode(existingShared?.["promptMode"]);
  const preservedActiveCollection =
    typeof existingShared?.["activeCollection"] === "string" &&
    cfg.collections[existingShared["activeCollection"]]
      ? existingShared["activeCollection"]
      : DEFAULT_CONFIG.activeCollection;
  const preservedActiveCustomPrompt = normalizeActiveCustomPrompt(
    existingShared?.["activeCustomPrompt"],
    customPrompts,
  );

  return {
    promptMode: preservedPromptMode,
    activeCollection: preservedActiveCollection,
    collections: cloneCollections(cfg.collections),
    customPrompts,
    activeCustomPrompt: preservedActiveCustomPrompt,
  };
}

function buildSessionPayload(cfg: CliToolConfig): CliToolConfigSessionState {
  return {
    promptMode: cfg.promptMode,
    activeCollection: cfg.activeCollection,
    activeCustomPrompt: cfg.activeCustomPrompt ?? null,
  };
}

function writeConfigFile(
  configPath: string,
  payload: unknown,
): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), "utf8");
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
