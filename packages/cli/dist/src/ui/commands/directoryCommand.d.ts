/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SlashCommand } from "./types.js";
export declare function expandHomeDir(p: string): string;
/**
 * Validates that a path exists and is a directory.
 * Returns an error string or null if valid. Testable via injection.
 */
export declare function validateDirectory(resolvedPath: string): {
    valid: true;
} | {
    valid: false;
    error: string;
};
export declare const directoryCommand: SlashCommand;
