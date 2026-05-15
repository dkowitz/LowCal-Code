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
    private _startTime;
    private _startupComplete;
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
    start(config: LlamaCppServerConfig, onProgress?: LlamaCppProgressCallback): Promise<void>;
    /**
     * Stop the llama.cpp server gracefully.
     */
    stop(): Promise<void>;
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
}
/** Convenience accessor for the singleton */
export declare const llamaCppProcessManager: LlamaCppProcessManager;
