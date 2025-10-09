type Model = string;
type TokenCount = number;
/**
 * Token limit types for different use cases.
 * - 'input': Maximum input context window size
 * - 'output': Maximum output tokens that can be generated in a single response
 */
export type TokenLimitType = "input" | "output";
export declare const DEFAULT_TOKEN_LIMIT: TokenCount;
export declare const DEFAULT_OUTPUT_TOKEN_LIMIT: TokenCount;
/** Robust normalizer: strips provider prefixes, pipes/colons, date/version suffixes, etc. */
export declare function normalize(model: string): string;
/**
 * Set a custom (dynamic) context limit for a specific model.
 * If limit is undefined or invalid, the dynamic entry is removed.
 */
export declare function setModelContextLimit(model: string, limit?: number | undefined): void;
/**
 * Get the custom (dynamic) context limit for a specific model, if any.
 */
export declare function getModelContextLimit(model: string): TokenCount | undefined;
/**
 * Return the token limit for a model string based on the specified type.
 *
 * This function determines the maximum number of tokens for either input context
 * or output generation based on the model and token type. It uses the same
 * normalization logic for consistency across both input and output limits.
 *
 * Dynamic provider-reported input context limits (set via setModelContextLimit)
 * take precedence over the static pattern-based mapping.
 *
 * @param model - The model name to get the token limit for
 * @param type - The type of token limit ('input' for context window, 'output' for generation)
 * @returns The maximum number of tokens allowed for this model and type
 */
export declare function tokenLimit(model: Model, type?: TokenLimitType): TokenCount;
export {};
