/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
import type { JobExecutionMode } from "../scheduler/types.js";
declare class LaunchTaskInvocation extends BaseToolInvocation<LaunchTaskParams, ToolResult> {
    constructor(params: LaunchTaskParams);
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private executeAction;
    private launchLowCalInstance;
    private spawnHeadlessJob;
    private spawnZellijJob;
    private runZellijCommand;
    private shellQuoteArg;
    private formatTaskCreated;
}
export interface LaunchTaskParams {
    action: "create";
    id?: string;
    prompt?: string;
    description?: string;
    execution_mode?: JobExecutionMode;
}
export declare class LaunchTaskTool extends BaseDeclarativeTool<LaunchTaskParams, ToolResult> {
    constructor();
    protected createInvocation(params: LaunchTaskParams): LaunchTaskInvocation;
}
export {};
