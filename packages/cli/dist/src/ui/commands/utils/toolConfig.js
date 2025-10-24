/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { toolConfig, ToolNames } from "@qwen-code/qwen-code-core";
const DEFAULT_COLLECTIONS = {
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
        ToolNames.WEB_FETCH,
        ToolNames.WEB_SEARCH,
    ],
    minimal: [
        ToolNames.READ_FILE,
        ToolNames.WRITE_FILE,
        ToolNames.SHELL,
    ],
    "shell-only": [ToolNames.SHELL],
};
const CANONICAL_TOOL_NAMES = Object.values(ToolNames).reduce((map, name) => {
    map[name] = name;
    map[name.toUpperCase()] = name;
    return map;
}, {});
const DEFAULT_CONFIG = {
    promptMode: toolConfig.promptMode ?? "auto",
    activeCollection: toolConfig.activeCollection ?? "full",
    collections: cloneCollections(Object.keys(toolConfig.collections).length > 0
        ? toolConfig.collections
        : DEFAULT_COLLECTIONS),
    customPrompts: {},
    activeCustomPrompt: null,
};
/**
 * Get the global tool config path in ~/.qwen/tool-config.json
 */
export function resolveToolConfigPath() {
    const homeDir = homedir();
    if (!homeDir) {
        return path.join("/tmp", ".qwen", "tool-config.json");
    }
    return path.join(homeDir, ".qwen", "tool-config.json");
}
/**
 * Estimate token count (roughly 1 token per 4 characters)
 */
export function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}
export function loadCliToolConfig() {
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
        const mergedCollections = {
            ...cloneCollections(DEFAULT_COLLECTIONS),
            ...normalizeCollections(parsed.collections ?? {}),
        };
        const active = typeof parsed.activeCollection === "string" &&
            mergedCollections[parsed.activeCollection]
            ? parsed.activeCollection
            : DEFAULT_CONFIG.activeCollection;
        const customPrompts = normalizeCustomPrompts(parsed.customPrompts ?? {});
        const activeCustomPrompt = normalizeActiveCustomPrompt(parsed.activeCustomPrompt, customPrompts);
        return {
            promptMode,
            activeCollection: active,
            collections: mergedCollections,
            customPrompts,
            activeCustomPrompt,
        };
    }
    catch {
        return {
            ...DEFAULT_CONFIG,
            collections: cloneCollections(DEFAULT_CONFIG.collections),
        };
    }
}
export function saveCliToolConfig(cfg) {
    const configPath = resolveToolConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const payload = {
        promptMode: cfg.promptMode,
        activeCollection: cfg.activeCollection,
        collections: cloneCollections(cfg.collections),
        customPrompts: cfg.customPrompts ?? {},
        activeCustomPrompt: cfg.activeCustomPrompt ?? null,
    };
    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), "utf8");
}
export function syncCoreToolConfig(cfg) {
    toolConfig.promptMode = cfg.promptMode;
    toolConfig.activeCollection = cfg.activeCollection;
    toolConfig.collections = cloneCollections(cfg.collections);
}
export function normalizeToolName(name) {
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
export function normalizeToolList(toolNames) {
    return Array.from(new Set(toolNames
        .map((name) => normalizeToolName(String(name)))
        .filter((name) => name.length > 0)));
}
function normalizeCollections(collections) {
    const normalized = {};
    for (const [name, value] of Object.entries(collections)) {
        if (!Array.isArray(value)) {
            continue;
        }
        const list = normalizeToolList(value);
        if (list.length > 0) {
            normalized[name] = list;
        }
    }
    return normalized;
}
function normalizePromptMode(value) {
    if (typeof value !== "string") {
        return DEFAULT_CONFIG.promptMode;
    }
    const lower = value.toLowerCase();
    return lower === "full" || lower === "concise" || lower === "auto"
        ? lower
        : DEFAULT_CONFIG.promptMode;
}
function normalizeCustomPrompts(prompts) {
    const normalized = {};
    for (const [name, value] of Object.entries(prompts)) {
        if (typeof value !== "object" || value === null) {
            continue;
        }
        const obj = value;
        if (typeof obj["content"] === "string" &&
            typeof obj["exclusive"] === "boolean" &&
            typeof obj["createdAt"] === "number" &&
            typeof obj["tokenCount"] === "number") {
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
function normalizeActiveCustomPrompt(value, customPrompts) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "object") {
        return null;
    }
    const obj = value;
    // Support name as string or array of strings
    const rawName = obj["name"];
    let names;
    if (typeof rawName === "string") {
        if (customPrompts[rawName]) {
            names = [rawName];
        }
    }
    else if (Array.isArray(rawName)) {
        // Filter to existing prompts
        const filtered = rawName.filter((n) => typeof n === "string" && customPrompts[n]);
        if (filtered.length > 0) {
            names = filtered;
        }
    }
    if (names &&
        typeof obj["exclusive"] === "boolean") {
        return {
            name: names,
            exclusive: obj["exclusive"],
        };
    }
    return null;
}
function cloneCollections(collections) {
    return Object.fromEntries(Object.entries(collections).map(([name, tools]) => [name, [...tools]]));
}
//# sourceMappingURL=toolConfig.js.map