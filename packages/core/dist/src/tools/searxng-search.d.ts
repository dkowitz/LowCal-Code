/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, type ToolInvocation, type ToolResult } from "./tools.js";
import type { Config } from "../config/config.js";
/**
 * Parameters for the SearXNGSearchTool.
 */
export interface SearXNGSearchToolParams {
    /**
     * The search query.
     */
    query: string;
}
/**
 * Extends ToolResult to include sources for web search.
 */
export interface SearXNGSearchToolResult extends ToolResult {
    sources?: Array<{
        title: string;
        url: string;
    }>;
}
/**
 * A tool to perform web searches using the local SearXNG instance.
 */
export declare class SearXNGSearchTool extends BaseDeclarativeTool<SearXNGSearchToolParams, SearXNGSearchToolResult> {
    private readonly config;
    static readonly Name: string;
    constructor(config: Config);
    /**
     * Validates the parameters for the SearXNGSearchTool.
     * @param params The parameters to validate
     * @returns An error message string if validation fails, null if valid
     */
    protected validateToolParamValues(params: SearXNGSearchToolParams): string | null;
    protected createInvocation(params: SearXNGSearchToolParams): ToolInvocation<SearXNGSearchToolParams, SearXNGSearchToolResult>;
}
