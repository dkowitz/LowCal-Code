/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
const mockTerminalSessionService = vi.hoisted(() => ({
    open: vi.fn(),
    send: vi.fn(),
    read: vi.fn(),
    wait: vi.fn(),
    list: vi.fn(),
    close: vi.fn(),
    getTranscriptCursor: vi.fn(),
    getOutputSinceCursor: vi.fn(),
}));
vi.mock("../services/terminalSessionService.js", async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        terminalSessionService: mockTerminalSessionService,
    };
});
import { InteractiveTerminalTool } from "./terminal.js";
const snapshot = {
    id: "term_1",
    name: "python",
    backend: "pty",
    pid: 123,
    cwd: "/workspace",
    cols: 80,
    rows: 24,
    running: true,
    screen: ">>>",
    recentOutput: ">>>",
    lastLine: ">>>",
    outputVersion: 1,
};
describe("InteractiveTerminalTool", () => {
    const config = {
        getTargetDir: vi.fn(() => process.cwd()),
    };
    beforeEach(() => {
        vi.clearAllMocks();
        mockTerminalSessionService.open.mockResolvedValue(snapshot);
        mockTerminalSessionService.send.mockResolvedValue({
            ...snapshot,
            recentOutput: ">>> print(1)\n1",
            screen: "1\n>>>",
            lastLine: ">>>",
            outputVersion: 2,
        });
        mockTerminalSessionService.read.mockResolvedValue(snapshot);
        mockTerminalSessionService.wait.mockResolvedValue({
            snapshot: {
                ...snapshot,
                recentOutput: ">>> print(1)\n1\n>>>",
                screen: "1\n>>>",
                lastLine: ">>>",
                outputVersion: 3,
            },
            matched: true,
            reason: "condition_met",
            condition: "idle",
            outputSinceStart: " print(1)\n1\n>>>",
        });
        mockTerminalSessionService.list.mockReturnValue([snapshot]);
        mockTerminalSessionService.close.mockResolvedValue({
            ...snapshot,
            running: false,
            exitCode: 0,
        });
        mockTerminalSessionService.getTranscriptCursor.mockReturnValue({
            outputVersion: 1,
            recentOutput: ">>>",
        });
        mockTerminalSessionService.getOutputSinceCursor.mockReturnValue(" print(1)\r\n1\u0007");
    });
    it("opens a persistent terminal session", async () => {
        const tool = new InteractiveTerminalTool(config);
        const result = await tool
            .build({
            action: "open",
            command: "python",
            backend: "pty",
            cols: 80,
            rows: 24,
        })
            .execute(new AbortController().signal);
        expect(mockTerminalSessionService.open).toHaveBeenCalledWith({
            command: "python",
            cwd: process.cwd(),
            cols: 80,
            rows: 24,
            backend: "pty",
            name: undefined,
        });
        expect(result.llmContent).toContain("Session: term_1");
        expect(result.llmContent).toContain("Visible Screen:\n>>>");
    });
    it("sends input to an existing terminal session", async () => {
        const tool = new InteractiveTerminalTool(config);
        const result = await tool
            .build({
            action: "send",
            session_id: "term_1",
            input: "print(1)",
            append_enter: true,
        })
            .execute(new AbortController().signal);
        expect(mockTerminalSessionService.send).toHaveBeenCalledWith("term_1", {
            input: "print(1)",
            appendEnter: true,
            sensitiveInput: false,
            settleMs: undefined,
        });
        expect(result.llmContent).toContain("New Output Since Action:\n print(1)");
        expect(result.llmContent).not.toContain("\r");
        expect(result.llmContent).not.toContain("\u0007");
        expect(result.llmContent).not.toContain("Recent Transcript:");
    });
    it("sends input and waits for a terminal condition", async () => {
        const tool = new InteractiveTerminalTool(config);
        const updateOutput = vi.fn();
        const waitFor = { type: "idle", timeoutMs: 1000, idleMs: 200 };
        const result = await tool
            .build({
            action: "send",
            session_id: "term_1",
            input: "print(1)",
            append_enter: true,
            wait_for: waitFor,
        })
            .execute(new AbortController().signal, updateOutput);
        expect(mockTerminalSessionService.wait).toHaveBeenCalledWith("term_1", expect.objectContaining(waitFor), expect.any(Function), { outputVersion: 1, recentOutput: ">>>" });
        expect(updateOutput).toHaveBeenCalled();
        expect(result.llmContent).toContain("Wait: matched");
        expect(result.llmContent).toContain("Condition: idle");
    });
    it("waits for, lists, reads, and closes terminal sessions", async () => {
        const tool = new InteractiveTerminalTool(config);
        const waitResult = await tool
            .build({
            action: "wait",
            session_id: "term_1",
            wait_for: { type: "regex", pattern: ">>>", timeoutMs: 1000 },
        })
            .execute(new AbortController().signal);
        const listResult = await tool
            .build({ action: "list" })
            .execute(new AbortController().signal);
        await tool
            .build({ action: "read", session_id: "term_1" })
            .execute(new AbortController().signal);
        const closeResult = await tool
            .build({ action: "close", session_id: "term_1" })
            .execute(new AbortController().signal);
        expect(mockTerminalSessionService.wait).toHaveBeenCalledWith("term_1", expect.objectContaining({
            type: "regex",
            pattern: ">>>",
            timeoutMs: 1000,
        }), expect.any(Function), { outputVersion: 1, recentOutput: ">>>" });
        expect(mockTerminalSessionService.read).toHaveBeenCalledWith("term_1");
        expect(mockTerminalSessionService.close).toHaveBeenCalledWith("term_1");
        expect(waitResult.llmContent).toContain("Wait: matched");
        expect(listResult.llmContent).toContain("Session: term_1");
        expect(closeResult.llmContent).toContain("Status: exited");
    });
    it("rejects invalid terminal parameters before execution", () => {
        const tool = new InteractiveTerminalTool(config);
        expect(() => tool.build({ action: "open", directory: "../outside" })).toThrow("Directory must stay inside the workspace root.");
        expect(() => tool.build({ action: "send", session_id: " " })).toThrow("session_id is required for this action.");
        expect(() => tool.build({
            action: "send",
            session_id: "term_1",
            input: "",
            wait_for: { type: "regex" },
        })).toThrow("wait_for.pattern is required");
        expect(() => tool.build({ action: "wait", session_id: "term_1" })).toThrow("wait_for is required for action=wait. Top-level type/pattern aliases are also accepted.");
    });
    it("accepts top-level wait aliases for action=wait", async () => {
        const tool = new InteractiveTerminalTool(config);
        await tool
            .build({
            action: "wait",
            session_id: "term_1",
            type: "regex",
            pattern: "(?i)password:",
            timeoutMs: 1000,
        })
            .execute(new AbortController().signal);
        expect(mockTerminalSessionService.wait).toHaveBeenCalledWith("term_1", {
            type: "regex",
            pattern: "(?i)password:",
            timeoutMs: 1000,
            idleMs: undefined,
            pollIntervalMs: undefined,
            freshOnly: undefined,
        }, expect.any(Function), { outputVersion: 1, recentOutput: ">>>" });
    });
    it("redacts sensitive input when sending credentials", async () => {
        const tool = new InteractiveTerminalTool(config);
        await tool
            .build({
            action: "send",
            session_id: "term_1",
            input: "secret-password",
            append_enter: true,
            sensitive_input: true,
            settle_ms: 250,
        })
            .execute(new AbortController().signal);
        expect(mockTerminalSessionService.send).toHaveBeenCalledWith("term_1", {
            input: "secret-password",
            appendEnter: true,
            sensitiveInput: true,
            settleMs: 250,
        });
    });
    it("includes recent transcript only when explicitly requested", async () => {
        const tool = new InteractiveTerminalTool(config);
        const result = await tool
            .build({
            action: "read",
            session_id: "term_1",
            include_recent_transcript: true,
        })
            .execute(new AbortController().signal);
        expect(result.llmContent).toContain("Recent Transcript:\n>>>");
    });
    it("compacts long terminal output before returning it", async () => {
        mockTerminalSessionService.getOutputSinceCursor.mockReturnValue(`${"a".repeat(3000)}\n${"b".repeat(3000)}`);
        const tool = new InteractiveTerminalTool(config);
        const result = await tool
            .build({
            action: "send",
            session_id: "term_1",
            input: "large-output",
            append_enter: true,
            max_output_chars: 1000,
        })
            .execute(new AbortController().signal);
        expect(String(result.llmContent).length).toBeLessThan(2500);
        expect(result.llmContent).toContain("terminal output truncated");
    });
});
//# sourceMappingURL=terminal.test.js.map