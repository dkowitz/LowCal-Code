/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
let checkForLlamaCppUpdate;
const realMarker = path.resolve(__dirname, "../../core/bin/.llama-cpp-version");
const realCache = path.resolve(os.homedir(), ".qwen/llama-cpp-update-cache.json");
function cleanupFiles() {
    try {
        fs.unlinkSync(realMarker);
    }
    catch { }
    try {
        fs.unlinkSync(realCache);
    }
    catch { }
}
describe("checkForLlamaCppUpdate", () => {
    beforeEach(async () => {
        cleanupFiles();
        // default platform
        Object.defineProperty(process, "platform", { value: "linux", writable: true, configurable: true });
        Object.defineProperty(process, "arch", { value: "x64", writable: true, configurable: true });
        // default fetch mock
        // @ts-expect-error
        global.fetch = async () => ({
            ok: true,
            json: async () => ({
                tag_name: "b9200",
                html_url: "https://github.com/ggml-org/llama.cpp/releases/tag/b9200",
            }),
        });
        ({ checkForLlamaCppUpdate } = await import("./llamaCppUpdateChecker.js"));
    });
    afterEach(() => {
        cleanupFiles();
    });
    it("should return null when platform is unsupported (linux arm64)", async () => {
        Object.defineProperty(process, "arch", { value: "arm64", writable: true, configurable: true });
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
    it("should return null when no version marker exists", async () => {
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
    it("should return update info when a newer version is available", async () => {
        fs.mkdirSync(path.dirname(realMarker), { recursive: true });
        fs.writeFileSync(realMarker, "b9159");
        const result = await checkForLlamaCppUpdate();
        expect(result).not.toBeNull();
        expect(result?.latestTag).toBe("b9200");
        expect(result?.currentTag).toBe("b9159");
    });
    it("should return null when versions match", async () => {
        fs.mkdirSync(path.dirname(realMarker), { recursive: true });
        fs.writeFileSync(realMarker, "b9200");
        // fetch returns b9200
        // @ts-expect-error
        global.fetch = async () => ({ ok: true, json: async () => ({ tag_name: "b9200", html_url: "" }) });
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
    it("should return null when fetch returns non-OK", async () => {
        // @ts-expect-error
        global.fetch = async () => ({ ok: false, status: 404 });
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
    it("should return null when fetch throws", async () => {
        // @ts-ignore - override fetch for this test
        global.fetch = async () => { throw new Error("Network error"); };
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
    it("should use cache when within 24-hour window", async () => {
        fs.mkdirSync(path.dirname(realMarker), { recursive: true });
        fs.writeFileSync(realMarker, "b9159");
        fs.mkdirSync(path.dirname(realCache), { recursive: true });
        fs.writeFileSync(realCache, JSON.stringify({
            latestTag: "b9200",
            checkedAt: Date.now() - 1000 * 60 * 60, // 1 hour
            platformKey: "linux-x64",
        }));
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
    it("should not use cache when platform key differs", async () => {
        fs.mkdirSync(path.dirname(realMarker), { recursive: true });
        fs.writeFileSync(realMarker, "b9159");
        fs.mkdirSync(path.dirname(realCache), { recursive: true });
        fs.writeFileSync(realCache, JSON.stringify({
            latestTag: "b9200",
            checkedAt: Date.now() - 1,
            platformKey: "darwin-arm64",
        }));
        Object.defineProperty(process, "platform", { value: "darwin", writable: true, configurable: true });
        Object.defineProperty(process, "arch", { value: "x64", writable: true, configurable: true });
        const result = await checkForLlamaCppUpdate();
        expect(result).not.toBeNull();
    });
    it("should return null when cache is fresh and current matches latest", async () => {
        fs.mkdirSync(path.dirname(realMarker), { recursive: true });
        fs.writeFileSync(realMarker, "b9159");
        fs.mkdirSync(path.dirname(realCache), { recursive: true });
        fs.writeFileSync(realCache, JSON.stringify({
            latestTag: "b9159",
            checkedAt: Date.now() - 1000 * 60 * 60,
            platformKey: "linux-x64",
        }));
        const result = await checkForLlamaCppUpdate();
        expect(result).toBeNull();
    });
});
//# sourceMappingURL=llamaCppUpdateChecker.test.js.map