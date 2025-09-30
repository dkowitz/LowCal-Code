/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SubagentConfig, SubagentRuntimeConfig, SubagentLevel, ListSubagentsOptions, CreateSubagentOptions } from "./types.js";
import { SubAgentScope } from "./subagent.js";
import type { Config } from "../config/config.js";
/**
 * Manages subagent configurations stored as Markdown files with YAML frontmatter.
 * Provides CRUD operations, validation, and integration with the runtime system.
 */
export declare class SubagentManager {
    private readonly config;
    private readonly validator;
    private subagentsCache;
    constructor(config: Config);
    /**
     * Creates a new subagent configuration.
     *
     * @param config - Subagent configuration to create
     * @param options - Creation options
     * @throws SubagentError if creation fails
     */
    createSubagent(config: SubagentConfig, options: CreateSubagentOptions): Promise<void>;
    /**
     * Loads a subagent configuration by name.
     * If level is specified, only searches that level.
     * If level is omitted, searches project-level first, then user-level, then built-in.
     *
     * @param name - Name of the subagent to load
     * @param level - Optional level to limit search to specific level
     * @returns SubagentConfig or null if not found
     */
    loadSubagent(name: string, level?: SubagentLevel): Promise<SubagentConfig | null>;
    /**
     * Updates an existing subagent configuration.
     *
     * @param name - Name of the subagent to update
     * @param updates - Partial configuration updates
     * @throws SubagentError if subagent not found or update fails
     */
    updateSubagent(name: string, updates: Partial<SubagentConfig>, level?: SubagentLevel): Promise<void>;
    /**
     * Deletes a subagent configuration.
     *
     * @param name - Name of the subagent to delete
     * @param level - Specific level to delete from, or undefined to delete from both
     * @throws SubagentError if deletion fails
     */
    deleteSubagent(name: string, level?: SubagentLevel): Promise<void>;
    /**
     * Lists all available subagents.
     *
     * @param options - Filtering and sorting options
     * @returns Array of subagent metadata
     */
    listSubagents(options?: ListSubagentsOptions): Promise<SubagentConfig[]>;
    /**
     * Refreshes the subagents cache by loading all subagents from disk.
     * This method is called automatically when cache is null or when force=true.
     *
     * @private
     */
    private refreshCache;
    /**
     * Clears the subagents cache, forcing the next listSubagents call to reload from disk.
     */
    clearCache(): void;
    /**
     * Finds a subagent by name and returns its metadata.
     *
     * @param name - Name of the subagent to find
     * @returns SubagentConfig or null if not found
     */
    findSubagentByName(name: string, level?: SubagentLevel): Promise<SubagentConfig | null>;
    /**
     * Parses a subagent file and returns the configuration.
     *
     * @param filePath - Path to the subagent file
     * @returns SubagentConfig
     * @throws SubagentError if parsing fails
     */
    parseSubagentFile(filePath: string, level: SubagentLevel): Promise<SubagentConfig>;
    /**
     * Parses subagent content from a string.
     *
     * @param content - File content
     * @param filePath - File path for error reporting
     * @returns SubagentConfig
     * @throws SubagentError if parsing fails
     */
    parseSubagentContent(content: string, filePath: string, level: SubagentLevel): SubagentConfig;
    /**
     * Serializes a subagent configuration to Markdown format.
     *
     * @param config - Configuration to serialize
     * @returns Markdown content with YAML frontmatter
     */
    serializeSubagent(config: SubagentConfig): string;
    /**
     * Creates a SubAgentScope from a subagent configuration.
     *
     * @param config - Subagent configuration
     * @param runtimeContext - Runtime context
     * @returns Promise resolving to SubAgentScope
     */
    createSubagentScope(config: SubagentConfig, runtimeContext: Config, options?: {
        eventEmitter?: import("./subagent-events.js").SubAgentEventEmitter;
        hooks?: import("./subagent-hooks.js").SubagentHooks;
    }): Promise<SubAgentScope>;
    /**
     * Converts a file-based SubagentConfig to runtime configuration
     * compatible with SubAgentScope.create().
     *
     * @param config - File-based subagent configuration
     * @returns Runtime configuration for SubAgentScope
     */
    convertToRuntimeConfig(config: SubagentConfig): SubagentRuntimeConfig;
    /**
     * Transforms a tools array that may contain tool names or display names
     * into an array containing only tool names.
     *
     * @param tools - Array of tool names or display names
     * @returns Array of tool names
     * @private
     */
    private transformToToolNames;
    /**
     * Merges partial configurations with defaults, useful for updating
     * existing configurations.
     *
     * @param base - Base configuration
     * @param updates - Partial updates to apply
     * @returns New configuration with updates applied
     */
    mergeConfigurations(base: SubagentConfig, updates: Partial<SubagentConfig>): SubagentConfig;
    /**
     * Gets the file path for a subagent at a specific level.
     *
     * @param name - Subagent name
     * @param level - Storage level
     * @returns Absolute file path
     */
    getSubagentPath(name: string, level: SubagentLevel): string;
    /**
     * Lists subagent files at a specific level.
     * Handles both builtin agents and file-based agents.
     *
     * @param level - Storage level to scan
     * @returns Array of subagent configurations
     */
    private listSubagentsAtLevel;
    /**
     * Finds a subagent by name at a specific level by scanning all files.
     * This method ensures we find subagents even if the filename doesn't match the name.
     *
     * @param name - Name of the subagent to find
     * @param level - Storage level to search
     * @returns SubagentConfig or null if not found
     */
    private findSubagentByNameAtLevel;
    /**
     * Validates that a subagent name is available (not already in use).
     *
     * @param name - Name to check
     * @param level - Level to check, or undefined to check both
     * @returns True if name is available
     */
    isNameAvailable(name: string, level?: SubagentLevel): Promise<boolean>;
}
