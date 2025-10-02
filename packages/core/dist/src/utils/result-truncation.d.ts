/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Smart truncation strategies for tool results to prevent context overflow
 * while maintaining effectiveness.
 */
export interface TruncationResult {
    content: string;
    wasTruncated: boolean;
    originalSize: number;
    truncatedSize: number;
    summary?: string;
}
export interface TruncationStrategy {
    /** Maximum number of characters before truncation kicks in */
    maxChars: number;
    /** Function to intelligently truncate content */
    truncate: (content: string, originalSize: number) => TruncationResult;
}
/**
 * Truncation strategy for search_file_content results
 * Keeps first N and last N matches, summarizes the middle
 */
export declare function truncateSearchResults(content: string, maxChars?: number): TruncationResult;
/**
 * Truncation strategy for read_many_files results
 */
export declare function truncateReadManyFiles(content: string, maxChars?: number): TruncationResult;
/**
 * Generic truncation for other tools
 */
export declare function truncateGeneric(content: string, maxChars?: number): TruncationResult;
/**
 * Tool-specific truncation strategies
 */
export declare const TRUNCATION_STRATEGIES: Record<string, TruncationStrategy>;
/**
 * Apply smart truncation to tool result content
 */
export declare function applySmartTruncation(toolName: string, content: string): TruncationResult;
