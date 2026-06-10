/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import { Storage } from "@qwen-code/qwen-code-core";
import { SettingScope } from "../../config/settings.js";
import { MessageType, type HistoryItemInfo } from "../types.js";
import {
  type CliToolConfig,
  loadCliToolConfig,
  saveCliToolConfigAsGlobalDefault,
} from "./utils/toolConfig.js";
import type { OpenDialogActionReturn, SlashCommand } from "./types.js";
import { CommandKind } from "./types.js";

const SETTINGS_USAGE =
  "Usage: /settings [save-global|set-global|save <name>|load <name>|list]";
const SETTINGS_PROFILES_DIRNAME = "settings-profiles";
const SETTINGS_PROFILE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;

interface SettingsProfileFile {
  version: 1;
  savedAt: string;
  userSettings: Record<string, unknown>;
  workspaceSettings: Record<string, unknown>;
  toolConfig: CliToolConfig;
}

function writeJsonConfig(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function getSharedUserSettingsPath(): string {
  return path.join(Storage.getGlobalGeminiDir(), "settings.json");
}

function getSharedWorkspaceSettingsPath(cwd: string): string {
  return path.join(new Storage(cwd).getGeminiDir(), "settings.json");
}

function getSettingsProfilesDir(): string {
  return path.join(Storage.getGlobalGeminiDir(), SETTINGS_PROFILES_DIRNAME);
}

function getSettingsProfilePath(name: string): string {
  return path.join(getSettingsProfilesDir(), `${name}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCliToolConfig(value: unknown): value is CliToolConfig {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["promptMode"] === "string" &&
    typeof value["activeCollection"] === "string" &&
    isRecord(value["collections"])
  );
}

function isSettingsProfileFile(value: unknown): value is SettingsProfileFile {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value["version"] === 1 &&
    typeof value["savedAt"] === "string" &&
    isRecord(value["userSettings"]) &&
    isRecord(value["workspaceSettings"]) &&
    isCliToolConfig(value["toolConfig"])
  );
}

function applyGlobalDefaults(
  cwd: string,
  userSettings: Record<string, unknown>,
  workspaceSettings: Record<string, unknown>,
  toolConfig: CliToolConfig,
): void {
  const sharedUserSettingsPath = getSharedUserSettingsPath();
  const sharedWorkspaceSettingsPath = getSharedWorkspaceSettingsPath(cwd);

  writeJsonConfig(sharedUserSettingsPath, userSettings);
  if (
    path.resolve(sharedWorkspaceSettingsPath) !==
    path.resolve(sharedUserSettingsPath)
  ) {
    writeJsonConfig(sharedWorkspaceSettingsPath, workspaceSettings);
  }
  saveCliToolConfigAsGlobalDefault(toolConfig);
}

export const settingsCommand: SlashCommand = {
  name: "settings",
  description:
    "View/edit settings, save/load named profiles, or set global defaults",
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<void | OpenDialogActionReturn> => {
    const rawArgs = args?.trim() ?? "";

    if (!rawArgs) {
      return {
        type: "dialog",
        dialog: "settings",
      };
    }

    const reply = (message: string) => {
      const infoItem: Omit<HistoryItemInfo, "id"> = {
        type: MessageType.INFO,
        text: message,
      };
      context.ui.addItem(infoItem, Date.now());
    };

    const tokens = rawArgs.split(/\s+/);
    const subcommand = (tokens.shift() ?? "").toLowerCase();

    switch (subcommand) {
      case "save-global":
      case "set-global": {
        if (tokens.length > 0) {
          reply(SETTINGS_USAGE);
          return;
        }

        const userSettings = context.services.settings.forScope(
          SettingScope.User,
        ).settings;
        const workspaceSettings = context.services.settings.forScope(
          SettingScope.Workspace,
        ).settings;
        const currentToolConfig = loadCliToolConfig();

        applyGlobalDefaults(
          process.cwd(),
          userSettings ?? {},
          workspaceSettings ?? {},
          currentToolConfig,
        );

        reply(
          "Saved current session configuration as the global default for new sessions.",
        );
        return;
      }
      case "save": {
        const profileName = tokens[0];
        if (!profileName || tokens.length > 1) {
          reply("Usage: /settings save <name>");
          return;
        }
        if (!SETTINGS_PROFILE_NAME_PATTERN.test(profileName)) {
          reply(
            "Invalid profile name. Use 1-50 characters: letters, numbers, hyphen, or underscore.",
          );
          return;
        }

        const userSettings = context.services.settings.forScope(
          SettingScope.User,
        ).settings;
        const workspaceSettings = context.services.settings.forScope(
          SettingScope.Workspace,
        ).settings;
        const currentToolConfig = loadCliToolConfig();
        const profilePayload: SettingsProfileFile = {
          version: 1,
          savedAt: new Date().toISOString(),
          userSettings: userSettings ?? {},
          workspaceSettings: workspaceSettings ?? {},
          toolConfig: currentToolConfig,
        };

        writeJsonConfig(getSettingsProfilePath(profileName), profilePayload);
        reply(`Saved settings profile "${profileName}".`);
        return;
      }
      case "load": {
        const profileName = tokens[0];
        if (!profileName || tokens.length > 1) {
          reply("Usage: /settings load <name>");
          return;
        }
        if (!SETTINGS_PROFILE_NAME_PATTERN.test(profileName)) {
          reply(
            "Invalid profile name. Use 1-50 characters: letters, numbers, hyphen, or underscore.",
          );
          return;
        }

        const profilePath = getSettingsProfilePath(profileName);
        if (!fs.existsSync(profilePath)) {
          reply(`Settings profile "${profileName}" not found.`);
          return;
        }

        try {
          const profileContent = fs.readFileSync(profilePath, "utf8");
          const parsedProfile: unknown = JSON.parse(profileContent);
          if (!isSettingsProfileFile(parsedProfile)) {
            reply(`Settings profile "${profileName}" is invalid.`);
            return;
          }

          applyGlobalDefaults(
            process.cwd(),
            parsedProfile.userSettings,
            parsedProfile.workspaceSettings,
            parsedProfile.toolConfig,
          );

          reply(
            `Loaded settings profile "${profileName}" as the global default for new sessions.`,
          );
          return;
        } catch (error) {
          reply(
            `Failed to load settings profile "${profileName}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return;
        }
      }
      case "list": {
        if (tokens.length > 0) {
          reply("Usage: /settings list");
          return;
        }

        const profilesDir = getSettingsProfilesDir();
        if (!fs.existsSync(profilesDir)) {
          reply(
            'No saved settings profiles. Use "/settings save <name>" to create one.',
          );
          return;
        }
        const profileNames = fs
          .readdirSync(profilesDir)
          .filter((fileName) => fileName.endsWith(".json"))
          .map((fileName) => fileName.replace(/\.json$/u, ""))
          .sort((a, b) => a.localeCompare(b));

        if (profileNames.length === 0) {
          reply(
            'No saved settings profiles. Use "/settings save <name>" to create one.',
          );
          return;
        }

        reply(`Saved settings profiles: ${profileNames.join(", ")}`);
        return;
      }
      default:
        reply(SETTINGS_USAGE);
        return;
    }
  },
};
