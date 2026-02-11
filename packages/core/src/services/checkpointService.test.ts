/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Config } from "../config/config.js";
import { CheckpointService, type CheckpointMessage } from "./checkpointService.js";
import * as fs from "node:fs";
import * as path from "node:path";

describe("CheckpointService", () => {
  let checkpointService: CheckpointService;
  let mockConfig: Config;
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test to avoid race conditions
    const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substr(2);
    tempDir = fs.mkdtempSync(path.join("/tmp", "checkpoint-test-" + uniqueSuffix + "-"));
    
    mockConfig = {
      getSessionId: () => "test-session-id",
      getProjectRoot: () => tempDir,
      storage: {
        getProjectTempDir: () => path.join(tempDir, ".gemini", "tmp"),
      },
      getModel: () => "gemini-1.5-flash",
    } as unknown as Config;

    checkpointService = new CheckpointService(mockConfig);
  });

  afterEach(() => {
    // Clean up temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_err) {
      // Ignore cleanup errors
    }
  });

  it("should save and load a checkpoint", () => {
    const messages: CheckpointMessage[] = [
      {
        id: "msg-1",
        timestamp: new Date().toISOString(),
        type: "user",
        content: "Hello, how are you?",
      },
      {
        id: "msg-2",
        timestamp: new Date().toISOString(),
        type: "gemini",
        content: "I'm doing well, thank you!",
      },
    ];

    const checkpointId = checkpointService.saveCheckpoint(messages);
    
    expect(checkpointId).toMatch(/^checkpoint-/);

    const loaded = checkpointService.loadCheckpoint(checkpointId);
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded?.messages[0].content).toBe("Hello, how are you?");
    expect(loaded?.messages[1].content).toBe("I'm doing well, thank you!");
  });

  it("should persist context snapshot with full client history", () => {
    const messages: CheckpointMessage[] = [
      {
        id: "msg-1",
        timestamp: new Date().toISOString(),
        type: "user",
        content: "Continue this conversation",
      },
    ];

    const checkpointId = checkpointService.saveCheckpoint(messages, {
      clientHistory: [
        { role: "user", parts: [{ text: "Continue this conversation" }] },
        { role: "model", parts: [{ text: "Sure, let's continue." }] },
      ],
      promptTokenCount: 1234,
      currentContextTokenCount: 2345,
      model: "gemini-2.5-pro",
    });

    const loaded = checkpointService.loadCheckpoint(checkpointId);
    expect(loaded).not.toBeNull();
    expect(loaded?.contextSnapshot).toBeDefined();
    expect(loaded?.contextSnapshot?.clientHistory).toHaveLength(2);
    expect(loaded?.contextSnapshot?.promptTokenCount).toBe(1234);
    expect(loaded?.contextSnapshot?.currentContextTokenCount).toBe(2345);
    expect(loaded?.contextSnapshot?.model).toBe("gemini-2.5-pro");
  });

  it("should list checkpoints in chronological order (newest first)", () => {
    // Save multiple checkpoints with different timestamps
    const messages: CheckpointMessage[] = [
      { id: "msg-1", timestamp: new Date().toISOString(), type: "user", content: "First" },
    ];

    checkpointService.saveCheckpoint(messages);
    
    // Wait a bit to ensure different timestamps (use longer delay for CI)
    sleep(200);

    const messages2: CheckpointMessage[] = [
      { id: "msg-2", timestamp: new Date().toISOString(), type: "user", content: "Second" },
    ];
    checkpointService.saveCheckpoint(messages2);

    const checkpoints = checkpointService.listCheckpoints();
    
    expect(checkpoints).toHaveLength(2);
    // Newest first
    expect(checkpoints[0].messages[0].content).toBe("Second");
    expect(checkpoints[1].messages[0].content).toBe("First");
  });

  it("should delete a checkpoint", () => {
    const messages: CheckpointMessage[] = [
      { id: "msg-1", timestamp: new Date().toISOString(), type: "user", content: "To delete" },
    ];

    const checkpointId = checkpointService.saveCheckpoint(messages);
    
    // Verify it exists
    expect(checkpointService.loadCheckpoint(checkpointId)).not.toBeNull();

    // Delete it
    const deleted = checkpointService.deleteCheckpoint(checkpointId);
    expect(deleted).toBe(true);

    // Verify it's gone
    expect(checkpointService.loadCheckpoint(checkpointId)).toBeNull();
  });

  it("should return null for non-existent checkpoint", () => {
    const result = checkpointService.loadCheckpoint("non-existent-checkpoint");
    expect(result).toBeNull();
  });

  it("should format checkpoints for display", () => {
    const messages: CheckpointMessage[] = [
      { id: "msg-1", timestamp: new Date().toISOString(), type: "user", content: "Hello" },
      { id: "msg-2", timestamp: new Date().toISOString(), type: "gemini", content: "Hi there! How can I help you today?" },
    ];

    checkpointService.saveCheckpoint(messages);
    
    const checkpoints = checkpointService.listCheckpoints();
    expect(checkpoints).toHaveLength(1);

    const formatted = checkpointService.formatCheckpoint(checkpoints[0]);
    expect(formatted).toContain("2 messages");
    expect(formatted).toContain("Hello");
  });

  it("should handle empty message list", () => {
    const messages: CheckpointMessage[] = [];

    const checkpointId = checkpointService.saveCheckpoint(messages);
    
    const loaded = checkpointService.loadCheckpoint(checkpointId);
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(0);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
