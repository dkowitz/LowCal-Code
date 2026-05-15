/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
/** Get the directory of this module at runtime (ESM-compatible) */
function getModuleDir() {
    return path.dirname(fileURLToPath(import.meta.url));
}
/**
 * Resolve the directory containing the bundled llama.cpp binary.
 * Works in both development (source tree) and bundled contexts.
 */
function getBundledBinDir() {
    const moduleDir = getModuleDir();
    const candidates = [
        path.resolve(moduleDir, "..", "..", "bin"),
        path.resolve(moduleDir, "..", "..", "..", "bin"),
        path.resolve(moduleDir, "..", "packages", "core", "bin"),
        path.resolve(moduleDir, "packages", "core", "bin"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}
const DEFAULT_PORT = 8080;
const HEALTH_CHECK_INTERVAL_MS = 2000;
const STARTUP_TIMEOUT_MS = 600_000; // 10 minutes — large models on CPU can take several minutes to load
const HEALTH_CHECK_URL_PATH = "/models";
/**
 * Manages the lifecycle of a llama.cpp server (llama-server) child process.
 *
 * Responsibilities:
 * - Spawn `llama-server` with configured options
 * - Monitor health via HTTP /models endpoint
 * - Graceful shutdown on signal/exit
 * - Restart support for model switches
 */
export class LlamaCppProcessManager {
    serverProcess = null;
    config = null;
    healthCheckTimer = null;
    startupTimeout = null;
    _startupPromise = null;
    _startupResolve = null;
    _startupReject = null;
    _progressCallback = null;
    _startTime = 0;
    _startupComplete = false;
    /** Singleton instance — only one server per process */
    static instance = new LlamaCppProcessManager();
    /** Resolve with a fresh instance (for testing) */
    static reset() {
        this.instance.stop().catch(() => { });
        process.setMaxListeners(Math.max(process.getMaxListeners(), 25));
        this.instance = new LlamaCppProcessManager();
    }
    constructor() {
        const handleSignal = () => this.stop();
        process.on("SIGTERM", handleSignal);
        process.on("SIGINT", handleSignal);
        process.on("exit", handleSignal);
        process.on("uncaughtException", handleSignal);
    }
    /**
     * Resolve the path to the llama-server binary.
     * Checks in order: explicit config → LLAMA_CPP_BINARY env var → bundled binary → PATH search.
     */
    static resolveBinaryPath(config) {
        if (config?.binaryPath && fs.existsSync(config.binaryPath)) {
            return config.binaryPath;
        }
        const envBinary = process.env["LLAMA_CPP_BINARY"];
        if (envBinary && fs.existsSync(envBinary)) {
            return envBinary;
        }
        const bundledDir = getBundledBinDir();
        const bundledName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
        const bundledPath = path.join(bundledDir, bundledName);
        if (fs.existsSync(bundledPath)) {
            return bundledPath;
        }
        const pathDirs = (process.env["PATH"] || "").split(path.delimiter);
        for (const dir of pathDirs) {
            const candidate = path.join(dir, "llama-server");
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            const candidateWithExt = path.join(dir, `llama-server${process.platform === "win32" ? ".exe" : ""}`);
            if (fs.existsSync(candidateWithExt)) {
                return candidateWithExt;
            }
        }
        return "llama-server";
    }
    /**
     * Start the llama.cpp server with the given configuration.
     * Returns a promise that resolves when the server is healthy and responding.
     */
    async start(config, onProgress) {
        // Stop our own tracked server if alive
        if (this.serverProcess && this.isProcessAlive(this.serverProcess)) {
            return this._startupPromise ?? Promise.resolve();
        }
        const binaryPath = LlamaCppProcessManager.resolveBinaryPath(config);
        if (!fs.existsSync(config.modelsDir) || !fs.statSync(config.modelsDir).isDirectory()) {
            throw new Error(`Models directory does not exist or is not a directory: ${config.modelsDir}`);
        }
        this.config = config;
        const port = config.port ?? DEFAULT_PORT;
        // Kill any stale llama-server occupying the target port (from a previous session)
        await _killPortOccupants(port);
        // Build command arguments
        const args = ["--host", "127.0.0.1", "--port", String(port)];
        if (config.nGpuLayers !== undefined)
            args.push("--n-gpu-layers", String(config.nGpuLayers));
        if (config.nCtx !== undefined)
            args.push("--ctx-size", String(config.nCtx));
        if (config.nThreads !== undefined)
            args.push("--threads", String(config.nThreads));
        if (config.nThreadsBatch !== undefined)
            args.push("--threads-batch", String(config.nThreadsBatch));
        if (config.nBatch !== undefined)
            args.push("--batch-size", String(config.nBatch));
        if (config.nUBatch !== undefined)
            args.push("--ubatch-size", String(config.nUBatch));
        if (config.flashAttn)
            args.push("-fa");
        if (config.modelPath) {
            const resolvedModel = path.isAbsolute(config.modelPath)
                ? config.modelPath
                : path.join(config.modelsDir, config.modelPath);
            args.push("--model", resolvedModel);
        }
        if (config.kvCacheType && config.kvCacheType !== "none") {
            args.push("--cache-type-k", config.kvCacheType);
            args.push("--cache-type-v", config.kvCacheType);
        }
        // Create startup promise
        this._startTime = Date.now();
        this._progressCallback = onProgress ?? null;
        this._startupComplete = false;
        this._startupPromise = new Promise((resolve, reject) => {
            this._startupResolve = resolve;
            this._startupReject = reject;
        });
        // Emit initial spawning progress
        this._progressCallback?.({ phase: "spawning", elapsedMs: 0, message: "Starting llama-server..." });
        // Determine if we're using the bundled binary (needs LD_LIBRARY_PATH)
        const binDir = getBundledBinDir();
        const isBundled = binaryPath.startsWith(binDir);
        // Spawn the server process
        try {
            const spawnOpts = {
                stdio: ["ignore", "pipe", "pipe"],
                detached: false,
            };
            if (isBundled) {
                spawnOpts.env = {
                    ...process.env,
                    ["LD_LIBRARY_PATH"]: binDir + (process.env["LD_LIBRARY_PATH"] ? `:${process.env["LD_LIBRARY_PATH"]}` : ""),
                };
            }
            this.serverProcess = spawn(binaryPath, args, spawnOpts);
        }
        catch (err) {
            if (this._startupReject) {
                this._startupReject(new Error(`Failed to spawn llama-server: ${err instanceof Error ? err.message : String(err)}`));
                this._startupReject = null;
            }
            throw new Error(`llama-server binary not found at: ${binaryPath}. Install llama.cpp or set LLAMA_CPP_BINARY env var.\n` +
                "See: https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md");
        }
        // Track THIS process so stale exit/error handlers from old processes don't clobber new state
        const thisProcess = this.serverProcess;
        // Capture stderr for progress tracking (no verbose logging)
        let stderrBuffer = "";
        let lastProgressEmit = 0;
        if (thisProcess.stderr) {
            thisProcess.stderr.on("data", (chunk) => {
                stderrBuffer += chunk.toString();
                const now = Date.now();
                // Only emit progress events during startup, not after
                if (now - lastProgressEmit > 2000 && !this._startupComplete) {
                    lastProgressEmit = now;
                    const text = chunk.toString().trim();
                    const progressMsg = text.split("\n").pop()?.trim();
                    this._progressCallback?.({
                        phase: "waiting",
                        elapsedMs: now - this._startTime,
                        message: progressMsg || "Loading model...",
                    });
                }
            });
        }
        // Handle spawn errors
        thisProcess.on("error", (err) => {
            if (this.serverProcess !== thisProcess)
                return;
            if (this._startupReject) {
                const msg = err.code === "ENOENT"
                    ? `llama-server binary not found. Install llama.cpp or set LLAMA_CPP_BINARY env var.\nSee: https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md`
                    : `Failed to spawn llama-server: ${err.message}`;
                this._startupReject(new Error(msg));
                this._startupReject = null;
            }
            this.clearStartupTimeout();
        });
        // Handle process exit
        thisProcess.on("exit", (code, signal) => {
            if (this.serverProcess !== thisProcess)
                return;
            if (this._startupReject) {
                this._startupReject(new Error(`llama-server exited during startup with code ${code} (${signal}).\n` +
                    `Server output: ${stderrBuffer.slice(-500)}`));
                this._startupReject = null;
            }
            this.clearStartupTimeout();
            this.clearHealthCheck();
        });
        // Set startup timeout
        this.startupTimeout = setTimeout(() => {
            if (this._startupReject) {
                this._startupReject(new Error(`llama-server did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
                    "The model may be too large for available memory."));
                this._startupReject = null;
            }
        }, STARTUP_TIMEOUT_MS);
        // Start health checks
        this.startHealthCheck(port);
        return this._startupPromise;
    }
    /**
     * Stop the llama.cpp server gracefully.
     */
    async stop() {
        this.clearStartupTimeout();
        this.clearHealthCheck();
        if (!this.serverProcess)
            return;
        const pid = this.serverProcess.pid;
        this.serverProcess = null;
        // Try graceful shutdown first (SIGTERM)
        try {
            if (pid != null)
                process.kill(pid, "SIGTERM");
        }
        catch {
            // Process already dead
        }
        // Wait briefly for graceful exit, then force kill
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (this.serverProcess && this.isProcessAlive(this.serverProcess)) {
            try {
                if (pid != null)
                    process.kill(pid, "SIGKILL");
            }
            catch {
                // Already dead — that's fine
            }
        }
        // Reset startup state
        if (this._startupReject) {
            this._startupReject(new Error("Server stopped"));
            this._startupReject = null;
        }
        this._startupPromise = null;
    }
    /**
     * Get the current server status.
     */
    getStatus() {
        if (!this.serverProcess || !this.isProcessAlive(this.serverProcess)) {
            return { running: false };
        }
        const port = this.config?.port ?? DEFAULT_PORT;
        return {
            running: true,
            pid: this.serverProcess.pid,
            baseUrl: `http://127.0.0.1:${port}/v1`,
        };
    }
    /**
     * Get the base URL for API calls (e.g., http://127.0.0.1:8080/v1).
     */
    getBaseUrl() {
        const status = this.getStatus();
        return status.baseUrl;
    }
    /**
     * Check if the server is currently running and healthy.
     */
    async isHealthy() {
        const baseUrl = this.getBaseUrl();
        if (!baseUrl)
            return false;
        try {
            const resp = await fetch(`${baseUrl}${HEALTH_CHECK_URL_PATH}`, {
                signal: AbortSignal.timeout(5000),
            });
            return resp.ok;
        }
        catch {
            return false;
        }
    }
    // -- Private helpers --
    isProcessAlive(proc) {
        if (!proc.pid)
            return false;
        try {
            process.kill(proc.pid, 0); // Signal 0 checks existence without killing
            return true;
        }
        catch {
            return false;
        }
    }
    startHealthCheck(port) {
        this.clearHealthCheck();
        this.healthCheckTimer = setInterval(async () => {
            const baseUrl = `http://127.0.0.1:${port}/v1`;
            try {
                const resp = await fetch(`${baseUrl}${HEALTH_CHECK_URL_PATH}`, {
                    signal: AbortSignal.timeout(5000),
                });
                if (resp.ok && this._startupResolve) {
                    // Server is healthy — mark startup complete, emit final progress, and resolve
                    this._startupComplete = true;
                    this._progressCallback?.({
                        phase: "healthy",
                        elapsedMs: Date.now() - this._startTime,
                        message: "Model loaded successfully!",
                    });
                    this.clearStartupTimeout();
                    this.clearHealthCheck();
                    this._startupResolve();
                    this._startupResolve = null;
                }
            }
            catch {
                // Still waiting for server to be ready
            }
        }, HEALTH_CHECK_INTERVAL_MS);
    }
    clearHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    clearStartupTimeout() {
        if (this.startupTimeout) {
            clearTimeout(this.startupTimeout);
            this.startupTimeout = null;
        }
    }
}
/** Convenience accessor for the singleton */
export const llamaCppProcessManager = LlamaCppProcessManager.instance;
// ---------------------------------------------------------------------------
// Port occupant cleanup
// ---------------------------------------------------------------------------
/**
 * Kill any process listening on the given TCP port.
 * Uses `ss` (Linux) or `lsof` (macOS) to find the PID, then SIGTERM it.
 * This handles stale llama-server instances from previous sessions that the
 * singleton doesn't know about.
 */
async function _killPortOccupants(port) {
    try {
        const { execSync } = await import("node:child_process");
        let output;
        try {
            output = execSync(`ss -tlnp "sport = :${port}" 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | sort -u`, { encoding: "utf-8", timeout: 3000 });
        }
        catch {
            try {
                output = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: "utf-8", timeout: 3000 });
            }
            catch {
                return; // neither tool available — give up
            }
        }
        const pids = output
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s));
        for (const pid of pids) {
            try {
                process.kill(Number(pid), "SIGTERM");
            }
            catch {
                // already dead or not ours
            }
        }
        // Give processes time to wind down
        if (pids.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    catch {
        // best effort — don't crash if port kill fails
    }
}
//# sourceMappingURL=llamaCppProcessManager.js.map