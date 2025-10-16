/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";
import { loadCliToolConfig, normalizeToolList, saveCliToolConfig, syncCoreToolConfig, } from "./utils/toolConfig.js";
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
        const geminiClient = geminiConfig?.getGeminiClient();
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
            saveCliToolConfig(cfg);
            syncCoreToolConfig(cfg);
            cfg = loadCliToolConfig();
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
                const tools = normalizeToolList(toolTokens);
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
                const normalizedTools = normalizeToolList(toolTokens);
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
                const normalizedTools = normalizeToolList(toolTokens);
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