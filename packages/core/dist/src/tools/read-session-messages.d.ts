/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
type ReadSessionMessagesAction = "pull" | "peek" | "clear" | "wait";
export interface ReadSessionMessagesParams {
    action?: ReadSessionMessagesAction;
    session_id?: string;
    max_items?: number;
    task_id?: string;
    timeout_seconds?: number;
}
declare class ReadSessionMessagesInvocation extends BaseToolInvocation<ReadSessionMessagesParams, ToolResult> {
    private readonly config;
    constructor(params: ReadSessionMessagesParams, config: Config);
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private executeAction;
}
export declare class ReadSessionMessagesTool extends BaseDeclarativeTool<ReadSessionMessagesParams, ToolResult> {
    private readonly config;
    static readonly Name: string;
    constructor(config: Config);
    protected createInvocation(params: ReadSessionMessagesParams): ReadSessionMessagesInvocation;
}
export {};
