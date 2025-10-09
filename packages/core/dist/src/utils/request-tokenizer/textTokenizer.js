/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { get_encoding } from "tiktoken";
/**
 * Text tokenizer for calculating text tokens using tiktoken
 */
export class TextTokenizer {
    encoding = null;
    encodingName;
    constructor(encodingName = "cl100k_base") {
        this.encodingName = encodingName;
    }
    /**
     * Initialize the tokenizer (lazy loading)
     */
    async ensureEncoding() {
        if (this.encoding)
            return;
        try {
            // Use type assertion since we know the encoding name is valid
            this.encoding = get_encoding(this.encodingName);
        }
        catch (error) {
            console.warn(`Failed to load tiktoken with encoding ${this.encodingName}:`, error);
            this.encoding = null;
        }
    }
    /**
     * Calculate tokens for text content
     */
    async calculateTokens(text) {
        if (!text)
            return 0;
        await this.ensureEncoding();
        if (this.encoding) {
            try {
                return this.encoding.encode(text).length;
            }
            catch (error) {
                console.warn("Error encoding text with tiktoken:", error);
            }
        }
        // Fallback: rough approximation using character count
        // This is a conservative estimate: 1 token ≈ 4 characters for most languages
        return Math.ceil(text.length / 4);
    }
    /**
     * Calculate tokens for multiple text strings in parallel
     */
    async calculateTokensBatch(texts) {
        await this.ensureEncoding();
        if (this.encoding) {
            try {
                return texts.map((text) => {
                    if (!text)
                        return 0;
                    // this.encoding may be null, add a null check to satisfy lint
                    return this.encoding ? this.encoding.encode(text).length : 0;
                });
            }
            catch (error) {
                console.warn("Error encoding texts with tiktoken:", error);
                // In case of error, return fallback estimation for all texts
                return texts.map((text) => Math.ceil((text || "").length / 4));
            }
        }
        // Fallback for batch processing
        return texts.map((text) => Math.ceil((text || "").length / 4));
    }
    /**
     * Dispose of resources
     */
    dispose() {
        if (this.encoding) {
            try {
                this.encoding.free();
            }
            catch (error) {
                console.warn("Error freeing tiktoken encoding:", error);
            }
            this.encoding = null;
        }
    }
}
//# sourceMappingURL=textTokenizer.js.map