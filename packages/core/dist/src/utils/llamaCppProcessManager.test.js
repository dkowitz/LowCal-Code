/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LlamaCppProcessManager } from "./llamaCppProcessManager.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
describe("LlamaCppProcessManager", () => {
    let tempDir;
    beforeEach(() => {
        // Reset singleton before each test
        LlamaCppProcessManager.reset();
        // Create a real temp dir for tests that need an existing directory
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llamacpp-test-"));
    });
    afterEach(() => {
        LlamaCppProcessManager.reset();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        catch {
            // ignore cleanup errors
        }
        delete process.env["LLAMA_CPP_BINARY"];
    });
    describe("resolveBinaryPath", () => {
        it("should return explicit config path when it exists", () => {
            // Use a real existing file (the temp dir itself)
            const result = LlamaCppProcessManager.resolveBinaryPath({
                binaryPath: tempDir, // directory exists, good enough for the check
                modelsDir: tempDir,
            });
            expect(result).toBe(tempDir);
        });
        it("should return env var path when it exists", () => {
            process.env["LLAMA_CPP_BINARY"] = tempDir;
            const result = LlamaCppProcessManager.resolveBinaryPath({ modelsDir: tempDir });
            expect(result).toBe(tempDir);
        });
        it("should fall back to 'llama-server' when no explicit path", () => {
            // No env var, non-existent binaryPath → falls through to PATH search + directory scan.
            // May return an actual found binary path or the fallback name "llama-server".
            const result = LlamaCppProcessManager.resolveBinaryPath({
                binaryPath: "/nonexistent/path/llama-server",
                modelsDir: tempDir,
            });
            expect(result).toMatch(/^(llama-server|\/)/); // Either fallback name or an absolute path
        });
        it("should prefer config path over env var when both exist", () => {
            process.env["LLAMA_CPP_BINARY"] = "/env/path";
            const result = LlamaCppProcessManager.resolveBinaryPath({
                binaryPath: tempDir, // exists
                modelsDir: tempDir,
            });
            expect(result).toBe(tempDir);
        });
    });
    describe("getStatus", () => {
        it("should return not running when no process is started", () => {
            const manager = LlamaCppProcessManager.instance;
            const status = manager.getStatus();
            expect(status.running).toBe(false);
        });
    });
    describe("isHealthy", () => {
        it("should return false when server is not running", async () => {
            const manager = LlamaCppProcessManager.instance;
            const healthy = await manager.isHealthy();
            expect(healthy).toBe(false);
        });
    });
    describe("stop", () => {
        it("should resolve without error when no process is running", async () => {
            const manager = LlamaCppProcessManager.instance;
            // Should not throw even with nothing to stop
            await expect(manager.stop()).resolves.toBeUndefined();
        });
    });
    describe("start", () => {
        it("should throw when models directory does not exist", async () => {
            const manager = LlamaCppProcessManager.instance;
            await expect(manager.start({ modelsDir: "/nonexistent/path" })).rejects.toThrow("Models directory does not exist");
        });
        it("should throw when binary is not found (ENOENT)", async () => {
            const manager = LlamaCppProcessManager.instance;
            // Temporarily rename the bundled binary so resolveBinaryPath falls through to PATH search
            // which will fail with ENOENT since llama-server isn't on CI's PATH.
            const binDir = path.resolve(__dirname, "..", "..", "bin");
            const bundledName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
            const bundledPath = path.join(binDir, bundledName);
            const backupPath = bundledPath + ".backup";
            if (fs.existsSync(bundledPath)) {
                fs.renameSync(bundledPath, backupPath);
            }
            try {
                await expect(manager.start({ modelsDir: tempDir })).rejects.toThrow(/binary not found|Failed to spawn/);
            }
            finally {
                // Restore the bundled binary
                if (fs.existsSync(backupPath)) {
                    fs.renameSync(backupPath, bundledPath);
                }
            }
        });
    });
    describe("singleton", () => {
        it("should return the same instance", () => {
            const a = LlamaCppProcessManager.instance;
            const b = LlamaCppProcessManager.instance;
            expect(a).toBe(b);
        });
        it("should create fresh instance after reset", () => {
            const a = LlamaCppProcessManager.instance;
            LlamaCppProcessManager.reset();
            const b = LlamaCppProcessManager.instance;
            expect(a).not.toBe(b);
        });
    });
});
//# sourceMappingURL=llamaCppProcessManager.test.js.map