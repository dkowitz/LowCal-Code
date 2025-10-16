/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenerateContentConfig } from "@google/genai";
type PromptMode = "auto" | "full" | "concise";
interface ToolConfig {
    activeCollection: string;
    promptMode: PromptMode;
    collections: Record<string, string[]>;
}
export declare const toolConfig: ToolConfig;
export interface ModelTemplateMapping {
    baseUrls?: string[];
    modelNames?: string[];
    template?: string;
}
export interface SystemPromptConfig {
    systemPromptMappings?: ModelTemplateMapping[];
}
/**
 * Processes a custom system instruction by appending user memory if available.
 * This function should only be used when there is actually a custom instruction.
 *
 * @param customInstruction - Custom system instruction (ContentUnion from @google/genai)
 * @param userMemory - User memory to append
 * @returns Processed custom system instruction with user memory appended
 */
export declare function getCustomSystemPrompt(customInstruction: GenerateContentConfig["systemInstruction"], userMemory?: string): string;
export declare function getCoreSystemPrompt(userMemory?: string, config?: SystemPromptConfig, model?: string): string;
/**
 * Provides the system prompt for the history compression process.
 * This prompt instructs the model to act as a specialized state manager,
 * think in a scratchpad, and produce a structured XML summary.
 */
export declare function getCompressionPrompt(): string;
/**
 * Provides the system prompt for generating project summaries in markdown format.
 * This prompt instructs the model to create a structured markdown summary
 * that can be saved to a file for future reference.
 */
export declare function getProjectSummaryPrompt(): string;
/**
 * Generates a system reminder message about available subagents for the AI assistant.
 *
 * This function creates an internal system message that informs the AI about specialized
 * agents it can delegate tasks to. The reminder encourages proactive use of the TASK tool
 * when user requests match agent capabilities.
 *
 * @param agentTypes - Array of available agent type names (e.g., ['python', 'web', 'analysis'])
 * @returns A formatted system reminder string wrapped in XML tags for internal AI processing
 *
 * @example
 * ```typescript
 * const reminder = getSubagentSystemReminder(['python', 'web']);
 * // Returns: "<system-reminder>You have powerful specialized agents..."
 * ```
 */
export declare function getSubagentSystemReminder(agentTypes: string[]): string;
/**
 * Generates a system reminder message for plan mode operation.
 *
 * This function creates an internal system message that enforces plan mode constraints,
 * preventing the AI from making any modifications to the system until the user confirms
 * the proposed plan. It overrides other instructions to ensure read-only behavior.
 *
 * @returns A formatted system reminder string that enforces plan mode restrictions
 *
 * @example
 * ```typescript
 * const reminder = getPlanModeSystemReminder();
 * // Returns: "<system-reminder>Plan mode is active..."
 * ```
 *
 * @remarks
 * Plan mode ensures the AI will:
 * - Only perform read-only operations (research, analysis)
 * - Present a comprehensive plan via ExitPlanMode tool
 * - Wait for user confirmation before making any changes
 * - Override any other instructions that would modify system state
 */
export declare function getPlanModeSystemReminder(): string;
export {};
