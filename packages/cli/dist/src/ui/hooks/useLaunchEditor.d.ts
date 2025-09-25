/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * React hook that provides an editor launcher function.
 * Uses settings context and stdin management internally.
 */
export declare function useLaunchEditor(): (filePath: string) => Promise<void>;
