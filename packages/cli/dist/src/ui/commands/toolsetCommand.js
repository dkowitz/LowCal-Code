/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";
import { ToolNames } from "@qwen-code/qwen-code-core";
import { loadCliToolConfig, saveCliToolConfig, syncCoreToolConfig, } from "./utils/toolConfig.js";
function normalizeLookupKey(value) {
    if (!value) {
        return "";
    }
    return value
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, "");
}
function registerToolNameVariant(lookup, rawName, canonicalName) {
    if (!rawName) {
        return;
    }
    const key = normalizeLookupKey(rawName);
    if (!key) {
        return;
    }
    const existing = lookup.get(key);
    if (existing) {
        existing.add(canonicalName);
    }
    else {
        lookup.set(key, new Set([canonicalName]));
    }
}
function buildToolLookup(toolRegistry) {
    const lookup = new Map();
    for (const builtinName of Object.values(ToolNames)) {
        registerToolNameVariant(lookup, builtinName, builtinName);
    }
    const tools = toolRegistry?.getAllTools?.() ?? [];
    for (const tool of tools) {
        registerToolNameVariant(lookup, tool.name, tool.name);
        registerToolNameVariant(lookup, tool.displayName, tool.name);
    }
    return lookup;
}
function synchronizeFullCollection(cfg, toolRegistry) {
    if (!cfg.collections) {
        cfg.collections = {};
    }
    const existing = cfg.collections["full"] ?? [];
    const names = new Set();
    for (const name of existing) {
        if (name) {
            names.add(name);
        }
    }
    for (const builtin of Object.values(ToolNames)) {
        names.add(builtin);
    }
    const registryTools = toolRegistry?.getAllTools?.() ?? [];
    for (const tool of registryTools) {
        if (tool?.name) {
            names.add(tool.name);
        }
    }
    cfg.collections["full"] = Array.from(names).sort();
}
function resolveToolTokens(tokens, lookup) {
    const resolved = [];
    const seen = new Set();
    const unknown = [];
    const ambiguous = [];
    for (const token of tokens) {
        const trimmed = token?.trim() ?? "";
        if (!trimmed) {
            continue;
        }
        const key = normalizeLookupKey(trimmed);
        if (!key) {
            continue;
        }
        const matches = lookup.get(key);
        if (!matches || matches.size === 0) {
            unknown.push(trimmed);
            continue;
        }
        if (matches.size > 1) {
            ambiguous.push(trimmed);
            continue;
        }
        const [canonical] = matches;
        if (!seen.has(canonical)) {
            seen.add(canonical);
            resolved.push(canonical);
        }
    }
    return { resolved, unknown, ambiguous };
}
function formatToolResolutionError(unknown, ambiguous) {
    const parts = [];
    if (unknown.length > 0) {
        parts.push(`Unknown tool name${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
    }
    if (ambiguous.length > 0) {
        parts.push(`Ambiguous tool name${ambiguous.length === 1 ? "" : "s"}: ${ambiguous.join(", ")}. Please use the exact identifier shown by /tools desc.`);
    }
    parts.push("Use /tools desc to view valid tool identifiers.");
    return parts.join(" ");
}
/**
 * `/toolset` – Manage tool collections used by the concise/full prompt logic.
 *
 * Sub-commands:
 *   /toolset list                     – show all collection names
 *   /toolset show <name>              – display tools in a collection
 *   /toolset activate <name>          – set activeCollection
 *   /toolset create <name> [tools...] – create a new collection (optional tool list)
 *   /toolset add <name> <tool>        – add a tool to an existing collection
 *   /toolset remove <name> <tool>     – remove a tool from a collection
 */
export const toolsetCommand = {
    name: "toolset",
    description: "manage tool collections (list, show, activate/use, create, add, remove)",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        let cfg = loadCliToolConfig();
        const reply = (msg) => {
            const info = {
                type: MessageType.INFO,
                text: msg,
            };
            context.ui.addItem(info, Date.now());
        };
        const rawArgs = args?.trim() ?? "";
        if (!rawArgs) {
            reply("Usage: /toolset <list|show|activate|use|create|add|remove> …");
            return;
        }
        const tokens = rawArgs.split(/\s+/);
        const subRaw = tokens.shift() ?? "";
        const restTokens = tokens;
        const sub = subRaw.toLowerCase();
        const geminiConfig = context.services.config;
        const geminiClient = geminiConfig?.getGeminiClient?.();
        const toolRegistry = geminiConfig?.getToolRegistry?.() ?? null;
        synchronizeFullCollection(cfg, toolRegistry);
        const toolLookup = buildToolLookup(toolRegistry);
        const refreshTools = async () => {
            if (geminiClient && typeof geminiClient.setTools === "function") {
                try {
                    await geminiClient.setTools();
                }
                catch (error) {
                    console.warn("[toolset] Failed to refresh tool declarations", error);
                }
            }
        };
        const persist = async (message) => {
            synchronizeFullCollection(cfg, toolRegistry);
            saveCliToolConfig(cfg);
            syncCoreToolConfig(cfg);
            cfg = loadCliToolConfig();
            synchronizeFullCollection(cfg, toolRegistry);
            await refreshTools();
            reply(message);
        };
        switch (sub) {
            case "list": {
                const names = Object.keys(cfg.collections);
                if (names.length === 0) {
                    reply("No tool collections defined.");
                    break;
                }
                const formatted = names
                    .map((name) => name === cfg.activeCollection ? `${name} (active)` : name)
                    .join(", ");
                reply(`Collections: ${formatted}`);
                break;
            }
            case "show": {
                const target = restTokens[0] ?? cfg.activeCollection;
                if (!target) {
                    reply("/toolset show <collection>");
                    break;
                }
                const tools = cfg.collections[target];
                if (!tools) {
                    reply(`Collection "${target}" does not exist.`);
                    break;
                }
                reply(`Collection "${target}" (${tools.length} tool${tools.length === 1 ? "" : "s"}): ${tools.length ? tools.join(", ") : "(empty)"}`);
                break;
            }
            case "activate":
            case "use": {
                const target = restTokens[0];
                if (!target) {
                    reply(`/toolset ${sub} <collection>`);
                    break;
                }
                if (!cfg.collections[target]) {
                    reply(`Collection "${target}" does not exist.`);
                    break;
                }
                cfg = {
                    ...cfg,
                    activeCollection: target,
                };
                await persist(`Active collection set to "${target}". Tool availability updated.`);
                break;
            }
            case "create": {
                const name = restTokens[0];
                const toolTokens = restTokens.slice(1);
                if (!name) {
                    reply("/toolset create <collection> [tools…]");
                    break;
                }
                if (cfg.collections[name]) {
                    reply(`Collection "${name}" already exists.`);
                    break;
                }
                const { resolved, unknown, ambiguous } = resolveToolTokens(toolTokens, toolLookup);
                if (unknown.length > 0 || ambiguous.length > 0) {
                    reply(formatToolResolutionError(unknown, ambiguous));
                    break;
                }
                const tools = resolved;
                cfg = {
                    ...cfg,
                    collections: {
                        ...cfg.collections,
                        [name]: tools,
                    },
                    activeCollection: cfg.activeCollection || name,
                };
                await persist(`Created collection "${name}" with ${tools.length} tool(s).`);
                break;
            }
            case "add": {
                const collection = restTokens[0];
                const toolTokens = restTokens.slice(1);
                if (!collection || toolTokens.length === 0) {
                    reply("/toolset add <collection> <tool> [more tools…]");
                    break;
                }
                const list = cfg.collections[collection];
                if (!list) {
                    reply(`Collection "${collection}" not found.`);
                    break;
                }
                const { resolved, unknown, ambiguous } = resolveToolTokens(toolTokens, toolLookup);
                if (unknown.length > 0 || ambiguous.length > 0) {
                    reply(formatToolResolutionError(unknown, ambiguous));
                    break;
                }
                const normalizedTools = resolved;
                const added = [];
                for (const tool of normalizedTools) {
                    if (!list.includes(tool)) {
                        list.push(tool);
                        added.push(tool);
                    }
                }
                if (added.length === 0) {
                    reply(`All provided tools already exist in collection "${collection}".`);
                    break;
                }
                await persist(`Added ${added.join(", ")} to collection "${collection}".`);
                break;
            }
            case "remove": {
                const collection = restTokens[0];
                const toolTokens = restTokens.slice(1);
                if (!collection || toolTokens.length === 0) {
                    reply("/toolset remove <collection> <tool> [more tools…]");
                    break;
                }
                const list = cfg.collections[collection];
                if (!list) {
                    reply(`Collection "${collection}" not found.`);
                    break;
                }
                const { resolved, unknown, ambiguous } = resolveToolTokens(toolTokens, toolLookup);
                if (unknown.length > 0 || ambiguous.length > 0) {
                    reply(formatToolResolutionError(unknown, ambiguous));
                    break;
                }
                const normalizedTools = resolved;
                const removed = [];
                const missing = [];
                for (const tool of normalizedTools) {
                    const idx = list.indexOf(tool);
                    if (idx >= 0) {
                        list.splice(idx, 1);
                        removed.push(tool);
                    }
                    else {
                        missing.push(tool);
                    }
                }
                if (removed.length === 0) {
                    reply(`None of the specified tools were present in collection "${collection}".`);
                    break;
                }
                let message = `Removed ${removed.join(", ")} from collection "${collection}".`;
                if (missing.length) {
                    message += ` (Not present: ${missing.join(", ")})`;
                }
                await persist(message);
                break;
            }
            default: {
                reply("Unknown sub-command. Use /toolset list|show|activate|use|create|add|remove.");
            }
        }
    },
};
//# sourceMappingURL=toolsetCommand.js.map