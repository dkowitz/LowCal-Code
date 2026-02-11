/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from "../config/config.js";
import type { Content, PartListUnion } from "@google/genai";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

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
export class CheckpointService {
  private projectRoot: string;
  private sessionId: string;

  constructor(config: Config) {
    this.projectRoot = config.getProjectRoot();
    this.sessionId = config.getSessionId();
  }

  /**
   * Gets the directory where checkpoints are stored for this workspace.
   */
  private getCheckpointsDir(): string {
    const lowcalDir = path.join(this.projectRoot, ".lowcal");
    const checkpointsDir = path.join(lowcalDir, "checkpoints");
    return checkpointsDir;
  }

  /**
   * Ensures the checkpoints directory exists.
   */
  private ensureDirectoryExists(): void {
    fs.mkdirSync(this.getCheckpointsDir(), { recursive: true });
  }

  /**
   * Saves a checkpoint with the given messages.
   * @param messages The conversation messages to save
   * @returns The ID of the saved checkpoint
   */
  saveCheckpoint(
    messages: CheckpointMessage[],
    contextSnapshot?: CheckpointContextSnapshot,
  ): string {
    this.ensureDirectoryExists();

    const checkpointId = `checkpoint-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const filePath = path.join(this.getCheckpointsDir(), `${checkpointId}.json`);

    const checkpoint: CheckpointRecord = {
      id: checkpointId,
      sessionId: this.sessionId,
      projectRoot: this.projectRoot,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      messages,
      ...(contextSnapshot ? { contextSnapshot } : {}),
    };

    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), "utf-8");

    return checkpointId;
  }

  /**
   * Loads a checkpoint by its ID.
   * @param checkpointId The ID of the checkpoint to load
   * @returns The checkpoint record, or null if not found
   */
  loadCheckpoint(checkpointId: string): CheckpointRecord | null {
    const filePath = path.join(this.getCheckpointsDir(), `${checkpointId}.json`);
    
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as CheckpointRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      console.error(`Failed to load checkpoint ${checkpointId}:`, error);
      return null;
    }
  }

  /**
   * Loads a checkpoint by its index in the chronological list.
   * @param index The index (0 = newest)
   * @returns The checkpoint record, or null if not found
   */
  loadCheckpointByIndex(index: number): CheckpointRecord | null {
    const checkpoints = this.listCheckpoints();
    if (index < 0 || index >= checkpoints.length) {
      return null;
    }
    return this.loadCheckpoint(checkpoints[index].id);
  }

  /**
   * Lists all checkpoints for this workspace, sorted chronologically (newest first).
   */
  listCheckpoints(): CheckpointRecord[] {
    const dir = this.getCheckpointsDir();
    
    if (!fs.existsSync(dir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(dir);
      const checkpoints: CheckpointRecord[] = [];

      for (const file of files) {
        if (file.startsWith("checkpoint-") && file.endsWith(".json")) {
          const filePath = path.join(dir, file);
          try {
            const data = fs.readFileSync(filePath, "utf-8");
            const checkpoint = JSON.parse(data) as CheckpointRecord;
            
            // Only include checkpoints for this project
            if (checkpoint.projectRoot === this.projectRoot) {
              checkpoints.push(checkpoint);
            }
          } catch (error) {
            console.error(`Failed to read checkpoint file ${file}:`, error);
          }
        }
      }

      // Sort by createdAt descending (newest first)
      // Use checkpoint ID as tiebreaker since it includes timestamp
      checkpoints.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        if (timeA !== timeB) return timeB - timeA;
        // If timestamps are equal, sort by ID (newer IDs come first)
        return b.id.localeCompare(a.id);
      });

      return checkpoints;
    } catch (error) {
      console.error("Failed to list checkpoints:", error);
      return [];
    }
  }

  /**
   * Deletes a checkpoint by its ID.
   * @param checkpointId The ID of the checkpoint to delete
   * @returns true if deleted, false if not found
   */
  deleteCheckpoint(checkpointId: string): boolean {
    const filePath = path.join(this.getCheckpointsDir(), `${checkpointId}.json`);
    
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      console.error(`Failed to delete checkpoint ${checkpointId}:`, error);
      return false;
    }
  }

  /**
   * Gets the number of saved checkpoints.
   */
  getCheckpointCount(): number {
    return this.listCheckpoints().length;
  }

  /**
   * Formats a checkpoint for display.
   */
  formatCheckpoint(checkpoint: CheckpointRecord): string {
    const date = new Date(checkpoint.createdAt);
    const dateString = date.toLocaleString();
    
    const messageCount = checkpoint.messages.length;
    if (messageCount === 0) {
      return `[Empty checkpoint] ${dateString}`;
    }
    
    // Show first and last messages
    const firstMsg = checkpoint.messages[0];
    const lastMsg = checkpoint.messages[checkpoint.messages.length - 1];
    
    let preview = "";
    if (firstMsg && lastMsg) {
      const firstPreview = firstMsg.content.substring(0, 30);
      const lastPreview = lastMsg.content.substring(0, 30);
      const more = firstMsg.content.length > 30 ? "..." : "";
      const lastMore = lastMsg.content.length > 30 ? "..." : "";
      
      if (firstMsg.type === "user" && lastMsg.type === "gemini") {
        preview = `You: "${firstPreview}${more}" → ${lastPreview}${lastMore}`;
      } else if (firstMsg.type === "gemini") {
        preview = `${firstPreview}${more}...`;
      }
    }

    return `[${messageCount} messages] ${dateString}${preview ? ` - ${preview}` : ""}`;
  }
}
