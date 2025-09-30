/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export { DefaultRequestTokenizer } from "./requestTokenizer.js";
import { DefaultRequestTokenizer } from "./requestTokenizer.js";
export { TextTokenizer } from "./textTokenizer.js";
export { ImageTokenizer } from "./imageTokenizer.js";
// Singleton instance for convenient usage
let defaultTokenizer = null;
/**
 * Get the default request tokenizer instance
 */
export function getDefaultTokenizer() {
    if (!defaultTokenizer) {
        defaultTokenizer = new DefaultRequestTokenizer();
    }
    return defaultTokenizer;
}
/**
 * Dispose of the default tokenizer instance
 */
export async function disposeDefaultTokenizer() {
    if (defaultTokenizer) {
        await defaultTokenizer.dispose();
        defaultTokenizer = null;
    }
}
//# sourceMappingURL=index.js.map