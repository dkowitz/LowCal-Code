/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content, PartListUnion } from "@google/genai";
export declare const DEFAULT_MAX_TOOL_OUTPUT_CHARS = 12000;
export declare const DEFAULT_TOOL_OUTPUT_PREVIEW_CHARS = 4000;
export interface ToolOutputCompactionOptions {
    maxChars?: number;
    previewChars?: number;
    callId?: string;
}
export interface CompactionResult<T> {
    value: T;
    wasCompacted: boolean;
}
export declare function compactToolOutputText(toolName: string, text: string, options?: ToolOutputCompactionOptions): CompactionResult<string>;
export declare function compactPartListUnion(toolName: string, content: PartListUnion, options?: ToolOutputCompactionOptions): CompactionResult<PartListUnion>;
export declare function compactHistoryFunctionResponses(history: Content[], options?: ToolOutputCompactionOptions): {
    history: Content[];
    compactionCount: number;
};
