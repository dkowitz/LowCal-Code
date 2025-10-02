type Model = string;
type TokenCount = number;
/**
 * Token limit types for different use cases.
 * - 'input': Maximum input context window size
 * - 'output': Maximum output tokens that can be generated in a single response
 */
export type TokenLimitType = 'input' | 'output';
export declare const DEFAULT_TOKEN_LIMIT: TokenCount;
export declare const DEFAULT_OUTPUT_TOKEN_LIMIT: TokenCount;
/** Robust normalizer: strips provider prefixes, pipes/colons, date/version suffixes, etc. */
export declare function normalize(model: string): string;
/**
 * Return the token limit for a model string based on the specified type.
 *
 * This function determines the maximum number of tokens for either input context
 * or output generation based on the model and token type. It uses the same
 * normalization logic for consistency across both input and output limits.
 *
 * @param model - The model name to get the token limit for
 * @param type - The type of token limit ('input' for context window, 'output' for generation)
 * @returns The maximum number of tokens allowed for this model and type
 */
export declare function tokenLimit(model: Model, type?: TokenLimitType): TokenCount;
export {};
