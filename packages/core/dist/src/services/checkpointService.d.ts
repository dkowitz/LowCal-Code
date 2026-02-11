/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { Content, PartListUnion } from "@google/genai";
/**
 * A single message in a checkpoint.
 */
export interface CheckpointMessage {
    id: string;
    timestamp: string;
    type: "user" | "gemini";
    content: string;
    toolCalls?: CheckpointToolCall[];
}
/**
 * A tool call within a checkpoint message.
 */
export interface CheckpointToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
    result?: PartListUnion | null;
}
/**
 * Complete conversation checkpoint stored at workspace level.
 */
export interface CheckpointRecord {
    id: string;
    sessionId: string;
    projectRoot: string;
    createdAt: string;
    lastUpdated: string;
    messages: CheckpointMessage[];
    contextSnapshot?: CheckpointContextSnapshot;
}
/**
 * Serialized runtime context used to faithfully continue a resumed conversation.
 */
export interface CheckpointContextSnapshot {
    /**
     * Full Gemini client conversation context, including structured/tool parts.
     */
    clientHistory: Content[];
    /**
     * Last known prompt token count used by the UI context indicator.
     */
    promptTokenCount?: number;
    /**
     * Optional cumulative context token estimate from telemetry.
     */
    currentContextTokenCount?: number;
    /**
     * Model active when checkpoint was created.
     */
    model?: string;
}
/**
 * Service for automatically saving and loading conversation checkpoints
 * at the workspace level (.lowcal/checkpoints/).
 *
 * This service provides silent checkpoint management that:
 * - Saves after every LLM completion
 * - Lists checkpoints chronologically (newest first)
 * - Loads full sessions from checkpoints
 */
export declare class CheckpointService {
    private projectRoot;
    private sessionId;
    constructor(config: Config);
    /**
     * Gets the directory where checkpoints are stored for this workspace.
     */
    private getCheckpointsDir;
    /**
     * Ensures the checkpoints directory exists.
     */
    private ensureDirectoryExists;
    /**
     * Saves a checkpoint with the given messages.
     * @param messages The conversation messages to save
     * @returns The ID of the saved checkpoint
     */
    saveCheckpoint(messages: CheckpointMessage[], contextSnapshot?: CheckpointContextSnapshot): string;
    /**
     * Loads a checkpoint by its ID.
     * @param checkpointId The ID of the checkpoint to load
     * @returns The checkpoint record, or null if not found
     */
    loadCheckpoint(checkpointId: string): CheckpointRecord | null;
    /**
     * Loads a checkpoint by its index in the chronological list.
     * @param index The index (0 = newest)
     * @returns The checkpoint record, or null if not found
     */
    loadCheckpointByIndex(index: number): CheckpointRecord | null;
    /**
     * Lists all checkpoints for this workspace, sorted chronologically (newest first).
     */
    listCheckpoints(): CheckpointRecord[];
    /**
     * Deletes a checkpoint by its ID.
     * @param checkpointId The ID of the checkpoint to delete
     * @returns true if deleted, false if not found
     */
    deleteCheckpoint(checkpointId: string): boolean;
    /**
     * Gets the number of saved checkpoints.
     */
    getCheckpointCount(): number;
    /**
     * Formats a checkpoint for display.
     */
    formatCheckpoint(checkpoint: CheckpointRecord): string;
}
