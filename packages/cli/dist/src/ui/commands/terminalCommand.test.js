/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
const mockTerminalSessionService = vi.hoisted(() => ({
    list: vi.fn(),
    attachInteractive: vi.fn(),
}));
vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        terminalSessionService: mockTerminalSessionService,
    };
});
import { terminalCommand } from "./terminalCommand.js";
const runningSession = {
    id: "term_1",
    name: "bunny-ssh",
    backend: "pty",
    running: true,
    lastLine: "root@bunny:~#",
};
describe("terminalCommand", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTerminalSessionService.list.mockReturnValue([runningSession]);
        mockTerminalSessionService.attachInteractive.mockResolvedValue(undefined);
    });
    it("lists interactive terminal sessions", async () => {
        const result = await terminalCommand.action?.(createMockCommandContext(), "list");
        expect(result).toEqual(expect.objectContaining({
            type: "message",
            messageType: "info",
        }));
        expect(result && "content" in result ? result.content : "").toContain("term_1");
        expect(result && "content" in result ? result.content : "").toContain("root@bunny:~#");
    });
    it("attaches to the only running session when no id is provided", async () => {
        const originalStdinTty = process.stdin.isTTY;
        const originalStdoutTty = process.stdout.isTTY;
        const context = createMockCommandContext();
        Object.defineProperty(process.stdin, "isTTY", {
            value: true,
            configurable: true,
        });
        Object.defineProperty(process.stdout, "isTTY", {
            value: true,
            configurable: true,
        });
        try {
            const result = await terminalCommand.action?.(context, "attach");
            expect(mockTerminalSessionService.attachInteractive).toHaveBeenCalledWith("term_1", {
                input: process.stdin,
                output: process.stdout,
            });
            expect(result).toEqual(expect.objectContaining({
                type: "message",
                messageType: "info",
                content: "Detached from terminal session term_1.",
            }));
            expect(context.ui.refreshStatic).toHaveBeenCalledOnce();
        }
        finally {
            Object.defineProperty(process.stdin, "isTTY", {
                value: originalStdinTty,
                configurable: true,
            });
            Object.defineProperty(process.stdout, "isTTY", {
                value: originalStdoutTty,
                configurable: true,
            });
        }
    });
    it("requires a session id when multiple sessions are running", async () => {
        mockTerminalSessionService.list.mockReturnValue([
            runningSession,
            { ...runningSession, id: "term_2" },
        ]);
        const result = await terminalCommand.action?.(createMockCommandContext(), "attach");
        expect(result).toEqual(expect.objectContaining({
            type: "message",
            messageType: "error",
        }));
        expect(result && "content" in result ? result.content : "").toContain("Multiple terminal sessions");
        expect(mockTerminalSessionService.attachInteractive).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=terminalCommand.test.js.map