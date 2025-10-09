/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FileDiscoveryService } from "../services/fileDiscoveryService.js";
import type { FileFilteringOptions } from "../config/config.js";
/**
 * Loads hierarchical QWEN.md files and concatenates their content.
 * This function is intended for use by the server.
 */
export declare function loadServerHierarchicalMemory(currentWorkingDirectory: string, includeDirectoriesToReadGemini: readonly string[], debugMode: boolean, fileService: FileDiscoveryService, extensionContextFilePaths?: string[], importFormat?: "flat" | "tree", fileFilteringOptions?: FileFilteringOptions, maxDirs?: number): Promise<{
    memoryContent: string;
    fileCount: number;
}>;
