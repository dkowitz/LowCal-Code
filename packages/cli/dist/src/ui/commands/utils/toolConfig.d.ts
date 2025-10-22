/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type PromptMode = "auto" | "full" | "concise";
export interface CustomPromptMetadata {
    content: string;
    exclusive: boolean;
    createdAt: number;
    tokenCount: number;
}
export interface ActiveCustomPrompt {
    name: string;
    exclusive: boolean;
}
export interface CliToolConfig {
    promptMode: PromptMode;
    activeCollection: string;
    collections: Record<string, string[]>;
    customPrompts?: Record<string, CustomPromptMetadata>;
    activeCustomPrompt?: ActiveCustomPrompt | null;
}
/**
 * Get the global tool config path in ~/.qwen/tool-config.json
 */
export declare function resolveToolConfigPath(): string;
/**
 * Estimate token count (roughly 1 token per 4 characters)
 */
export declare function estimateTokenCount(text: string): number;
export declare function loadCliToolConfig(): CliToolConfig;
export declare function saveCliToolConfig(cfg: CliToolConfig): void;
export declare function syncCoreToolConfig(cfg: CliToolConfig): void;
export declare function normalizeToolName(name: string): string;
export declare function normalizeToolList(toolNames: string[]): string[];
