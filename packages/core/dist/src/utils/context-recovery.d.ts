/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
/**
 * Strategies for recovering from context overflow errors
 */
export interface CompressionOptions {
    /** Fraction of history to preserve (0.0 - 1.0) */
    preserveFraction: number;
    /** Whether to aggressively compress tool results */
    compressToolResults: boolean;
    /** Whether to drop intermediate assistant messages */
    dropIntermediateMessages: boolean;
}
/**
 * Aggressively compresses history by summarizing tool results
 */
export declare function compressToolResults(history: Content[]): Content[];
/**
 * Removes intermediate assistant messages, keeping only the last one in each turn
 */
export declare function dropIntermediateAssistantMessages(history: Content[]): Content[];
/**
 * Implements a sliding window to keep only recent history
 */
export declare function applySlidingWindow(history: Content[], preserveFraction: number): Content[];
/**
 * Multi-stage compression strategy
 */
export declare function applyAdaptiveCompression(history: Content[], options: CompressionOptions): Content[];
/**
 * Estimates the size reduction from compression
 */
export declare function estimateCompressionRatio(original: Content[], compressed: Content[]): number;
/**
 * Progressive compression strategies, from least to most aggressive
 */
export declare const COMPRESSION_STRATEGIES: CompressionOptions[];
