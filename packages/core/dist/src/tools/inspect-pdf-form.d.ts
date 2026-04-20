/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
export interface InspectPdfFormToolParams {
    absolute_path: string;
    form_profile?: string;
}
export declare class InspectPdfFormTool extends BaseDeclarativeTool<InspectPdfFormToolParams, ToolResult> {
    private readonly config;
    static readonly Name: "inspect_pdf_form";
    constructor(config: Config);
    protected validateToolParamValues(params: InspectPdfFormToolParams): string | null;
    protected createInvocation(params: InspectPdfFormToolParams): ToolInvocation<InspectPdfFormToolParams, ToolResult>;
}
