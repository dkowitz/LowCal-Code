/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Text tokenizer for calculating text tokens using tiktoken
 */
export declare class TextTokenizer {
    private encoding;
    private encodingName;
    constructor(encodingName?: string);
    /**
     * Initialize the tokenizer (lazy loading)
     */
    private ensureEncoding;
    /**
     * Calculate tokens for text content
     */
    calculateTokens(text: string): Promise<number>;
    /**
     * Calculate tokens for multiple text strings in parallel
     */
    calculateTokensBatch(texts: string[]): Promise<number[]>;
    /**
     * Dispose of resources
     */
    dispose(): void;
}
