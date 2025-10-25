/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, type ToolInvocation, type ToolResult } from "./tools.js";
import type { Config } from "../config/config.js";
import { ToolNames } from "./tool-names.js";
/**
 * Parameters for the ResearchTool.
 */
export interface ResearchToolParams {
    /**
     * The research query
     */
    query: string;
    /**
     * Optimization mode - speed, balanced, or quality
     */
    mode: 'speed' | 'balanced' | 'quality';
    /**
     * Optional ordered list of search tools to use. Defaults to all available.
     */
    searchTools?: Array<typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH>;
}
/**
 * Extends ToolResult to include sources and citations for research.
 */
export interface ResearchToolResult extends ToolResult {
    sources?: Array<{
        title: string;
        url: string;
    }>;
    citations?: Record<string, {
        content: string;
        sourceIndex: number;
    }>;
}
/**
 * A tool to conduct deep internet research with multiple sources and citations.
 */
export declare class ResearchTool extends BaseDeclarativeTool<ResearchToolParams, ResearchToolResult> {
    private readonly config;
    static readonly Name: string;
    constructor(config: Config);
    /**
     * Validates the parameters for the ResearchTool.
     * @param params The parameters to validate
     * @returns An error message string if validation fails, null if valid
     */
    protected validateToolParamValues(params: ResearchToolParams): string | null;
    protected createInvocation(params: ResearchToolParams): ToolInvocation<ResearchToolParams, ResearchToolResult>;
}
