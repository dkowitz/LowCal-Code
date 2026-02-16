/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
/**
 * Parameters for the RSS tool
 */
export interface RSSToolParams {
    /**
     * The RSS/Atom feed URL to fetch
     */
    url: string;
    /**
     * Maximum number of items to return (default: 25)
     */
    maxItems?: number;
}
/**
 * Normalized RSS item structure
 */
export interface RSSItem {
    title: string;
    link: string;
    description?: string;
    pubDate?: string;
    author?: string;
    categories?: string[];
    guid?: string;
}
/**
 * Normalized RSS feed structure
 */
export interface RSSFeed {
    title: string;
    link: string;
    description?: string;
    items: RSSItem[];
}
/**
 * RSS Tool - Fetch and parse RSS/Atom feeds
 *
 * Provides a unified interface for fetching RSS 2.0, Atom, and RSS 1.0 feeds.
 * Returns structured JSON with feed metadata and items.
 */
export declare class RSSTool extends BaseDeclarativeTool<RSSToolParams, ToolResult> {
    private readonly config;
    static readonly Name: string;
    static readonly description = "Fetch and parse RSS/Atom feeds. Supports RSS 2.0, Atom, and RSS 1.0 formats. Returns structured feed data including title, description, and items with titles, links, and publication dates.";
    constructor(config: Config);
    getName(): string;
    getDescription(): string;
    createInvocation(params: RSSToolParams): ToolInvocation<RSSToolParams, ToolResult>;
}
