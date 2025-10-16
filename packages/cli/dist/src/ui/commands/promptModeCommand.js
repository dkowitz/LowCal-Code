/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";
import { loadCliToolConfig, saveCliToolConfig, syncCoreToolConfig, } from "./utils/toolConfig.js";
/**
 * `/promptmode` – Switch between automatic, full, or concise system prompts.
 *
 * Usage:
 *   /promptmode            – shows the current mode.
 *   /promptmode set <mode> – sets the mode (`auto`, `full`, or `concise`).
 */
export const promptModeCommand = {
    name: "promptmode",
    description: "view or change system prompt mode (auto|full|concise)",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const cfg = loadCliToolConfig();
        const reply = (message) => {
            const infoItem = {
                type: MessageType.INFO,
                text: message,
            };
            context.ui.addItem(infoItem, Date.now());
        };
        const rawArgs = args?.trim() ?? "";
        // No arguments – just report current mode
        if (!rawArgs) {
            reply(`Current prompt mode: ${cfg.promptMode} (auto = concise prompt for LM Studio; full = standard prompt; concise = always short)`);
            return;
        }
        const tokens = rawArgs.split(/\s+/);
        const [verb, value] = tokens;
        // Expect "set <mode>"
        if (verb === "set" && value) {
            const mode = value.toLowerCase();
            const allowed = ["auto", "full", "concise"];
            if (!allowed.includes(mode)) {
                reply(`Invalid mode "${value}". Use one of: auto, full, concise.`);
                return;
            }
            cfg.promptMode = mode;
            saveCliToolConfig(cfg);
            syncCoreToolConfig(cfg);
            const geminiConfig = context.services.config;
            const geminiClient = geminiConfig?.getGeminiClient();
            try {
                if (geminiClient && typeof geminiClient.reinitialize === "function") {
                    await geminiClient.reinitialize();
                }
            }
            catch (error) {
                console.warn("[promptmode] Failed to reinitialize chat after mode change", error);
            }
            const autoNote = mode === "auto"
                ? "Auto mode selects the concise prompt when LM Studio is detected."
                : "";
            reply(`Prompt mode set to "${mode}". ${autoNote}`.trim());
            return;
        }
        reply("Usage: /promptmode [set <auto|full|concise>]");
    },
};
//# sourceMappingURL=promptModeCommand.js.map