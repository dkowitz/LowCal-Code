/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
/**
 * Parameters for the WikiIngestTool
 */
export interface WikiIngestToolParams {
    /**
     * Path to the source file or URL to ingest into the wiki.
     */
    source: string;
    /**
     * Whether to discuss key takeaways with the user before writing ("supervised")
     * or process directly ("batch"). Defaults to "supervised".
     */
    mode?: "supervised" | "batch";
}
/**
 * Represents a page that was created or updated during ingestion.
 */
export interface WikiPageChange {
    /** Relative path within the wiki directory (e.g., "entities/react.md") */
    relativePath: string;
    /** Whether this is a new page ("created") or an update to existing content ("updated") */
    action: "created" | "updated";
    /** One-line summary of what changed */
    summary: string;
}
/**
 * Represents a contradiction found between new and existing wiki content.
 */
export interface WikiContradiction {
    /** The page where the contradiction was found */
    page: string;
    /** What the existing wiki says */
    existingClaim: string;
    /** What the new source says */
    newClaim: string;
}
/**
 * Result of an ingestion operation.
 */
export interface WikiIngestResult {
    /** Source that was ingested */
    source: string;
    /** Pages created or updated */
    pagesChanged: WikiPageChange[];
    /** Contradictions found between new and existing content */
    contradictions: WikiContradiction[];
}
/**
 * Converts a page title to a valid filename slug.
 * e.g., "React Hooks" -> "react-hooks.md"
 */
export declare function toSlug(title: string): string;
/**
 * Extracts [[wikilink]] references from markdown content.
 */
export declare function extractWikilinks(content: string): string[];
/**
 * Reads the wiki index and returns a map of category -> list of page entries.
 */
export declare function readWikiIndex(wikiRoot: string): Promise<Record<string, string[]>>;
/**
 * Updates the wiki index.md with new or changed page entries.
 */
export declare function updateWikiIndex(wikiRoot: string, changes: WikiPageChange[]): Promise<void>;
/**
 * Appends an entry to the wiki log.md.
 */
export declare function appendWikiLog(wikiRoot: string, entry: string): Promise<void>;
/**
 * Implementation of the WikiIngest tool logic.
 * Reads a source document, archives it to raw/, and provides structured
 * instructions for the LLM to create/update wiki pages.
 */
export declare class WikiIngestTool extends BaseDeclarativeTool<WikiIngestToolParams, ToolResult> {
    private config;
    static readonly Name: "wiki_ingest";
    constructor(config: Config);
    /**
     * Validates the parameters for the tool.
     */
    protected validateToolParamValues(params: WikiIngestToolParams): string | null;
    protected createInvocation(params: WikiIngestToolParams): ToolInvocation<WikiIngestToolParams, ToolResult>;
}
