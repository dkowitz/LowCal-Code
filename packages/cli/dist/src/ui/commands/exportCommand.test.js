/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { vi, describe, it, expect, beforeEach, } from "vitest";
import { exportCommand } from "./exportCommand.js";
import { createMockLoggingController } from "../../test-utils/mockLoggingController.js";
vi.mock("node:fs", async () => {
    const actual = await vi.importActual("node:fs");
    return {
        ...actual,
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
    };
});
vi.mock("node:path", async () => {
    const actual = await vi.importActual("node:path");
    return {
        ...actual,
        join: vi.fn(() => "/mock/path/conversations/conversation.md"),
    };
});
describe("exportCommand", () => {
    let mockContext;
    let mockAddItem;
    let mockWriteFileSync;
    let mockMkdirSync;
    let mockPathJoin;
    let mockGetHistory;
    let mockConfig;
    let mockSettings;
    let mockGitService;
    let mockLogger;
    let mockSessionStats;
    let mockLogging;
    beforeEach(() => {
        mockAddItem = vi.fn();
        mockWriteFileSync = vi.fn();
        mockMkdirSync = vi.fn();
        mockPathJoin = vi.fn(() => "/mock/path/conversations/conversation.md");
        mockGetHistory = vi.fn();
        mockConfig = {
            getSessionId: vi.fn(() => "test-session-id"),
        };
        mockSettings = {};
        mockGitService = {};
        mockLogger = {};
        mockSessionStats = {
            sessionId: "test-session-id",
            sessionStartTime: new Date(),
            metrics: {},
            lastPromptTokenCount: 0,
            currentContextTokenCount: 0,
            promptCount: 0,
        };
        mockLogging = createMockLoggingController();
        vi.mocked(require("node:fs")).writeFileSync = mockWriteFileSync;
        vi.mocked(require("node:fs")).mkdirSync = mockMkdirSync;
        vi.mocked(require("node:path")).join = mockPathJoin;
        mockContext = {
            services: {
                config: mockConfig,
                settings: mockSettings,
                git: mockGitService,
                logger: mockLogger,
                logging: mockLogging,
            },
            ui: {
                addItem: mockAddItem,
                clear: vi.fn(),
                setDebugMessage: vi.fn(),
                pendingItem: null,
                setPendingItem: vi.fn(),
                loadHistory: vi.fn(),
                getHistory: mockGetHistory,
                toggleCorgiMode: vi.fn(),
                toggleVimEnabled: vi.fn(),
                setGeminiMdFileCount: vi.fn(),
                reloadCommands: vi.fn(),
            },
            session: {
                stats: mockSessionStats,
                sessionShellAllowlist: new Set(),
            },
        };
    });
    it("should have correct name and description", () => {
        expect(exportCommand.name).toBe("export");
        expect(exportCommand.description).toBe("save the current conversation to a markdown file in ./conversations. Options: [compact] (user/assistant only), [report] (first user + final assistant responses), [filename.md]");
    });
    it("should export full conversation with default filename to conversations dir", async () => {
        const mockHistory = [
            {
                id: 1,
                type: "user",
                text: "Hello, how are you?",
            },
            {
                id: 2,
                type: "gemini",
                text: "I am doing well, thank you!",
            },
        ];
        mockGetHistory.mockReturnValue(mockHistory);
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "");
        expect(mockContext.ui.getHistory).toHaveBeenCalled();
        expect(mockMkdirSync).toHaveBeenCalledWith("/mock/path/conversations", {
            recursive: true,
        });
        expect(mockWriteFileSync).toHaveBeenCalled();
        expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({
            type: "info",
            text: expect.stringContaining("✅ Conversation exported successfully to ./conversations/`conversation-"),
        }), expect.any(Number));
    });
    it("should handle compact option", async () => {
        const mockHistory = [
            { id: 1, type: "user", text: "User message" },
            { id: 2, type: "info", text: "Info" },
            { id: 3, type: "gemini", text: "Assistant response" },
            { id: 4, type: "error", text: "Error" },
        ];
        mockGetHistory.mockReturnValue(mockHistory);
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "compact");
        expect(mockWriteFileSync).toHaveBeenCalled();
        // Content should only include user and gemini items
        const content = mockWriteFileSync.mock.calls[0][1];
        expect(content).toContain("User message");
        expect(content).toContain("Assistant response");
        expect(content).not.toContain("Info");
        expect(content).not.toContain("Error");
        expect(content).toContain("**Mode:** compact");
    });
    it("should handle report option", async () => {
        const mockHistory = [
            { id: 1, type: "user", text: "First user message" },
            { id: 2, type: "gemini", text: "Early response" },
            { id: 3, type: "user", text: "Last user message" },
            { id: 4, type: "info", text: "Info after last user" },
            { id: 5, type: "gemini", text: "Final report part 1" },
            { id: 6, type: "gemini_content", text: "Final report part 2" },
        ];
        mockGetHistory.mockReturnValue(mockHistory);
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "report");
        expect(mockWriteFileSync).toHaveBeenCalled();
        const content = mockWriteFileSync.mock.calls[0][1];
        expect(content).toContain("First user message");
        expect(content).toContain("Final report part 1");
        expect(content).toContain("Final report part 2");
        expect(content).not.toContain("Early response");
        expect(content).not.toContain("Last user message"); // Only first user
        expect(content).not.toContain("Info after last user"); // Non-assistant after last non-assistant, but we filter to assistants only after
        expect(content).toContain("**Mode:** report");
    });
    it("should handle invalid option", async () => {
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "invalid");
        expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({
            type: "error",
            text: expect.stringContaining("Invalid option 'invalid'"),
        }), expect.any(Number));
        expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
    it("should handle no history", async () => {
        mockGetHistory.mockReturnValue([]);
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "");
        expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({
            type: "info",
            text: "No conversation history to export.",
        }), expect.any(Number));
        expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
    it("should handle custom filename with option", async () => {
        const mockHistory = [{ id: 1, type: "user", text: "Test" }];
        mockGetHistory.mockReturnValue(mockHistory);
        mockPathJoin.mockReturnValue("/mock/path/reports/my-report.md");
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "report my-report.md");
        expect(mockMkdirSync).toHaveBeenCalledWith("/mock/path/reports", { recursive: true });
        expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({
            type: "info",
            text: expect.stringContaining("✅ Conversation exported successfully to ./reports/`my-report.md`"),
        }), expect.any(Number));
    });
    it("should handle export error", async () => {
        const mockHistory = [{ id: 1, type: "user", text: "Test" }];
        mockGetHistory.mockReturnValue(mockHistory);
        mockWriteFileSync.mockImplementation(() => {
            throw new Error("Permission denied");
        });
        const action = exportCommand.action;
        if (!action) {
            throw new Error("export command action is undefined");
        }
        await action(mockContext, "");
        expect(mockAddItem).toHaveBeenCalledWith(expect.objectContaining({
            type: "error",
            text: expect.stringContaining("❌ Failed to export conversation: Permission denied"),
        }), expect.any(Number));
    });
});
//# sourceMappingURL=exportCommand.test.js.map