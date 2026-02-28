/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCliToolConfig, saveCliToolConfig, resolveSharedToolConfigPath, } from "./toolConfig.js";
describe("toolConfig persistence", () => {
    const originalHome = process.env["HOME"];
    const originalUserProfile = process.env["USERPROFILE"];
    const originalInstanceId = process.env["LOWCAL_INSTANCE_ID"];
    let tmpHome;
    beforeEach(() => {
        tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tool-config-test-"));
        process.env["HOME"] = tmpHome;
        process.env["USERPROFILE"] = tmpHome;
    });
    afterEach(() => {
        if (typeof originalHome === "string") {
            process.env["HOME"] = originalHome;
        }
        else {
            delete process.env["HOME"];
        }
        if (typeof originalUserProfile === "string") {
            process.env["USERPROFILE"] = originalUserProfile;
        }
        else {
            delete process.env["USERPROFILE"];
        }
        if (typeof originalInstanceId === "string") {
            process.env["LOWCAL_INSTANCE_ID"] = originalInstanceId;
        }
        else {
            delete process.env["LOWCAL_INSTANCE_ID"];
        }
    });
    it("preserves empty collections across sessions", () => {
        process.env["LOWCAL_INSTANCE_ID"] = "instance-a";
        const cfg = loadCliToolConfig();
        cfg.collections["shell-only"] = [];
        cfg.collections["custom-empty"] = [];
        saveCliToolConfig(cfg, { persistShared: true, persistSession: true });
        process.env["LOWCAL_INSTANCE_ID"] = "instance-b";
        const reloaded = loadCliToolConfig();
        expect(reloaded.collections["shell-only"]).toEqual([]);
        expect(reloaded.collections["custom-empty"]).toEqual([]);
    });
    it("does not re-add removed tools during reload normalization", () => {
        process.env["LOWCAL_INSTANCE_ID"] = "instance-a";
        const cfg = loadCliToolConfig();
        cfg.collections["custom"] = ["launch_task"];
        saveCliToolConfig(cfg, { persistShared: true, persistSession: true });
        process.env["LOWCAL_INSTANCE_ID"] = "instance-b";
        const reloaded = loadCliToolConfig();
        expect(reloaded.collections["custom"]).toEqual(["launch_task"]);
        const sharedRaw = fs.readFileSync(resolveSharedToolConfigPath(), "utf8");
        const sharedConfig = JSON.parse(sharedRaw);
        expect(sharedConfig.collections?.["custom"]).toEqual(["launch_task"]);
    });
});
//# sourceMappingURL=toolConfig.test.js.map