/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
vi.mock("fs", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        mkdirSync: vi.fn(),
    };
});
import { LOWCAL_INSTANCE_ID_ENV_VAR, Storage } from "./storage.js";
const originalInstanceId = process.env[LOWCAL_INSTANCE_ID_ENV_VAR];
afterEach(() => {
    if (originalInstanceId === undefined) {
        delete process.env[LOWCAL_INSTANCE_ID_ENV_VAR];
    }
    else {
        process.env[LOWCAL_INSTANCE_ID_ENV_VAR] = originalInstanceId;
    }
});
describe("Storage – getGlobalSettingsPath", () => {
    it("returns path to ~/.qwen/settings.json", () => {
        const expected = path.join(os.homedir(), ".qwen", "settings.json");
        expect(Storage.getGlobalSettingsPath()).toBe(expected);
    });
    it("returns namespaced settings path when LOWCAL_INSTANCE_ID is set", () => {
        process.env[LOWCAL_INSTANCE_ID_ENV_VAR] = "session-a";
        const expected = path.join(os.homedir(), ".qwen", "instances", "session-a", "settings.json");
        expect(Storage.getGlobalSettingsPath()).toBe(expected);
    });
});
describe("Storage – additional helpers", () => {
    const projectRoot = "/tmp/project";
    const storage = new Storage(projectRoot);
    it("getWorkspaceSettingsPath returns project/.qwen/settings.json", () => {
        const expected = path.join(projectRoot, ".qwen", "settings.json");
        expect(storage.getWorkspaceSettingsPath()).toBe(expected);
    });
    it("getWorkspaceSettingsPath uses namespaced path when LOWCAL_INSTANCE_ID is set", () => {
        process.env[LOWCAL_INSTANCE_ID_ENV_VAR] = "session-b";
        const expected = path.join(projectRoot, ".qwen", "instances", "session-b", "settings.json");
        expect(storage.getWorkspaceSettingsPath()).toBe(expected);
    });
    it("getUserCommandsDir returns ~/.qwen/commands", () => {
        const expected = path.join(os.homedir(), ".qwen", "commands");
        expect(Storage.getUserCommandsDir()).toBe(expected);
    });
    it("getProjectCommandsDir returns project/.qwen/commands", () => {
        const expected = path.join(projectRoot, ".qwen", "commands");
        expect(storage.getProjectCommandsDir()).toBe(expected);
    });
    it("getMcpOAuthTokensPath returns ~/.qwen/mcp-oauth-tokens.json", () => {
        const expected = path.join(os.homedir(), ".qwen", "mcp-oauth-tokens.json");
        expect(Storage.getMcpOAuthTokensPath()).toBe(expected);
    });
    it("getGlobalToolConfigPath returns ~/.qwen/tool-config.json", () => {
        const expected = path.join(os.homedir(), ".qwen", "tool-config.json");
        expect(Storage.getGlobalToolConfigPath()).toBe(expected);
    });
    it("getGlobalToolConfigPath uses namespaced path when LOWCAL_INSTANCE_ID is set", () => {
        process.env[LOWCAL_INSTANCE_ID_ENV_VAR] = "session-c";
        const expected = path.join(os.homedir(), ".qwen", "instances", "session-c", "tool-config.json");
        expect(Storage.getGlobalToolConfigPath()).toBe(expected);
    });
});
//# sourceMappingURL=storage.test.js.map