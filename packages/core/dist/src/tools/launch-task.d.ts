/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
import type { JobExecutionMode } from "../scheduler/types.js";
import type { Config } from "../config/config.js";
declare class LaunchTaskInvocation extends BaseToolInvocation<LaunchTaskParams, ToolResult> {
    private readonly sourceSessionId?;
    private readonly defaultExecutionMode;
    constructor(params: LaunchTaskParams, sourceSessionId?: string | undefined, defaultExecutionMode?: JobExecutionMode);
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private executeAction;
    private resolveRuntimePaths;
    private launchLowCalInstance;
    private spawnHeadlessJob;
    private spawnZellijJob;
    private runZellijCommand;
    private shellQuoteArg;
    private formatExistingTask;
    private formatTaskCreated;
}
export interface LaunchTaskParams {
    action: "create";
    id?: string;
    prompt?: string;
    description?: string;
    execution_mode?: JobExecutionMode | "default";
    execution_mode_override?: boolean;
    return_to_session_id?: string;
    idempotency_key?: string;
    allow_recursive?: boolean;
}
export declare class LaunchTaskTool extends BaseDeclarativeTool<LaunchTaskParams, ToolResult> {
    private readonly config?;
    constructor(config?: Config | undefined);
    protected createInvocation(params: LaunchTaskParams): LaunchTaskInvocation;
}
export {};
