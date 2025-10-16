/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type PromptMode = "auto" | "full" | "concise";
export interface CliToolConfig {
    promptMode: PromptMode;
    activeCollection: string;
    collections: Record<string, string[]>;
}
export declare function resolveToolConfigPath(cwd?: string): string;
export declare function loadCliToolConfig(): CliToolConfig;
export declare function saveCliToolConfig(cfg: CliToolConfig): void;
export declare function syncCoreToolConfig(cfg: CliToolConfig): void;
export declare function normalizeToolName(name: string): string;
export declare function normalizeToolList(toolNames: string[]): string[];
