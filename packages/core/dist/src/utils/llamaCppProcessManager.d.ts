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
    /** Optional total (e.g., total context tokens for processing, or max tokens for generating). */
    total?: number;
    /** Optional tokens per second (generation). */
    tokensPerSec?: number;
    /** Human-readable message from llama-server stderr */
    message?: string;
}
export type LlamaCppInferenceCallback = (event: LlamaCppInferenceProgress) => void;
/**
 * Manages the lifecycle of a llama.cpp server (llama-server) child process.
 *
 * Responsibilities:
 * - Spawn `llama-server` with configured options
 * - Monitor health via HTTP /models endpoint
 * - Graceful shutdown on signal/exit
 * - Restart support for model switches
 */
export declare class LlamaCppProcessManager {
    private serverProcess;
    private config;
    private healthCheckTimer;
    private startupTimeout;
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
    /** Singleton instance — only one server per process */
    static instance: LlamaCppProcessManager;
    /** Resolve with a fresh instance (for testing) */
    static reset(): void;
    private constructor();
    /**
     * Resolve the path to the llama-server binary.
     * Checks in order: explicit config → LLAMA_CPP_BINARY env var → bundled binary → PATH search.
     */
    static resolveBinaryPath(config?: LlamaCppServerConfig): string;
    /**
     * Start the llama.cpp server with the given configuration.
     * Returns a promise that resolves when the server is healthy and responding.
     */
    start(config: LlamaCppServerConfig, onProgress?: LlamaCppProgressCallback, onInference?: LlamaCppInferenceCallback): Promise<void>;
    /**
     * Stop the llama.cpp server gracefully.
     */
    stop(): Promise<void>;
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
    private isProcessAlive;
    private startHealthCheck;
    private clearHealthCheck;
    private clearStartupTimeout;
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
