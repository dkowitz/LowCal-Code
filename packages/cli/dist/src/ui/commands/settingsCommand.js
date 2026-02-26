/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs";
import path from "node:path";
import { Storage } from "@qwen-code/qwen-code-core";
import { SettingScope } from "../../config/settings.js";
import { MessageType } from "../types.js";
import { loadCliToolConfig, saveCliToolConfigAsGlobalDefault, } from "./utils/toolConfig.js";
import { CommandKind } from "./types.js";
function writeJsonConfig(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}
export const settingsCommand = {
    name: "settings",
    description: "View/edit settings or save current config as global defaults",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const rawArgs = args?.trim() ?? "";
        if (!rawArgs) {
            return {
                type: "dialog",
                dialog: "settings",
            };
        }
        const reply = (message) => {
            const infoItem = {
                type: MessageType.INFO,
                text: message,
            };
            context.ui.addItem(infoItem, Date.now());
        };
        const subcommand = rawArgs.toLowerCase();
        if (!["save-global", "set-global"].includes(subcommand)) {
            reply("Usage: /settings [save-global]");
            return;
        }
        const globalSettingsPath = path.join(Storage.getGlobalGeminiDir(), "settings.json");
        const workspaceSettingsPath = path.join(new Storage(process.cwd()).getGeminiDir(), "settings.json");
        const userSettings = context.services.settings.forScope(SettingScope.User).settings;
        const workspaceSettings = context.services.settings.forScope(SettingScope.Workspace).settings;
        const currentToolConfig = loadCliToolConfig();
        writeJsonConfig(globalSettingsPath, userSettings ?? {});
        writeJsonConfig(workspaceSettingsPath, workspaceSettings ?? {});
        saveCliToolConfigAsGlobalDefault(currentToolConfig);
        reply("Saved current session configuration as the global default for new sessions.");
    },
};
//# sourceMappingURL=settingsCommand.js.map