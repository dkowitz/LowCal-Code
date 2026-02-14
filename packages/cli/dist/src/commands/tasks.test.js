/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import yargs from "yargs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tasksCommand } from "./tasks.js";
const spawnMock = vi.fn();
const listTemplatesMock = vi.fn();
const launchValidateMock = vi.fn();
const scheduleValidateMock = vi.fn();
vi.mock("node:child_process", () => ({
    spawn: (...args) => spawnMock(...args),
    default: {
        spawn: (...args) => spawnMock(...args),
    },
}));
vi.mock("@qwen-code/qwen-code-core", () => ({
    TaskTemplateManager: vi.fn().mockImplementation(() => ({
        listTemplates: listTemplatesMock,
    })),
    LaunchTaskTool: vi.fn().mockImplementation(() => ({
        validateBuildAndExecute: launchValidateMock,
    })),
    ScheduleTaskTool: vi.fn().mockImplementation(() => ({
        validateBuildAndExecute: scheduleValidateMock,
    })),
}));
function mockSuccessfulSpawn(exitCode = 0) {
    spawnMock.mockImplementation(() => {
        const handlers = new Map();
        return {
            once: (event, cb) => {
                handlers.set(event, cb);
                if (event === "close") {
                    setTimeout(() => cb(exitCode), 0);
                }
            },
        };
    });
}
describe("tasksCommand", () => {
    const originalStdInTty = process.stdin.isTTY;
    const originalStdOutTty = process.stdout.isTTY;
    beforeEach(() => {
        vi.clearAllMocks();
        listTemplatesMock.mockResolvedValue([]);
        launchValidateMock.mockResolvedValue({
            llmContent: "ok",
            returnDisplay: "launch-success",
        });
        scheduleValidateMock.mockResolvedValue({
            llmContent: "ok",
            returnDisplay: "schedule-success",
        });
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: true,
        });
        Object.defineProperty(process.stdout, "isTTY", {
            configurable: true,
            value: true,
        });
        mockSuccessfulSpawn(0);
    });
    afterEach(() => {
        Object.defineProperty(process.stdin, "isTTY", {
            configurable: true,
            value: originalStdInTty,
        });
        Object.defineProperty(process.stdout, "isTTY", {
            configurable: true,
            value: originalStdOutTty,
        });
    });
    it("has expected command metadata", () => {
        expect(tasksCommand.command).toBe("tasks");
        expect(tasksCommand.describe).toContain("task templates");
        expect(typeof tasksCommand.handler).toBe("function");
    });
    it("lists templates", async () => {
        listTemplatesMock.mockResolvedValue([
            { id: "vision", level: "project", name: "Vision OCR" },
            { id: "compress", level: "user" },
        ]);
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        const parser = yargs([]).command(tasksCommand);
        await parser.parseAsync("tasks list");
        expect(logSpy).toHaveBeenCalledWith("Task templates (2):");
        expect(logSpy).toHaveBeenCalledWith('- vision [project] name="Vision OCR"');
        expect(logSpy).toHaveBeenCalledWith("- compress [user]");
    });
    it("runs template using launch_task tool", async () => {
        const parser = yargs([]).command(tasksCommand);
        await parser.parseAsync("tasks run vision --level user --id vision-run");
        expect(launchValidateMock).toHaveBeenCalledWith({
            action: "create",
            id: "vision-run",
            template_id: "vision",
            template_level: "user",
        }, expect.any(AbortSignal));
    });
    it("schedules template using schedule_task tool", async () => {
        const parser = yargs([]).command(tasksCommand);
        await parser.parseAsync([
            "tasks",
            "schedule",
            "compress",
            "0 2 * * *",
            "--id",
            "nightly",
            "--level",
            "project",
        ]);
        expect(scheduleValidateMock).toHaveBeenCalledWith({
            action: "create",
            id: "nightly",
            schedule: "0 2 * * *",
            template_id: "compress",
            template_level: "project",
        }, expect.any(AbortSignal));
    });
    it("opens interactive editor for tasks open", async () => {
        const parser = yargs([]).command(tasksCommand);
        await parser.parseAsync("tasks open");
        expect(spawnMock).toHaveBeenCalled();
        const call = spawnMock.mock.calls[0];
        expect(call?.[1]).toEqual(expect.arrayContaining(["--prompt-interactive", "/tasks"]));
    });
});
//# sourceMappingURL=tasks.test.js.map