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
const CANONICAL_TOOL_NAMES = Object.values(ToolNames).reduce((map, name) => {
    map[name] = name;
    map[name.toUpperCase()] = name;
    return map;
}, {});
const DEFAULT_CONFIG = {
    promptMode: toolConfig.promptMode ?? "auto",
    activeCollection: toolConfig.activeCollection ?? "full",
    collections: applyToolCollectionPolicies(cloneCollections(Object.keys(toolConfig.collections).length > 0
        ? toolConfig.collections
        : DEFAULT_COLLECTIONS)),
    customPrompts: {},
    activeCustomPrompt: null,
};
const INSTANCE_ID_ENV_VAR = "LOWCAL_INSTANCE_ID";
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
/**
 * Get the global tool config path in ~/.qwen/tool-config.json
 */
export function resolveToolConfigPath() {
    const homeDir = homedir();
    const baseDir = homeDir
        ? path.join(homeDir, ".qwen")
        : path.join("/tmp", ".qwen");
    const rawInstanceId = process.env[INSTANCE_ID_ENV_VAR];
    const instanceId = typeof rawInstanceId === "string" ? rawInstanceId.trim() : "";
    if (INSTANCE_ID_PATTERN.test(instanceId)) {
        return path.join(baseDir, "instances", instanceId, "tool-config.json");
    }
    return path.join(baseDir, "tool-config.json");
}
/**
 * Get the shared tool config path in ~/.qwen/tool-config.json
 */
export function resolveSharedToolConfigPath() {
    const homeDir = homedir();
    const baseDir = homeDir
        ? path.join(homeDir, ".qwen")
        : path.join("/tmp", ".qwen");
    return path.join(baseDir, "tool-config.json");
}
/**
 * Estimate token count (roughly 1 token per 4 characters)
 */
export function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}
export function loadCliToolConfig() {
    const sharedPath = resolveSharedToolConfigPath();
    const sessionPath = resolveToolConfigPath();
    const sharedConfig = readToolConfigFile(sharedPath);
    const sessionConfig = sessionPath === sharedPath ? sharedConfig : readToolConfigFile(sessionPath);
    const sharedState = normalizeSharedState(sharedConfig ?? sessionConfig ?? undefined);
    const sessionState = normalizeSessionState(sessionConfig ?? sharedConfig ?? undefined, sharedState.collections, sharedState.customPrompts);
    return {
        promptMode: sessionState.promptMode,
        activeCollection: sessionState.activeCollection,
        collections: sharedState.collections,
        customPrompts: sharedState.customPrompts,
        activeCustomPrompt: sessionState.activeCustomPrompt,
    };
}
export function saveCliToolConfig(cfg, options = {}) {
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
export function saveCliToolConfigAsGlobalDefault(cfg) {
    const sharedPath = resolveSharedToolConfigPath();
    const payload = {
        promptMode: cfg.promptMode,
        activeCollection: cfg.activeCollection,
        collections: cloneCollections(cfg.collections),
        customPrompts: cfg.customPrompts ?? {},
        activeCustomPrompt: cfg.activeCustomPrompt ?? null,
    };
    writeConfigFile(sharedPath, payload);
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
        normalized[name] = list;
    }
    return normalized;
}
function applyToolCollectionPolicies(collections) {
    const normalized = cloneCollections(collections);
    // Keep "full" current with all known core tools, even for older configs.
    const fullSet = new Set(normalized["full"] ?? []);
    for (const toolName of Object.values(ToolNames)) {
        fullSet.add(toolName);
    }
    normalized["full"] = Array.from(fullSet);
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
function readToolConfigFile(configPath) {
    if (!fs.existsSync(configPath)) {
        return undefined;
    }
    try {
        const raw = fs.readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
            return parsed;
        }
    }
    catch {
        // ignore and fall back to defaults
    }
    return undefined;
}
function normalizeSharedState(source) {
    const collections = applyToolCollectionPolicies({
        ...cloneCollections(DEFAULT_COLLECTIONS),
        ...normalizeCollections(source && typeof source["collections"] === "object"
            ? source["collections"]
            : {}),
    });
    const customPrompts = normalizeCustomPrompts(source && typeof source["customPrompts"] === "object"
        ? source["customPrompts"]
        : {});
    return {
        collections,
        customPrompts,
    };
}
function normalizeSessionState(source, collections, customPrompts) {
    const promptMode = normalizePromptMode(source?.["promptMode"]);
    const activeCollection = typeof source?.["activeCollection"] === "string" &&
        collections[source["activeCollection"]]
        ? source["activeCollection"]
        : DEFAULT_CONFIG.activeCollection;
    const activeCustomPrompt = normalizeActiveCustomPrompt(source?.["activeCustomPrompt"], customPrompts);
    return {
        promptMode,
        activeCollection,
        activeCustomPrompt,
    };
}
function buildSharedPayload(cfg, existingShared) {
    const customPrompts = cfg.customPrompts ?? {};
    const preservedPromptMode = normalizePromptMode(existingShared?.["promptMode"]);
    const preservedActiveCollection = typeof existingShared?.["activeCollection"] === "string" &&
        cfg.collections[existingShared["activeCollection"]]
        ? existingShared["activeCollection"]
        : DEFAULT_CONFIG.activeCollection;
    const preservedActiveCustomPrompt = normalizeActiveCustomPrompt(existingShared?.["activeCustomPrompt"], customPrompts);
    return {
        promptMode: preservedPromptMode,
        activeCollection: preservedActiveCollection,
        collections: cloneCollections(cfg.collections),
        customPrompts,
        activeCustomPrompt: preservedActiveCustomPrompt,
    };
}
function buildSessionPayload(cfg) {
    return {
        promptMode: cfg.promptMode,
        activeCollection: cfg.activeCollection,
        activeCustomPrompt: cfg.activeCustomPrompt ?? null,
    };
}
function writeConfigFile(configPath, payload) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), "utf8");
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
    if (names && typeof obj["exclusive"] === "boolean") {
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