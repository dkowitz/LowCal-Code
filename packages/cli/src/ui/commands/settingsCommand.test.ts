/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import { settingsCommand } from "./settingsCommand.js";
import { type CommandContext } from "./types.js";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { MessageType } from "../types.js";
import { SettingScope, type LoadedSettings } from "../../config/settings.js";
import {
  loadCliToolConfig,
  saveCliToolConfigAsGlobalDefault,
} from "./utils/toolConfig.js";

vi.mock("./utils/toolConfig.js", () => ({
  loadCliToolConfig: vi.fn(),
  saveCliToolConfigAsGlobalDefault: vi.fn(),
}));

describe("settingsCommand", () => {
  let mockContext: CommandContext;
  const mockLoadCliToolConfig = vi.mocked(loadCliToolConfig);
  const mockSaveCliToolConfigAsGlobalDefault = vi.mocked(
    saveCliToolConfigAsGlobalDefault,
  );
  let mockMkdirSync: ReturnType<typeof vi.spyOn>;
  let mockWriteFileSync: ReturnType<typeof vi.spyOn>;
  let mockExistsSync: ReturnType<typeof vi.spyOn>;
  let mockReadFileSync: ReturnType<typeof vi.spyOn>;
  let mockReaddirSync: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdirSync = vi
      .spyOn(fs, "mkdirSync")
      .mockImplementation(() => undefined as unknown as string);
    mockWriteFileSync = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation(() => undefined);
    mockExistsSync = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    mockReadFileSync = vi.spyOn(fs, "readFileSync").mockReturnValue("");
    mockReaddirSync = vi.spyOn(fs, "readdirSync").mockReturnValue([]);
    const userSettings = { model: { name: "model-a" } };
    const workspaceSettings = { approvalMode: "default" };
    const loadedSettings = {
      merged: {},
      setValue: vi.fn(),
      forScope: vi.fn((scope: SettingScope) => {
        if (scope === SettingScope.User) {
          return { settings: userSettings, path: "/tmp/user-settings.json" };
        }
        if (scope === SettingScope.Workspace) {
          return {
            settings: workspaceSettings,
            path: "/tmp/workspace-settings.json",
          };
        }
        return { settings: {}, path: "/tmp/other-settings.json" };
      }),
    } as unknown as LoadedSettings;
    mockContext = createMockCommandContext({
      services: {
        settings: loadedSettings,
      },
    });
    mockLoadCliToolConfig.mockReturnValue({
      promptMode: "full",
      activeCollection: "minimal",
      collections: { minimal: ["run_shell_command"] },
      customPrompts: {},
      activeCustomPrompt: null,
    });
  });

  it("should return a dialog action to open the settings dialog", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    const result = await settingsCommand.action(mockContext, "");
    expect(result).toEqual({
      type: "dialog",
      dialog: "settings",
    });
  });

  it("saves current config as global defaults with save-global", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    await settingsCommand.action(mockContext, "save-global");

    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync.mock.calls[0][0]).toContain("settings.json");
    expect(mockWriteFileSync.mock.calls[1][0]).toContain("settings.json");
    expect(mockSaveCliToolConfigAsGlobalDefault).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMode: "full",
        activeCollection: "minimal",
      }),
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: expect.stringContaining("Saved current session configuration"),
      },
      expect.any(Number),
    );
  });

  it("supports set-global alias", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    await settingsCommand.action(mockContext, "set-global");

    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockSaveCliToolConfigAsGlobalDefault).toHaveBeenCalledTimes(1);
  });

  it("saves a named settings profile", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    await settingsCommand.action(mockContext, "save work");

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(mockWriteFileSync.mock.calls[0][0]).toContain(
      "settings-profiles/work.json",
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Saved settings profile "work".',
      },
      expect.any(Number),
    );
  });

  it("loads a named settings profile", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    mockExistsSync.mockImplementation((filePath) =>
      String(filePath).endsWith("settings-profiles/work.json"),
    );
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        savedAt: "2026-01-01T00:00:00.000Z",
        userSettings: { model: { name: "model-b" } },
        workspaceSettings: { approvalMode: "default" },
        toolConfig: {
          promptMode: "full",
          activeCollection: "minimal",
          collections: { minimal: ["run_shell_command"] },
          customPrompts: {},
          activeCustomPrompt: null,
        },
      }),
    );

    await settingsCommand.action(mockContext, "load work");

    expect(mockWriteFileSync).toHaveBeenCalledTimes(2);
    expect(mockWriteFileSync.mock.calls[0][0]).toContain("settings.json");
    expect(mockWriteFileSync.mock.calls[1][0]).toContain("settings.json");
    expect(mockSaveCliToolConfigAsGlobalDefault).toHaveBeenCalledWith(
      expect.objectContaining({
        promptMode: "full",
        activeCollection: "minimal",
      }),
    );
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: 'Loaded settings profile "work" as the global default for new sessions.',
      },
      expect.any(Number),
    );
  });

  it("lists saved settings profiles", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["beta.json", "alpha.json", "notes.md"]);

    await settingsCommand.action(mockContext, "list");

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: "Saved settings profiles: alpha, beta",
      },
      expect.any(Number),
    );
  });

  it("shows usage for unknown subcommands", async () => {
    if (!settingsCommand.action) {
      throw new Error("The settings command must have an action.");
    }
    await settingsCommand.action(mockContext, "bogus");
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: "Usage: /settings [save-global|set-global|save <name>|load <name>|list]",
      },
      expect.any(Number),
    );
  });

  it("should have the correct name and description", () => {
    expect(settingsCommand.name).toBe("settings");
    expect(settingsCommand.description).toBe(
      "View/edit settings, save/load named profiles, or set global defaults",
    );
  });
});
