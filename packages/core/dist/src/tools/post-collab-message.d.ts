/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
export interface PostCollabMessageParams {
    text: string;
    to_session_id?: string;
    type?: string;
    refs?: string[];
    in_reply_to?: string;
    ttl_seconds?: number;
    notify?: string;
}
export declare class PostCollabMessageTool extends BaseDeclarativeTool<PostCollabMessageParams, ToolResult> {
    private readonly config;
    static readonly Name: string;
    constructor(config: Config);
    protected validateToolParamValues(params: PostCollabMessageParams): string | null;
    protected createInvocation(params: PostCollabMessageParams): ToolInvocation<PostCollabMessageParams, ToolResult>;
}
