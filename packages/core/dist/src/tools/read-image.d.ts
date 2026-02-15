/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
import type { Config } from "../config/config.js";
export interface ReadImageToolParams {
    /**
     * The absolute path to the image file to load for vision analysis.
     */
    absolute_path: string;
}
export declare class ReadImageTool extends BaseDeclarativeTool<ReadImageToolParams, ToolResult> {
    private config;
    static readonly Name: string;
    constructor(config: Config);
    protected validateToolParamValues(params: ReadImageToolParams): string | null;
    protected createInvocation(params: ReadImageToolParams): ToolInvocation<ReadImageToolParams, ToolResult>;
}
