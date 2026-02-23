/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mockGetSession = vi.fn();
const mockListSessions = vi.fn();
vi.mock("../sessions/session-store.js", () => ({
    getSession: (...args) => mockGetSession(...args),
    listSessions: (...args) => mockListSessions(...args),
}));
import { ReadSessionsTool } from "./read-sessions.js";
describe("ReadSessionsTool", () => {
    let tool;
    beforeEach(() => {
        tool = new ReadSessionsTool();
        mockGetSession.mockReset();
        mockListSessions.mockReset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-23T12:00:00.000Z"));
    });
    afterEach(() => {
        vi.useRealTimers();
    });
    it("lists active sessions by default and excludes stale sessions", async () => {
        const nowIso = new Date().toISOString();
        const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const sessions = [
            {
                id: "session-working",
                pid: 101,
                mode: "tui",
                cwd: "/repo/a",
                started_at: nowIso,
                last_seen: nowIso,
                status: "working",
            },
            {
                id: "session-idle",
                pid: 102,
                mode: "headless",
                cwd: "/repo/b",
                started_at: nowIso,
                last_seen: nowIso,
                status: "idle",
            },
            {
                id: "session-stale",
                pid: 103,
                mode: "headless",
                cwd: "/repo/c",
                started_at: staleIso,
                last_seen: staleIso,
                status: "idle",
            },
        ];
        mockListSessions.mockResolvedValue(sessions);
        const invocation = tool.build({ action: "list" });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        expect(result.returnDisplay).toContain("Sessions (2 active)");
        expect(result.returnDisplay).toContain("session-working");
        expect(result.returnDisplay).toContain("session-idle");
        expect(result.returnDisplay).not.toContain("session-stale");
    });
    it("can include stale sessions in list mode", async () => {
        const nowIso = new Date().toISOString();
        const staleIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        mockListSessions.mockResolvedValue([
            {
                id: "session-active",
                pid: 201,
                mode: "tui",
                cwd: "/repo/active",
                started_at: nowIso,
                last_seen: nowIso,
                status: "working",
            },
            {
                id: "session-stale",
                pid: 202,
                mode: "headless",
                cwd: "/repo/stale",
                started_at: staleIso,
                last_seen: staleIso,
                status: "idle",
            },
        ]);
        const invocation = tool.build({ action: "list", include_stale: true });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        expect(result.returnDisplay).toContain("Sessions (2 total)");
        expect(result.returnDisplay).toContain("session-stale");
        expect(result.returnDisplay).toContain("[STALE]");
    });
    it("returns a full JSON record for get action", async () => {
        mockGetSession.mockResolvedValue({
            id: "session-abc",
            pid: 999,
            mode: "headless",
            cwd: "/repo",
            started_at: "2026-02-23T11:00:00.000Z",
            last_seen: "2026-02-23T11:59:30.000Z",
            status: "working",
            details: { job_id: "job-1" },
        });
        const invocation = tool.build({ action: "get", session_id: "session-abc" });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        expect(result.returnDisplay).toContain('"id": "session-abc"');
        expect(result.returnDisplay).toContain('"job_id": "job-1"');
    });
    it("returns an error when get action is missing session_id", async () => {
        const invocation = tool.build({ action: "get" });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error?.message).toContain('session_id is required for action="get".');
    });
    it("returns an error for excessive list limit", async () => {
        const invocation = tool.build({ action: "list", limit: 999 });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error?.message).toContain("limit must be <= 200.");
    });
});
//# sourceMappingURL=read-sessions.test.js.map