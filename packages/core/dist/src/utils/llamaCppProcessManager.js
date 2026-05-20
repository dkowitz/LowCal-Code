/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
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
const MAX_AUTO_RESTARTS = 3; // Prevent infinite crash loops
const PORT_FREE_TIMEOUT_MS = 10_000; // Max time to wait for port to be free
const PORT_FREE_POLL_MS = 500; // How often to check if port is free
// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------
/** Events emitted by LlamaCppProcessManager during server lifecycle. */
export var LlamaCppLifecycleEvent;
(function (LlamaCppLifecycleEvent) {
    /** Server crashed unexpectedly — payload is the crash error string. */
    LlamaCppLifecycleEvent["CRASHED"] = "crashed";
    /** Server is being restarted automatically — payload is restart attempt number. */
    LlamaCppLifecycleEvent["RESTARTING"] = "restarting";
    /** Server became healthy after startup or restart — payload is elapsed ms. */
    LlamaCppLifecycleEvent["HEALTHY"] = "healthy";
    /** Server was stopped intentionally — payload is the stop reason. */
    LlamaCppLifecycleEvent["STOPPED"] = "stopped";
})(LlamaCppLifecycleEvent || (LlamaCppLifecycleEvent = {}));
/**
 * Manages the lifecycle of a llama.cpp server (llama-server) child process.
 *
 * Responsibilities:
 * - Spawn `llama-server` with configured options
 * - Monitor health via HTTP /models endpoint (continuous after startup)
 * - Graceful shutdown on signal/exit
 * - Automatic crash recovery with configurable max restarts
 * - Safe model hot-swap with rollback on failure
 * - Port race prevention with verification loop
 */
export class LlamaCppProcessManager {
    serverProcess = null;
    config = null;
    previousConfig = null; // For hot-swap rollback
    healthCheckTimer = null;
    _startupTimeout = null;
    _startupPromise = null;
    _startupResolve = null;
    _startupReject = null;
    _progressCallback = null;
    _inferenceCallback = null;
    _startTime = 0;
    _startupComplete = false;
    /** Buffer for post-startup stderr, used for inference progress parsing. */
    _stderrBuffer = "";
    /** Track cumulative token generation per slot to show running count instead of batches. */
    _genSlotId = null;
    _genCumulative = 0;
    _genLastDecoded = 0;
    // -- Crash recovery state --
    _autoRestartCount = 0;
    _isStopping = false; // True during intentional stop to prevent auto-restart
    _isRestarting = false; // True during hot-swap to prevent auto-restart
    // -- Event emitter for lifecycle events --
    _emitter = new EventEmitter();
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
    // ---------------------------------------------------------------------------
    // Event emitter API
    // ---------------------------------------------------------------------------
    /** Subscribe to lifecycle events. Returns an unsubscribe function. */
    on(event, callback) {
        this._emitter.on(event, callback);
        return () => this._emitter.off(event, callback);
    }
    /** Subscribe to all lifecycle events. Returns an unsubscribe function. */
    onAll(callback) {
        this._emitter.on("all", (ev, payload) => callback(ev, payload));
        return () => this._emitter.off("all", callback);
    }
    _emit(event, payload) {
        try {
            this._emitter.emit(event, payload);
            this._emitter.emit("all", event, payload);
        }
        catch {
            // Don't crash if event handlers throw
        }
    }
    /**
     * Force the OpenAI client to be rebuilt on next request.
     * Call this after a server restart so stale connection pools are discarded.
     */
    invalidateClientCache() {
        // Signal that the client needs rebuilding — the provider checks this flag
        this._clientInvalidated = true;
    }
    /** Check if the client cache has been invalidated and clear the flag. */
    wasClientInvalidated() {
        const val = this._clientInvalidated === true;
        this._clientInvalidated = false;
        return val;
    }
    // ---------------------------------------------------------------------------
    // Binary resolution
    // ---------------------------------------------------------------------------
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
    // ---------------------------------------------------------------------------
    // Port management
    // ---------------------------------------------------------------------------
    /**
     * Wait until the given TCP port is free (no listener). Returns true if port
     * became free within the timeout, false otherwise.
     */
    async _waitForPortFree(port) {
        const deadline = Date.now() + PORT_FREE_TIMEOUT_MS;
        while (Date.now() < deadline) {
            try {
                const output = await this._checkPortOccupied(port);
                if (!output)
                    return true; // port is free
            }
            catch {
                // Check failed — assume port is free and proceed
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, PORT_FREE_POLL_MS));
        }
        return false;
    }
    /**
     * Check if anything is listening on the given port. Returns empty string if free,
     * or a description of what's occupying it if not.
     */
    async _checkPortOccupied(port) {
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
                    return ""; // Neither tool available — assume free
                }
            }
            const pids = output
                .split("\n")
                .map((s) => s.trim())
                .filter((s) => /^\d+$/.test(s));
            if (pids.length > 0) {
                return `PIDs: ${pids.join(", ")}`;
            }
            return "";
        }
        catch {
            return "";
        }
    }
    // ---------------------------------------------------------------------------
    // Server start
    // ---------------------------------------------------------------------------
    /**
     * Start the llama.cpp server with the given configuration.
     * Returns a promise that resolves when the server is healthy and responding.
     *
     * If a server is already running, returns immediately (idempotent).
     * If called during an active start, waits for that start to complete.
     */
    async start(config, onProgress, onInference) {
        // If already running with same or different config, return existing promise
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
        // P4: Verify port is actually free before spawning — prevents EADDRINUSE races
        const portFree = await this._waitForPortFree(port);
        if (!portFree) {
            throw new Error(`Port ${port} could not be freed within ${PORT_FREE_TIMEOUT_MS / 1000}s. ` +
                "Another process may be holding it. Try a different LLAMA_CPP_PORT.");
        }
        // Build command arguments
        const args = ["--host", "0.0.0.0", "--port", String(port), "-lv", "3"];
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
            args.push("-fa", "auto");
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
        if (config.temperature !== undefined) {
            args.push("--temperature", String(config.temperature));
        }
        if (config.topP !== undefined) {
            args.push("--top-p", String(config.topP));
        }
        if (config.repeatPenalty !== undefined) {
            args.push("--repeat-penalty", String(config.repeatPenalty));
        }
        // Speculative decoding (e.g., MTP)
        if (config.specType) {
            args.push("--spec-type", config.specType);
        }
        if (config.specDraftNMax !== undefined) {
            args.push("--spec-draft-n-max", String(config.specDraftNMax));
        }
        // Create startup promise
        this._startTime = Date.now();
        this._progressCallback = onProgress ?? null;
        this._inferenceCallback = onInference ?? null;
        this._startupComplete = false;
        this._stderrBuffer = "";
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
        // Capture stderr for progress tracking (startup) and inference progress
        let lastProgressEmit = 0;
        if (thisProcess.stderr) {
            thisProcess.stderr.on("data", (chunk) => {
                const text = chunk.toString();
                this._stderrBuffer += text;
                const now = Date.now();
                if (!this._startupComplete && now - lastProgressEmit > 2000) {
                    // Startup phase: emit loading progress
                    lastProgressEmit = now;
                    const progressMsg = text.trim().split("\n").pop()?.trim();
                    this._progressCallback?.({
                        phase: "waiting",
                        elapsedMs: now - this._startTime,
                        message: progressMsg || "Loading model...",
                    });
                }
                else if (this._startupComplete && this._inferenceCallback) {
                    // Inference phase: parse progress messages from stderr
                    const inferenceEvent = this._parseInferenceProgress(text, now);
                    if (inferenceEvent) {
                        this._inferenceCallback(inferenceEvent);
                    }
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
        // Handle process exit — this is the critical hook for crash recovery
        thisProcess.on("exit", (code, signal) => {
            if (this.serverProcess !== thisProcess)
                return;
            // If we're intentionally stopping or restarting, don't auto-recover
            if (this._isStopping || this._isRestarting) {
                this._onProcessExitClean();
                return;
            }
            // Server crashed unexpectedly — attempt auto-restart
            this._handleCrash(code, signal);
        });
        // Set startup timeout
        this._startupTimeout = setTimeout(() => {
            if (this._startupReject) {
                this._startupReject(new Error(`llama-server did not become healthy within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
                    "The model may be too large for available memory."));
                this._startupReject = null;
            }
        }, STARTUP_TIMEOUT_MS);
        // Start health checks (continuous — never cleared after startup)
        this.startHealthCheck(port);
        return this._startupPromise;
    }
    /**
     * Handle an unexpected process crash. Attempts auto-restart up to MAX_AUTO_RESTARTS times.
     */
    _handleCrash(code, signal) {
        // Clean up startup state
        this._onProcessExitClean();
        // If we have no config (never started successfully), just give up
        if (!this.config)
            return;
        // Check restart budget
        if (this._autoRestartCount >= MAX_AUTO_RESTARTS) {
            this._emit(LlamaCppLifecycleEvent.CRASHED, `Server crashed ${this._autoRestartCount} times — giving up. Exit code: ${code}, signal: ${signal}`);
            this._autoRestartCount = 0; // Reset for next manual start
            return;
        }
        this._autoRestartCount++;
        const attempt = this._autoRestartCount;
        this._emit(LlamaCppLifecycleEvent.CRASHED, `Server crashed (exit ${code}, signal ${signal}). Restarting... (${attempt}/${MAX_AUTO_RESTARTS})`);
        this._emit(LlamaCppLifecycleEvent.RESTARTING, attempt);
        // Brief pause before restart to avoid rapid crash loops
        setTimeout(() => {
            if (!this.config)
                return; // No config to restart with
            this._isRestarting = true;
            this.start(this.config, this._progressCallback ?? undefined, this._inferenceCallback ?? undefined)
                .then(() => {
                this._autoRestartCount = 0; // Reset on successful restart
            })
                .catch((err) => {
                this._emit(LlamaCppLifecycleEvent.CRASHED, `Auto-restart ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
            })
                .finally(() => {
                this._isRestarting = false;
            });
        }, 2000); // 2-second cooldown between restarts
    }
    /**
     * Clean up startup state when process exits (used by both crash and clean paths).
     */
    _onProcessExitClean() {
        this.clearStartupTimeout();
        this.clearHealthCheck();
        if (this._startupReject) {
            this._startupReject(new Error(`Server exited with code ${this.serverProcess ? "unknown" : "null"}`));
            this._startupReject = null;
        }
        this._startupPromise = null;
    }
    // ---------------------------------------------------------------------------
    // Server stop
    // ---------------------------------------------------------------------------
    /**
     * Stop the llama.cpp server gracefully.
     * @param reason Optional reason for logging purposes.
     */
    async stop(reason = "explicit") {
        this._isStopping = true;
        try {
            this.clearStartupTimeout();
            this.clearHealthCheck();
            if (!this.serverProcess)
                return;
            const pid = this.serverProcess.pid;
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
            if (this.isProcessAlive(this.serverProcess)) {
                try {
                    if (pid != null)
                        process.kill(pid, "SIGKILL");
                }
                catch {
                    // Already dead — that's fine
                }
            }
            this.serverProcess = null;
            this._autoRestartCount = 0;
            // Reset startup state
            if (this._startupReject) {
                this._startupReject(new Error("Server stopped"));
                this._startupReject = null;
            }
            this._startupPromise = null;
            this._stderrBuffer = "";
            this._emit(LlamaCppLifecycleEvent.STOPPED, reason);
        }
        finally {
            this._isStopping = false;
        }
    }
    // ---------------------------------------------------------------------------
    // Model hot-swap with safety net (P3)
    // ---------------------------------------------------------------------------
    /**
     * Hot-swap the running model. Saves previous config and rolls back on failure.
     * This is the safe way to switch models mid-session.
     */
    async swapModel(newConfig, onProgress, onInference) {
        // Save current config for rollback
        this.previousConfig = this.config ? { ...this.config } : null;
        // Mark as restarting to prevent auto-restart from triggering during swap
        this._isRestarting = true;
        try {
            // Stop the old server before starting the new one
            await this.stop("model-swap");
            // Start the new server
            await this.start(newConfig, onProgress, onInference);
            // Invalidate the OpenAI client cache so stale sockets are discarded
            this.invalidateClientCache();
            // Success — clear previous config
            this.previousConfig = null;
        }
        catch (err) {
            // Hot-swap failed — attempt rollback
            if (this.previousConfig) {
                console.error(`[llama.cpp] Model swap failed: ${err instanceof Error ? err.message : String(err)}. Rolling back to previous model...`);
                try {
                    await this.start(this.previousConfig, onProgress, onInference);
                    console.error("[llama.cpp] Rollback successful.");
                }
                catch (rollbackErr) {
                    console.error(`[llama.cpp] Rollback also failed: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. Server is in an unknown state.`);
                    throw new Error(`Model swap failed and rollback failed. Original error: ${err instanceof Error ? err.message : String(err)}. ` +
                        `Rollback error: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}. ` +
                        "You may need to restart LowCal.");
                }
            }
            else {
                throw err;
            }
        }
        finally {
            this._isRestarting = false;
        }
    }
    // ---------------------------------------------------------------------------
    // Status & health
    // ---------------------------------------------------------------------------
    /**
     * Clear the inference callback — call this when the UI unmounts or a
     * new inference session begins so stale callbacks don't fire for old requests.
     */
    clearInferenceCallback() {
        this._inferenceCallback = null;
        // Reset generation tracking — new inference session starts fresh
        this._genSlotId = null;
        this._genCumulative = 0;
        this._genLastDecoded = 0;
    }
    /**
     * Set the inference progress callback. This replaces the direct field write
     * that was previously needed in App.tsx, maintaining the same API surface.
     */
    setInferenceCallback(callback) {
        this._inferenceCallback = callback;
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
    // ---------------------------------------------------------------------------
    // Health check (continuous monitoring — P1)
    // ---------------------------------------------------------------------------
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
                    // P1: Do NOT clear the health check timer — keep monitoring continuously
                    this._startupResolve();
                    this._startupResolve = null;
                }
                else if (!resp.ok && this._startupComplete) {
                    // Post-startup health check failed — server crashed after being healthy
                    // The process exit handler will catch the actual exit, but this gives us
                    // an early warning before the OS notifies us.
                    // We don't do anything here — the exit event is the authoritative signal.
                }
            }
            catch {
                // Still waiting for server to be ready, or server is down
                // If we're past startup and the server was healthy, this is a crash indicator
                if (this._startupComplete) {
                    // Health check failed post-startup — the process exit handler will handle it
                    // but we also invalidate the client cache so stale connections are discarded
                    this.invalidateClientCache();
                }
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
        if (this._startupTimeout) {
            clearTimeout(this._startupTimeout);
            this._startupTimeout = null;
        }
    }
    // ---------------------------------------------------------------------------
    // Process helpers
    // ---------------------------------------------------------------------------
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
    // ---------------------------------------------------------------------------
    // Inference progress parsing
    // ---------------------------------------------------------------------------
    /**
     * Parse llama-server stderr lines for inference progress.
     *
     * llama-server at log level 2 emits patterns like:
     *   "llm_load_tensors:     100.00%" — KV cache load / model loading (already handled during startup)
     *   "sampling:             prompt eval processing   x / x tokens (xx%)" — context encoding
     *   "sampling:           generate n tok tensor   x / x = x.xx tok/s" — generation
     *
     * We look for these lines and emit LlamaCppInferenceProgress events so the UI
     * can display "Processing xx%" and "Generating xx tok" like LM Studio.
     */
    _parseInferenceProgress(text, _now) {
        // Process each line independently
        const lines = text.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            // Pattern: "prompt processing, n_tokens = 4096, progress = 0.XX" (progress=1.00 = 100%)
            const promptMatch = trimmed.match(/prompt processing, n_tokens\s*=\s*(\d+), progress\s*=\s*([\d.]+)/);
            if (promptMatch) {
                const total = parseInt(promptMatch[1], 10);
                const progress = parseFloat(promptMatch[2]);
                const pct = Math.min(100, Math.round(progress * 100));
                return {
                    phase: "processing",
                    value: pct,
                    total,
                    message: `Processing ${pct}%`,
                };
            }
            // Pattern: "slot print_timing: id  2 | task 202 | n_decoded =    100, tg =  63.44    t/s" (token generation)
            // Be permissive about prefixes (timestamps), spacing, and allow a fallback without explicit slot id.
            const genMatch = trimmed.match(/id\s+(\d+)[^\n]*n_decoded\s*=\s*(\d+),\s*tg\s*=\s*([\d.]+)\s*t\/s/);
            const genFallback = genMatch
                ? null
                : trimmed.match(/n_decoded\s*=\s*(\d+),\s*tg\s*=\s*([\d.]+)\s*t\/s/);
            const genHit = genMatch ?? genFallback;
            if (genHit) {
                const slotId = genMatch
                    ? parseInt(genMatch[1], 10)
                    : this._genSlotId ?? 0; // fallback: reuse last slot when id missing
                const nDecoded = parseInt(genMatch ? genMatch[2] : genFallback[1], 10);
                const tokensPerSec = parseFloat(genMatch ? genMatch[3] : genFallback[2]);
                // Reset tracking if this is a new slot (inference session)
                if (this._genSlotId !== slotId) {
                    this._genSlotId = slotId;
                    this._genCumulative = 0;
                    this._genLastDecoded = 0;
                }
                // n_decoded reports in batches (e.g., 100, 200...). Detect wrap by checking
                // if current value < last (indicates new batch started or new session)
                if (nDecoded < this._genLastDecoded) {
                    // Batch wrap — add previous cumulative to reset for new batch
                    this._genCumulative = 0;
                }
                // Accumulate incremental change
                const increment = this._genLastDecoded === 0
                    ? nDecoded // First report — use as-is
                    : nDecoded - this._genLastDecoded; // Subsequent — use delta
                this._genCumulative += increment;
                this._genLastDecoded = nDecoded;
                return {
                    phase: "generating",
                    value: this._genCumulative,
                    tokensPerSec,
                    message: `Generating ${this._genCumulative} tok`,
                };
            }
        }
        return null;
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