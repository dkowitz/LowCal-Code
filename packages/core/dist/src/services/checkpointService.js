/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
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
    projectRoot;
    sessionId;
    constructor(config) {
        this.projectRoot = config.getProjectRoot();
        this.sessionId = config.getSessionId();
    }
    /**
     * Gets the directory where checkpoints are stored for this workspace.
     */
    getCheckpointsDir() {
        const lowcalDir = path.join(this.projectRoot, ".lowcal");
        const checkpointsDir = path.join(lowcalDir, "checkpoints");
        return checkpointsDir;
    }
    /**
     * Ensures the checkpoints directory exists.
     */
    ensureDirectoryExists() {
        fs.mkdirSync(this.getCheckpointsDir(), { recursive: true });
    }
    /**
     * Saves a checkpoint with the given messages.
     * @param messages The conversation messages to save
     * @returns The ID of the saved checkpoint
     */
    saveCheckpoint(messages, contextSnapshot) {
        this.ensureDirectoryExists();
        const checkpointId = `checkpoint-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const filePath = path.join(this.getCheckpointsDir(), `${checkpointId}.json`);
        const checkpoint = {
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
    loadCheckpoint(checkpointId) {
        const filePath = path.join(this.getCheckpointsDir(), `${checkpointId}.json`);
        try {
            const data = fs.readFileSync(filePath, "utf-8");
            return JSON.parse(data);
        }
        catch (error) {
            if (error.code === "ENOENT") {
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
    loadCheckpointByIndex(index) {
        const checkpoints = this.listCheckpoints();
        if (index < 0 || index >= checkpoints.length) {
            return null;
        }
        return this.loadCheckpoint(checkpoints[index].id);
    }
    /**
     * Lists all checkpoints for this workspace, sorted chronologically (newest first).
     */
    listCheckpoints() {
        const dir = this.getCheckpointsDir();
        if (!fs.existsSync(dir)) {
            return [];
        }
        try {
            const files = fs.readdirSync(dir);
            const checkpoints = [];
            for (const file of files) {
                if (file.startsWith("checkpoint-") && file.endsWith(".json")) {
                    const filePath = path.join(dir, file);
                    try {
                        const data = fs.readFileSync(filePath, "utf-8");
                        const checkpoint = JSON.parse(data);
                        // Only include checkpoints for this project
                        if (checkpoint.projectRoot === this.projectRoot) {
                            checkpoints.push(checkpoint);
                        }
                    }
                    catch (error) {
                        console.error(`Failed to read checkpoint file ${file}:`, error);
                    }
                }
            }
            // Sort by createdAt descending (newest first)
            // Use checkpoint ID as tiebreaker since it includes timestamp
            checkpoints.sort((a, b) => {
                const timeA = new Date(a.createdAt).getTime();
                const timeB = new Date(b.createdAt).getTime();
                if (timeA !== timeB)
                    return timeB - timeA;
                // If timestamps are equal, sort by ID (newer IDs come first)
                return b.id.localeCompare(a.id);
            });
            return checkpoints;
        }
        catch (error) {
            console.error("Failed to list checkpoints:", error);
            return [];
        }
    }
    /**
     * Deletes a checkpoint by its ID.
     * @param checkpointId The ID of the checkpoint to delete
     * @returns true if deleted, false if not found
     */
    deleteCheckpoint(checkpointId) {
        const filePath = path.join(this.getCheckpointsDir(), `${checkpointId}.json`);
        try {
            fs.unlinkSync(filePath);
            return true;
        }
        catch (error) {
            if (error.code === "ENOENT") {
                return false;
            }
            console.error(`Failed to delete checkpoint ${checkpointId}:`, error);
            return false;
        }
    }
    /**
     * Gets the number of saved checkpoints.
     */
    getCheckpointCount() {
        return this.listCheckpoints().length;
    }
    /**
     * Formats a checkpoint for display.
     */
    formatCheckpoint(checkpoint) {
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
            }
            else if (firstMsg.type === "gemini") {
                preview = `${firstPreview}${more}...`;
            }
        }
        return `[${messageCount} messages] ${dateString}${preview ? ` - ${preview}` : ""}`;
    }
}
//# sourceMappingURL=checkpointService.js.map