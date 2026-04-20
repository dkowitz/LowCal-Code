/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
type PdfFieldValue = string | number | boolean;
export interface PdfFormFieldSummary {
    name: string;
    type: string;
    widgetCount: number;
    pageNumbers: number[];
    value: unknown;
    defaultValue: unknown;
    exportValues?: string[];
    charLimit?: number;
    comb?: boolean;
    multiline?: boolean;
    hidden: boolean;
    knownAliases?: string[];
    widgets: Array<{
        id: string;
        page: number | null;
        value: unknown;
        exportValues?: string[];
        rect?: number[];
    }>;
}
export interface PdfFormFillRequest {
    name?: string;
    alias?: string;
    value: PdfFieldValue;
}
export interface PdfFormFillResult {
    filledFields: Array<{
        requestedField: string;
        resolvedFieldName: string;
        type: string;
        widgetCount: number;
        writtenValue: string;
    }>;
    missingFields: string[];
    outputBytes: Uint8Array;
}
export declare function inspectPdfFormFields(filePath: string, requestedProfile?: string): Promise<PdfFormFieldSummary[]>;
export declare function fillPdfFormFields(inputPdfPath: string, requestedFields: PdfFormFillRequest[], requestedProfile?: string): Promise<PdfFormFillResult>;
export declare function formatPdfFormInspection(filePath: string, fields: PdfFormFieldSummary[], requestedProfile?: string): string;
export declare function formatPdfFormFillResult(inputPdfPath: string, outputPdfPath: string, fillResult: Omit<PdfFormFillResult, "outputBytes">, requestedProfile?: string): string;
export {};
