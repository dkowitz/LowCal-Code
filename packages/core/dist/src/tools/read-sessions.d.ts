/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
type ReadSessionsAction = "list" | "get";
export interface ReadSessionsParams {
    action?: ReadSessionsAction;
    session_id?: string;
    ttl_seconds?: number;
    include_stale?: boolean;
    limit?: number;
}
declare class ReadSessionsInvocation extends BaseToolInvocation<ReadSessionsParams, ToolResult> {
    getDescription(): string;
    execute(): Promise<ToolResult>;
}
export declare class ReadSessionsTool extends BaseDeclarativeTool<ReadSessionsParams, ToolResult> {
    static readonly Name: string;
    constructor();
    protected createInvocation(params: ReadSessionsParams): ReadSessionsInvocation;
}
export {};
