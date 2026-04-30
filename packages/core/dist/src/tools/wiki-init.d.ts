/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
/**
 * Parameters for the WikiInitTool
 */
export interface WikiInitToolParams {
    /**
     * Whether to add .lowcal/ to .gitignore (optional, defaults to true)
     */
    gitignore?: boolean;
}
/**
 * Implementation of the WikiInit tool logic
 */
export declare class WikiInitTool extends BaseDeclarativeTool<WikiInitToolParams, ToolResult> {
    private config;
    static readonly Name: any;
    constructor(config: Config);
    /**
     * Validates the parameters for the tool.
     */
    protected validateToolParamValues(_params: WikiInitToolParams): string | null;
    protected createInvocation(params: WikiInitToolParams): ToolInvocation<WikiInitToolParams, ToolResult>;
}
