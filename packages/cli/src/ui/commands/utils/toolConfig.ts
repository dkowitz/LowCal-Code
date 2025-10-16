/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { toolConfig, ToolNames } from "@qwen-code/qwen-code-core";

export type PromptMode = "auto" | "full" | "concise";

export interface CliToolConfig {
  promptMode: PromptMode;
  activeCollection: string;
  collections: Record<string, string[]>;
}

const DEFAULT_COLLECTIONS: Record<string, string[]> = {
  full: [
    ToolNames.READ_FILE,
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
  ],
  minimal: [
    ToolNames.READ_FILE,
    ToolNames.WRITE_FILE,
    ToolNames.SHELL,
  ],
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
  collections: cloneCollections(
    Object.keys(toolConfig.collections).length > 0
      ? toolConfig.collections
      : DEFAULT_COLLECTIONS,
  ),
};

export function resolveToolConfigPath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, ".gemini", "tool-config.json");
}

export function loadCliToolConfig(): CliToolConfig {
  const configPath = resolveToolConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, collections: cloneCollections(DEFAULT_CONFIG.collections) };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) ?? {};
    const promptMode = normalizePromptMode(parsed.promptMode);
    const mergedCollections = {
      ...cloneCollections(DEFAULT_COLLECTIONS),
      ...normalizeCollections(parsed.collections ?? {}),
    };
    const active =
      typeof parsed.activeCollection === "string" &&
      mergedCollections[parsed.activeCollection]
        ? parsed.activeCollection
        : DEFAULT_CONFIG.activeCollection;

    return {
      promptMode,
      activeCollection: active,
      collections: mergedCollections,
    };
  } catch {
    return { ...DEFAULT_CONFIG, collections: cloneCollections(DEFAULT_CONFIG.collections) };
  }
}

export function saveCliToolConfig(cfg: CliToolConfig): void {
  const configPath = resolveToolConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const payload: CliToolConfig = {
    promptMode: cfg.promptMode,
    activeCollection: cfg.activeCollection,
    collections: cloneCollections(cfg.collections),
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

function normalizePromptMode(value: unknown): PromptMode {
  if (typeof value !== "string") {
    return DEFAULT_CONFIG.promptMode;
  }
  const lower = value.toLowerCase();
  return lower === "full" || lower === "concise" || lower === "auto"
    ? (lower as PromptMode)
    : DEFAULT_CONFIG.promptMode;
}

function cloneCollections(
  collections: Record<string, string[]>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(collections).map(([name, tools]) => [name, [...tools]]),
  );
}
