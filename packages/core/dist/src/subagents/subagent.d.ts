/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { PromptConfig, ModelConfig, RunConfig, ToolConfig } from "./types.js";
import { SubagentTerminateMode } from "./types.js";
import { type SubAgentEventEmitter } from "./subagent-events.js";
import { type SubagentStatsSummary } from "./subagent-statistics.js";
import type { SubagentHooks } from "./subagent-hooks.js";
/**
 * @fileoverview Defines the configuration interfaces for a subagent.
 *
 * These interfaces specify the structure for defining the subagent's prompt,
 * the model parameters, and the execution settings.
 */
interface ExecutionStats {
    startTimeMs: number;
    totalDurationMs: number;
    rounds: number;
    totalToolCalls: number;
    successfulToolCalls: number;
    failedToolCalls: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCost?: number;
}
/**
 * Manages the runtime context state for the subagent.
 * This class provides a mechanism to store and retrieve key-value pairs
 * that represent the dynamic state and variables accessible to the subagent
 * during its execution.
 */
export declare class ContextState {
    private state;
    /**
     * Retrieves a value from the context state.
     *
     * @param key - The key of the value to retrieve.
     * @returns The value associated with the key, or undefined if the key is not found.
     */
    get(key: string): unknown;
    /**
     * Sets a value in the context state.
     *
     * @param key - The key to set the value under.
     * @param value - The value to set.
     */
    set(key: string, value: unknown): void;
    /**
     * Retrieves all keys in the context state.
     *
     * @returns An array of all keys in the context state.
     */
    get_keys(): string[];
}
/**
 * Represents the scope and execution environment for a subagent.
 * This class orchestrates the subagent's lifecycle, managing its chat interactions,
 * runtime context, and the collection of its outputs.
 */
export declare class SubAgentScope {
    readonly name: string;
    readonly runtimeContext: Config;
    private readonly promptConfig;
    private readonly modelConfig;
    private readonly runConfig;
    private readonly toolConfig?;
    executionStats: ExecutionStats;
    private toolUsage;
    private eventEmitter?;
    private finalText;
    private terminateMode;
    private readonly stats;
    private hooks?;
    private readonly subagentId;
    /**
     * Constructs a new SubAgentScope instance.
     * @param name - The name for the subagent, used for logging and identification.
     * @param runtimeContext - The shared runtime configuration and services.
     * @param promptConfig - Configuration for the subagent's prompt and behavior.
     * @param modelConfig - Configuration for the generative model parameters.
     * @param runConfig - Configuration for the subagent's execution environment.
     * @param toolConfig - Optional configuration for tools available to the subagent.
     */
    private constructor();
    /**
     * Creates and validates a new SubAgentScope instance.
     * This factory method ensures that all tools provided in the prompt configuration
     * are valid for non-interactive use before creating the subagent instance.
     * @param {string} name - The name of the subagent.
     * @param {Config} runtimeContext - The shared runtime configuration and services.
     * @param {PromptConfig} promptConfig - Configuration for the subagent's prompt and behavior.
     * @param {ModelConfig} modelConfig - Configuration for the generative model parameters.
     * @param {RunConfig} runConfig - Configuration for the subagent's execution environment.
     * @param {ToolConfig} [toolConfig] - Optional configuration for tools.
     * @returns {Promise<SubAgentScope>} A promise that resolves to a valid SubAgentScope instance.
     * @throws {Error} If any tool requires user confirmation.
     */
    static create(name: string, runtimeContext: Config, promptConfig: PromptConfig, modelConfig: ModelConfig, runConfig: RunConfig, toolConfig?: ToolConfig, eventEmitter?: SubAgentEventEmitter, hooks?: SubagentHooks): Promise<SubAgentScope>;
    /**
     * Runs the subagent in a non-interactive mode.
     * This method orchestrates the subagent's execution loop, including prompt templating,
     * tool execution, and termination conditions.
     * @param {ContextState} context - The current context state containing variables for prompt templating.
     * @returns {Promise<void>} A promise that resolves when the subagent has completed its execution.
     */
    runNonInteractive(context: ContextState, externalSignal?: AbortSignal): Promise<void>;
    /**
     * Processes a list of function calls, executing each one and collecting their responses.
     * This method iterates through the provided function calls, executes them using the
     * `executeToolCall` function (or handles `self.emitvalue` internally), and aggregates
     * their results. It also manages error reporting for failed tool executions.
     * @param {FunctionCall[]} functionCalls - An array of `FunctionCall` objects to process.
     * @param {ToolRegistry} toolRegistry - The tool registry to look up and execute tools.
     * @param {AbortController} abortController - An `AbortController` to signal cancellation of tool executions.
     * @returns {Promise<Content[]>} A promise that resolves to an array of `Content` parts representing the tool responses,
     *          which are then used to update the chat history.
     */
    private processFunctionCalls;
    getEventEmitter(): SubAgentEventEmitter | undefined;
    getStatistics(): {
        successRate: number;
        toolUsage: {
            count: number;
            success: number;
            failure: number;
            lastError?: string;
            totalDurationMs?: number;
            averageDurationMs?: number;
            name: string;
        }[];
        startTimeMs: number;
        totalDurationMs: number;
        rounds: number;
        totalToolCalls: number;
        successfulToolCalls: number;
        failedToolCalls: number;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        estimatedCost?: number;
    };
    getExecutionSummary(): SubagentStatsSummary;
    getFinalText(): string;
    getTerminateMode(): SubagentTerminateMode;
    private createChatObject;
    /**
     * Safely retrieves the description of a tool by attempting to build it.
     * Returns an empty string if any error occurs during the process.
     *
     * @param toolName The name of the tool to get description for.
     * @param args The arguments that would be passed to the tool.
     * @returns The tool description or empty string if error occurs.
     */
    private getToolDescription;
    private buildChatSystemPrompt;
}
export {};
