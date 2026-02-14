/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { TaskRuntimeProfile, TaskTemplateLevel } from "../task-templates/types.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
import type { ToolResult } from "./tools.js";
type TaskTemplateAction = "list" | "get" | "create" | "update" | "delete" | "validate" | "resolve";
export interface TaskTemplateToolParams {
    action: TaskTemplateAction;
    id?: string;
    level?: TaskTemplateLevel | "auto";
    tag?: string;
    template?: Record<string, unknown>;
    overrides?: TaskRuntimeProfile;
}
declare class TaskTemplateInvocation extends BaseToolInvocation<TaskTemplateToolParams, ToolResult> {
    private readonly config?;
    constructor(params: TaskTemplateToolParams, config?: Config | undefined);
    private createManager;
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private executeAction;
}
export declare class TaskTemplateTool extends BaseDeclarativeTool<TaskTemplateToolParams, ToolResult> {
    private readonly config?;
    static readonly Name = "task_template";
    constructor(config?: Config | undefined);
    protected createInvocation(params: TaskTemplateToolParams): TaskTemplateInvocation;
}
export {};
