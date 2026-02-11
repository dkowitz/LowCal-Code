/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { resumeCommandGroup } from "./resumeCommand.js";
const { mockListCheckpoints, mockLoadCheckpoint, mockDeleteCheckpoint } = vi.hoisted(() => ({
    mockListCheckpoints: vi.fn(),
    mockLoadCheckpoint: vi.fn(),
    mockDeleteCheckpoint: vi.fn(),
}));
vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        CheckpointService: vi.fn().mockImplementation(() => ({
            listCheckpoints: mockListCheckpoints,
            loadCheckpoint: mockLoadCheckpoint,
            deleteCheckpoint: mockDeleteCheckpoint,
        })),
    };
});
describe("resumeCommandGroup", () => {
    let mockContext;
    const checkpointOne = {
        id: "checkpoint-1",
        sessionId: "abcdef123456",
        projectRoot: "/project/root",
        createdAt: "2026-02-10T10:00:00.000Z",
        lastUpdated: "2026-02-10T10:00:00.000Z",
        messages: [
            {
                id: "msg-1",
                timestamp: "2026-02-10T10:00:00.000Z",
                type: "user",
                content: "Hello",
            },
            {
                id: "msg-2",
                timestamp: "2026-02-10T10:00:01.000Z",
                type: "gemini",
                content: "Hi there",
            },
        ],
    };
    const checkpointTwo = {
        ...checkpointOne,
        id: "checkpoint-2",
        createdAt: "2026-02-10T10:01:00.000Z",
        lastUpdated: "2026-02-10T10:01:00.000Z",
        messages: [
            {
                id: "msg-3",
                timestamp: "2026-02-10T10:01:00.000Z",
                type: "user",
                content: "Second checkpoint",
            },
        ],
    };
    const checkpointWithSnapshot = {
        ...checkpointOne,
        id: "checkpoint-snapshot",
        contextSnapshot: {
            clientHistory: [
                { role: "user", parts: [{ text: "full user context" }] },
                {
                    role: "model",
                    parts: [{ text: "full model context with tools and structure" }],
                },
            ],
            promptTokenCount: 777,
            currentContextTokenCount: 1234,
            model: "gemini-2.5-pro",
        },
    };
    beforeEach(() => {
        vi.clearAllMocks();
        mockListCheckpoints.mockReturnValue([]);
        mockLoadCheckpoint.mockReturnValue(null);
        mockDeleteCheckpoint.mockReturnValue(false);
        mockContext = createMockCommandContext({
            services: {
                config: {
                    getProjectRoot: () => "/project/root",
                    getSessionId: () => "session-1",
                },
            },
        });
    });
    it("opens the resume dialog when no args are provided", async () => {
        const result = await resumeCommandGroup.action?.(mockContext, "");
        expect(result).toEqual({
            type: "dialog",
            dialog: "resume",
        });
    });
    it("loads a checkpoint when called with a checkpoint id", async () => {
        mockListCheckpoints.mockReturnValue([checkpointOne]);
        const result = await resumeCommandGroup.action?.(mockContext, checkpointOne.id);
        expect(result).toEqual({
            type: "load_history",
            history: [
                { type: "user", text: "Hello" },
                { type: "gemini", text: "Hi there" },
            ],
            clientHistory: [
                { role: "user", parts: [{ text: "Hello" }] },
                { role: "model", parts: [{ text: "Hi there" }] },
            ],
        });
    });
    it("prefers context snapshot client history and restores token context", async () => {
        mockListCheckpoints.mockReturnValue([checkpointWithSnapshot]);
        const result = await resumeCommandGroup.action?.(mockContext, checkpointWithSnapshot.id);
        expect(result).toEqual({
            type: "load_history",
            history: [
                { type: "user", text: "Hello" },
                { type: "gemini", text: "Hi there" },
            ],
            clientHistory: checkpointWithSnapshot.contextSnapshot.clientHistory,
            restoredContext: {
                promptTokenCount: 777,
            },
        });
    });
    it("loads a checkpoint when called with a checkpoint index", async () => {
        mockListCheckpoints.mockReturnValue([checkpointTwo, checkpointOne]);
        const result = await resumeCommandGroup.action?.(mockContext, "2");
        expect(result).toEqual({
            type: "load_history",
            history: [
                { type: "user", text: "Hello" },
                { type: "gemini", text: "Hi there" },
            ],
            clientHistory: [
                { role: "user", parts: [{ text: "Hello" }] },
                { role: "model", parts: [{ text: "Hi there" }] },
            ],
        });
    });
    it("returns an error when checkpoint id is not found", async () => {
        mockListCheckpoints.mockReturnValue([checkpointOne]);
        mockLoadCheckpoint.mockReturnValue(null);
        const result = await resumeCommandGroup.action?.(mockContext, "checkpoint-does-not-exist");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "Checkpoint not found: checkpoint-does-not-exist. Run /resume to choose an available checkpoint.",
        });
    });
    it("still supports the list subcommand", async () => {
        const listSubcommand = resumeCommandGroup.subCommands?.find((command) => command.name === "list");
        if (!listSubcommand?.action) {
            throw new Error("/resume list command not found.");
        }
        mockListCheckpoints.mockReturnValue([]);
        const result = await listSubcommand.action(mockContext, "");
        expect(result).toEqual({
            type: "message",
            messageType: "info",
            content: "No saved conversation checkpoints found.",
        });
    });
});
//# sourceMappingURL=resumeCommand.test.js.map