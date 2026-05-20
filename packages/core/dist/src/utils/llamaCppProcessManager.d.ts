/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Configuration for starting the llama.cpp server process.
 */
export interface LlamaCppServerConfig {
    binaryPath?: string;
    modelsDir: string;
    port?: number;
    nGpuLayers?: number;
    nCtx?: number;
    nThreads?: number;
    nThreadsBatch?: number;
    nBatch?: number;
    nUBatch?: number;
    flashAttn?: boolean;
    temperature?: number;
    topP?: number;
    repeatPenalty?: number;
    modelPath?: string;
    kvCacheType?: string;
    /** Optional explicit speculative decoding type (e.g., "draft-mtp"). */
    specType?: string;
    /** Optional max draft n for speculative decoding (e.g., 4). */
    specDraftNMax?: number;
}
export interface LlamaCppServerStatus {
    running: boolean;
    pid?: number;
    baseUrl?: string;
    error?: string;
}
/** Progress events emitted during server startup. */
export interface LlamaCppProgressEvent {
    /** Phase of startup: "spawning" | "waiting" | "healthy" */
    phase: string;
    /** Elapsed time in milliseconds */
    elapsedMs: number;
    /** Human-readable status message from stderr output */
    message?: string;
}
export type LlamaCppProgressCallback = (event: LlamaCppProgressEvent) => void;
/**
 * Inference progress event emitted during model inference (prompt evaluation / token generation).
 * Captures the same kind of information LM Studio displays: "Processing xx%" and "Generating xx tok".
 */
export interface LlamaCppInferenceProgress {
    /** "processing" | "generating" */
    phase: "processing" | "generating";
    /** For processing: percentage 0-100. For generating: tokens generated so far. */
    value: number;
    /** Optional total (e.g., total context tokens for processing, or max tokens for generation). */
    total?: number;
    /** Optional tokens per second (generation). */
    tokensPerSec?: number;
    /** Human-readable message from llama-server stderr */
    message?: string;
}
export type LlamaCppInferenceCallback = (event: LlamaCppInferenceProgress) => void;
/** Events emitted by LlamaCppProcessManager during server lifecycle. */
export declare enum LlamaCppLifecycleEvent {
    /** Server crashed unexpectedly — payload is the crash error string. */
    CRASHED = "crashed",
    /** Server is being restarted automatically — payload is restart attempt number. */
    RESTARTING = "restarting",
    /** Server became healthy after startup or restart — payload is elapsed ms. */
    HEALTHY = "healthy",
    /** Server was stopped intentionally — payload is the stop reason. */
    STOPPED = "stopped"
}
export type LlamaCppLifecycleCallback = (event: LlamaCppLifecycleEvent, payload?: unknown) => void;
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
export declare class LlamaCppProcessManager {
    private serverProcess;
    private config;
    private previousConfig;
    private healthCheckTimer;
    private _startupTimeout;
    private _startupPromise;
    private _startupResolve;
    private _startupReject;
    private _progressCallback;
    private _inferenceCallback;
    private _startTime;
    private _startupComplete;
    /** Buffer for post-startup stderr, used for inference progress parsing. */
    private _stderrBuffer;
    /** Track cumulative token generation per slot to show running count instead of batches. */
    private _genSlotId;
    private _genCumulative;
    private _genLastDecoded;
    private _autoRestartCount;
    private _isStopping;
    private _isRestarting;
    private _emitter;
    /** Singleton instance — only one server per process */
    static instance: LlamaCppProcessManager;
    /** Resolve with a fresh instance (for testing) */
    static reset(): void;
    private constructor();
    /** Subscribe to lifecycle events. Returns an unsubscribe function. */
    on(event: LlamaCppLifecycleEvent, callback: LlamaCppLifecycleCallback): () => void;
    /** Subscribe to all lifecycle events. Returns an unsubscribe function. */
    onAll(callback: LlamaCppLifecycleCallback): () => void;
    private _emit;
    /**
     * Force the OpenAI client to be rebuilt on next request.
     * Call this after a server restart so stale connection pools are discarded.
     */
    invalidateClientCache(): void;
    /** Check if the client cache has been invalidated and clear the flag. */
    wasClientInvalidated(): boolean;
    /**
     * Resolve the path to the llama-server binary.
     * Checks in order: explicit config → LLAMA_CPP_BINARY env var → bundled binary → PATH search.
     */
    static resolveBinaryPath(config?: LlamaCppServerConfig): string;
    /**
     * Wait until the given TCP port is free (no listener). Returns true if port
     * became free within the timeout, false otherwise.
     */
    private _waitForPortFree;
    /**
     * Check if anything is listening on the given port. Returns empty string if free,
     * or a description of what's occupying it if not.
     */
    private _checkPortOccupied;
    /**
     * Start the llama.cpp server with the given configuration.
     * Returns a promise that resolves when the server is healthy and responding.
     *
     * If a server is already running, returns immediately (idempotent).
     * If called during an active start, waits for that start to complete.
     */
    start(config: LlamaCppServerConfig, onProgress?: LlamaCppProgressCallback, onInference?: LlamaCppInferenceCallback): Promise<void>;
    /**
     * Handle an unexpected process crash. Attempts auto-restart up to MAX_AUTO_RESTARTS times.
     */
    private _handleCrash;
    /**
     * Clean up startup state when process exits (used by both crash and clean paths).
     */
    private _onProcessExitClean;
    /**
     * Stop the llama.cpp server gracefully.
     * @param reason Optional reason for logging purposes.
     */
    stop(reason?: string): Promise<void>;
    /**
     * Hot-swap the running model. Saves previous config and rolls back on failure.
     * This is the safe way to switch models mid-session.
     */
    swapModel(newConfig: LlamaCppServerConfig, onProgress?: LlamaCppProgressCallback, onInference?: LlamaCppInferenceCallback): Promise<void>;
    /**
     * Clear the inference callback — call this when the UI unmounts or a
     * new inference session begins so stale callbacks don't fire for old requests.
     */
    clearInferenceCallback(): void;
    /**
     * Set the inference progress callback. This replaces the direct field write
     * that was previously needed in App.tsx, maintaining the same API surface.
     */
    setInferenceCallback(callback: LlamaCppInferenceCallback | null): void;
    /**
     * Get the current server status.
     */
    getStatus(): LlamaCppServerStatus;
    /**
     * Get the base URL for API calls (e.g., http://127.0.0.1:8080/v1).
     */
    getBaseUrl(): string | undefined;
    /**
     * Check if the server is currently running and healthy.
     */
    isHealthy(): Promise<boolean>;
    private startHealthCheck;
    private clearHealthCheck;
    private clearStartupTimeout;
    private isProcessAlive;
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
    private _parseInferenceProgress;
}
/** Convenience accessor for the singleton */
export declare const llamaCppProcessManager: LlamaCppProcessManager;
