/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * @fileoverview Subagents Phase 1 implementation - File-based configuration layer
 *
 * This module provides the foundation for the subagents feature by implementing
 * a file-based configuration system that builds on the existing SubAgentScope
 * runtime system. It includes:
 *
 * - Type definitions for file-based subagent configurations
 * - Validation system for configuration integrity
 * - Runtime conversion functions integrated into the manager
 * - Manager class for CRUD operations on subagent files
 *
 * The implementation follows the Markdown + YAML frontmatter format , with storage at both project and user levels.
 */
export type { SubagentConfig, SubagentLevel, SubagentRuntimeConfig, ValidationResult, ListSubagentsOptions, CreateSubagentOptions, SubagentErrorCode, } from "./types.js";
export { SubagentError } from "./types.js";
export { BuiltinAgentRegistry } from "./builtin-agents.js";
export { SubagentValidator } from "./validation.js";
export { SubagentManager } from "./subagent-manager.js";
export type { PromptConfig, ModelConfig, RunConfig, ToolConfig, SubagentTerminateMode, } from "./types.js";
export { SubAgentScope } from "./subagent.js";
export type { SubAgentEvent, SubAgentStartEvent, SubAgentRoundEvent, SubAgentStreamTextEvent, SubAgentToolCallEvent, SubAgentToolResultEvent, SubAgentFinishEvent, SubAgentErrorEvent, } from "./subagent-events.js";
export { SubAgentEventEmitter } from "./subagent-events.js";
export type { SubagentStatsSummary, ToolUsageStats, } from "./subagent-statistics.js";
