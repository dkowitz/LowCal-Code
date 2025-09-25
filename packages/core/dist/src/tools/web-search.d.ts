/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, type ToolInvocation, type ToolResult } from './tools.js';
import type { Config } from '../config/config.js';
/**
 * Parameters for the WebSearchTool.
 */
export interface WebSearchToolParams {
    /**
     * The search query.
     */
    query: string;
}
/**
 * Extends ToolResult to include sources for web search.
 */
export interface WebSearchToolResult extends ToolResult {
    sources?: Array<{
        title: string;
        url: string;
    }>;
}
/**
 * A tool to perform web searches using Google Search via the Gemini API.
 */
export declare class WebSearchTool extends BaseDeclarativeTool<WebSearchToolParams, WebSearchToolResult> {
    private readonly config;
    static readonly Name: string;
    constructor(config: Config);
    /**
     * Validates the parameters for the WebSearchTool.
     * @param params The parameters to validate
     * @returns An error message string if validation fails, null if valid
     */
    protected validateToolParamValues(params: WebSearchToolParams): string | null;
    protected createInvocation(params: WebSearchToolParams): ToolInvocation<WebSearchToolParams, WebSearchToolResult>;
}
