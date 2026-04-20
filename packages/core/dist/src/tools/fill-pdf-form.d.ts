/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
import type { PdfFormFillRequest } from "./pdf-form-utils.js";
export interface FillPdfFormToolParams {
    input_pdf_path: string;
    output_pdf_path: string;
    fields: PdfFormFillRequest[];
    allow_missing_fields?: boolean;
    form_profile?: string;
}
export declare class FillPdfFormTool extends BaseDeclarativeTool<FillPdfFormToolParams, ToolResult> {
    private readonly config;
    static readonly Name: "fill_pdf_form";
    constructor(config: Config);
    protected validateToolParamValues(params: FillPdfFormToolParams): string | null;
    protected createInvocation(params: FillPdfFormToolParams): ToolInvocation<FillPdfFormToolParams, ToolResult>;
}
