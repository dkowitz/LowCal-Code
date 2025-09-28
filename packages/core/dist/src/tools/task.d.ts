/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation } from './tools.js';
import type { ToolResult, ToolResultDisplay } from './tools.js';
import type { Config } from '../config/config.js';
import type { SubagentManager } from '../subagents/subagent-manager.js';
import { SubAgentEventEmitter } from '../subagents/subagent-events.js';
export interface TaskParams {
    description: string;
    prompt: string;
    subagent_type: string;
}
/**
 * Task tool that enables primary agents to delegate tasks to specialized subagents.
 * The tool dynamically loads available subagents and includes them in its description
 * for the model to choose from.
 */
export declare class TaskTool extends BaseDeclarativeTool<TaskParams, ToolResult> {
    private readonly config;
    static readonly Name: string;
    private subagentManager;
    private availableSubagents;
    constructor(config: Config);
    /**
     * Asynchronously initializes the tool by loading available subagents
     * and updating the description and schema.
     */
    private initializeAsync;
    /**
     * Updates the tool's description and schema based on available subagents.
     */
    private updateDescriptionAndSchema;
    /**
     * Refreshes the available subagents and updates the tool description.
     * This can be called when subagents are added or removed.
     */
    refreshSubagents(): Promise<void>;
    validateToolParams(params: TaskParams): string | null;
    protected createInvocation(params: TaskParams): TaskToolInvocation;
}
declare class TaskToolInvocation extends BaseToolInvocation<TaskParams, ToolResult> {
    private readonly config;
    private readonly subagentManager;
    private readonly _eventEmitter;
    private currentDisplay;
    private currentToolCalls;
    constructor(config: Config, subagentManager: SubagentManager, params: TaskParams);
    get eventEmitter(): SubAgentEventEmitter;
    /**
     * Updates the current display state and calls updateOutput if provided
     */
    private updateDisplay;
    /**
     * Sets up event listeners for real-time subagent progress updates
     */
    private setupEventListeners;
    getDescription(): string;
    shouldConfirmExecute(): Promise<false>;
    execute(signal?: AbortSignal, updateOutput?: (output: ToolResultDisplay) => void): Promise<ToolResult>;
}
export {};
