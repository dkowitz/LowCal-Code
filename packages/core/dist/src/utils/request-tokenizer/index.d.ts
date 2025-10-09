/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export { DefaultRequestTokenizer } from "./requestTokenizer.js";
import { DefaultRequestTokenizer } from "./requestTokenizer.js";
export { TextTokenizer } from "./textTokenizer.js";
export { ImageTokenizer } from "./imageTokenizer.js";
export type { RequestTokenizer, TokenizerConfig, TokenCalculationResult, ImageMetadata, } from "./types.js";
/**
 * Get the default request tokenizer instance
 */
export declare function getDefaultTokenizer(): DefaultRequestTokenizer;
/**
 * Dispose of the default tokenizer instance
 */
export declare function disposeDefaultTokenizer(): Promise<void>;
