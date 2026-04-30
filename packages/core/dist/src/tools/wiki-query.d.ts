/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
/**
 * Parameters for the WikiQueryTool
 */
export interface WikiQueryToolParams {
    /**
     * The question to answer using the compiled wiki.
     */
    question: string;
    /**
     * Output format preference (optional, defaults to "markdown").
     */
    format?: "markdown" | "table" | "bullet";
    /**
     * Whether to save high-value answers as new synthesis pages in the wiki.
     */
    file_output?: boolean;
}
/**
 * Scans the wiki index and returns page paths that are relevant to a query.
 * Uses simple keyword matching against category headers and entry summaries.
 */
export declare function findRelevantPages(wikiRoot: string, question: string): Promise<string[]>;
/**
 * Reads wiki page content given a page name. Searches across all subdirectories.
 */
export declare function readWikiPage(wikiRoot: string, pageName: string): Promise<{
    path: string;
    content: string;
} | null>;
/**
 * Gathers all wiki page contents for a set of relevant pages.
 */
export declare function gatherWikiContext(wikiRoot: string, question: string): Promise<{
    indexContent: string;
    pages: Array<{
        name: string;
        path: string;
        content: string;
    }>;
}>;
/**
 * Implementation of the WikiQuery tool logic.
 * Scans the wiki index for relevant pages, reads their content, and provides
 * structured context to the LLM for answer synthesis with citations.
 */
export declare class WikiQueryTool extends BaseDeclarativeTool<WikiQueryToolParams, ToolResult> {
    private config;
    static readonly Name: any;
    constructor(config: Config);
    protected validateToolParamValues(params: WikiQueryToolParams): string | null;
    protected createInvocation(params: WikiQueryToolParams): ToolInvocation<WikiQueryToolParams, ToolResult>;
}
