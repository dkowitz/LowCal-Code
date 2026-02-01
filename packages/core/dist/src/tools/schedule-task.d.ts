/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
import type { ScheduleTaskParams } from "../scheduler/types.js";
declare class ScheduleTaskInvocation extends BaseToolInvocation<ScheduleTaskParams, ToolResult> {
    constructor(params: ScheduleTaskParams);
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private executeAction;
    private formatJobCreated;
    private formatJobList;
    private formatJobDetails;
    private formatJobUpdated;
}
export declare class ScheduleTaskTool extends BaseDeclarativeTool<ScheduleTaskParams, ToolResult> {
    constructor();
    protected createInvocation(params: ScheduleTaskParams): ScheduleTaskInvocation;
}
export {};
