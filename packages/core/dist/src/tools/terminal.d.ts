/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import { type TerminalBackendPreference, type TerminalWaitConditionType, type TerminalWaitOptions } from "../services/terminalSessionService.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
type InteractiveTerminalWaitOptions = TerminalWaitOptions & {
    fresh_only?: boolean;
};
export type InteractiveTerminalAction = "open" | "send" | "wait" | "read" | "list" | "close";
export interface InteractiveTerminalParams {
    action: InteractiveTerminalAction;
    session_id?: string;
    command?: string;
    directory?: string;
    backend?: TerminalBackendPreference;
    cols?: number;
    rows?: number;
    name?: string;
    input?: string;
    append_enter?: boolean;
    sensitive_input?: boolean;
    settle_ms?: number;
    include_recent_transcript?: boolean;
    max_output_chars?: number;
    wait_for?: InteractiveTerminalWaitOptions;
    type?: TerminalWaitConditionType;
    pattern?: string;
    timeoutMs?: number;
    idleMs?: number;
    pollIntervalMs?: number;
    freshOnly?: boolean;
    fresh_only?: boolean;
}
export declare class InteractiveTerminalTool extends BaseDeclarativeTool<InteractiveTerminalParams, ToolResult> {
    private readonly config;
    static Name: string;
    private allowlist;
    constructor(config: Config);
    protected validateToolParamValues(params: InteractiveTerminalParams): string | null;
    protected createInvocation(params: InteractiveTerminalParams): ToolInvocation<InteractiveTerminalParams, ToolResult>;
}
export {};
