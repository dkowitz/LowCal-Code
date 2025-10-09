/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Proactive validation and warnings for tool calls that may produce large results
 */
export interface ToolCallWarning {
    severity: "info" | "warning" | "error";
    message: string;
    suggestion?: string;
}
/**
 * Validates search_file_content parameters
 */
export declare function validateSearchFileContent(params: {
    pattern: string;
    path?: string;
    include?: string;
}): ToolCallWarning | null;
/**
 * Validates read_many_files parameters
 */
export declare function validateReadManyFiles(params: {
    paths: string[];
    include?: string[];
    recursive?: boolean;
}): ToolCallWarning | null;
/**
 * Validates glob parameters
 */
export declare function validateGlob(params: {
    pattern: string;
    path?: string;
}): ToolCallWarning | null;
/**
 * Main validation function - routes to specific validators
 */
export declare function validateToolCall(toolName: string, params: Record<string, unknown>): ToolCallWarning | null;
/**
 * Formats a warning for display
 */
export declare function formatToolWarning(warning: ToolCallWarning): string;
