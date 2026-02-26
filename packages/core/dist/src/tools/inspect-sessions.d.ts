/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
export interface InspectSessionsParams {
    session_id?: string;
    include_stale?: boolean;
    ttl_seconds?: number;
    limit?: number;
    include_history?: boolean;
    max_messages?: number;
    max_message_chars?: number;
    include_details?: boolean;
}
declare class InspectSessionsInvocation extends BaseToolInvocation<InspectSessionsParams, ToolResult> {
    getDescription(): string;
    execute(): Promise<ToolResult>;
}
export declare class InspectSessionsTool extends BaseDeclarativeTool<InspectSessionsParams, ToolResult> {
    static readonly Name: string;
    constructor();
    protected createInvocation(params: InspectSessionsParams): InspectSessionsInvocation;
}
export {};
