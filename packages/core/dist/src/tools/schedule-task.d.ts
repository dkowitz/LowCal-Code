/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
import type { Config } from "../config/config.js";
import type { ScheduleTaskParams } from "../scheduler/types.js";
declare class ScheduleTaskInvocation extends BaseToolInvocation<ScheduleTaskParams, ToolResult> {
    private readonly sourceSessionId?;
    private readonly config?;
    constructor(params: ScheduleTaskParams, sourceSessionId?: string | undefined, config?: Config | undefined);
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private getWorkspaceRoot;
    private resolveTemplateFromParams;
    private resolveRunTarget;
    private buildExistingRuntimeProfile;
    private resolveJobRuntime;
    private executeAction;
    private formatJobCreated;
    private formatJobList;
    private formatJobDetails;
    private formatJobUpdated;
}
export declare class ScheduleTaskTool extends BaseDeclarativeTool<ScheduleTaskParams, ToolResult> {
    private readonly config?;
    constructor(config?: Config | undefined);
    protected createInvocation(params: ScheduleTaskParams): ScheduleTaskInvocation;
}
export {};
