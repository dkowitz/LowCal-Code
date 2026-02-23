/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
export interface ReadCollabMessagesParams {
    since_seq?: number;
    limit?: number;
    include_all_targets?: boolean;
    include_expired?: boolean;
    session_id?: string;
}
declare class ReadCollabMessagesInvocation extends BaseToolInvocation<ReadCollabMessagesParams, ToolResult> {
    private readonly config;
    constructor(params: ReadCollabMessagesParams, config: Config);
    getDescription(): string;
    execute(): Promise<ToolResult>;
}
export declare class ReadCollabMessagesTool extends BaseDeclarativeTool<ReadCollabMessagesParams, ToolResult> {
    private readonly config;
    static readonly Name: string;
    constructor(config: Config);
    protected createInvocation(params: ReadCollabMessagesParams): ReadCollabMessagesInvocation;
}
export {};
