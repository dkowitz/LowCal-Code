/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../config/config.js';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool } from './tools.js';
/**
 * Browser control configuration interface
 */
export interface BrowserControlConfig {
    headless?: boolean;
    slowMo?: number;
    devtools?: boolean;
    navigationTimeout?: number;
    actionTimeout?: number;
    maxPagesPerSession?: number;
    maxScreenshotSize?: number;
    allowedOrigins?: string[];
    blockExternal?: boolean;
    sandbox?: boolean;
}
/**
 * Parameters for the BrowserControl tool
 */
export interface BrowserControlParams {
    /**
     * The browser operation to perform
     */
    operation: string;
    /**
     * Operation-specific parameters
     */
    params?: Record<string, unknown>;
}
/**
 * Result from browser control operations
 */
export interface BrowserControlResult extends ToolResult {
    /**
     * Current page URL
     */
    pageUrl?: string;
    /**
     * Current page title
     */
    pageTitle?: string;
    /**
     * Current page id
     */
    pageId?: string;
    /**
     * List of pages in the session
     */
    pages?: Array<{
        id: string;
        url: string;
        title: string;
    }>;
    /**
     * Path to saved screenshot (if any)
     */
    screenshotPath?: string;
    /**
     * Base64-encoded screenshot data
     */
    screenshot?: string;
    /**
     * Result value from JavaScript evaluation
     */
    value?: unknown;
    /**
     * Cookies from getCookies operation
     */
    cookies?: unknown[];
    /**
     * Locator result for element selection operations
     */
    locator?: string;
    /**
     * Tracing status
     */
    tracingStatus?: string;
}
/**
 * Browser Control Tool - provides automated browser control using Playwright
 */
export declare class BrowserControlTool extends BaseDeclarativeTool<BrowserControlParams, BrowserControlResult> {
    private readonly config;
    static readonly Name = "browser_control";
    constructor(config: Config);
    protected createInvocation(params: BrowserControlParams): ToolInvocation<BrowserControlParams, BrowserControlResult>;
}
