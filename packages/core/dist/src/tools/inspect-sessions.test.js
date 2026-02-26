/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mockGetSession = vi.fn();
const mockListSessions = vi.fn();
const mockGetSessionStatusView = vi.fn();
const mockGetSessionContextSummary = vi.fn();
const mockGetSessionRecentHistory = vi.fn();
vi.mock("../sessions/session-store.js", () => ({
    getSession: (...args) => mockGetSession(...args),
    listSessions: (...args) => mockListSessions(...args),
}));
vi.mock("../sessions/session-api.js", () => ({
    getSessionStatusView: (...args) => mockGetSessionStatusView(...args),
    getSessionContextSummary: (...args) => mockGetSessionContextSummary(...args),
    getSessionRecentHistory: (...args) => mockGetSessionRecentHistory(...args),
}));
import { InspectSessionsTool } from "./inspect-sessions.js";
describe("InspectSessionsTool", () => {
    let tool;
    let processKillSpy;
    beforeEach(() => {
        tool = new InspectSessionsTool();
        mockGetSession.mockReset();
        mockListSessions.mockReset();
        mockGetSessionStatusView.mockReset();
        mockGetSessionContextSummary.mockReset();
        mockGetSessionRecentHistory.mockReset();
        processKillSpy = vi
            .spyOn(process, "kill")
            .mockImplementation(((..._args) => true));
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-02-24T12:00:00.000Z"));
    });
    afterEach(() => {
        processKillSpy.mockRestore();
        vi.useRealTimers();
    });
    it("inspects a target session with model/auth/history/error diagnostics", async () => {
        mockGetSession.mockResolvedValue({
            id: "session-alpha",
            pid: 4100,
            mode: "tui",
            cwd: "/repo",
            started_at: "2026-02-24T10:00:00.000Z",
            last_seen: "2026-02-24T11:59:00.000Z",
            status: "working",
            details: {
                auth_type: "qwen_oauth",
            },
            health: {
                state: "error",
                reason: "unhandled_error",
                confidence: 0.9,
                first_seen: "2026-02-24T11:58:00.000Z",
                last_seen: "2026-02-24T11:59:00.000Z",
            },
        });
        mockGetSessionStatusView.mockResolvedValue({
            id: "session-alpha",
            mode: "tui",
            pid: 4100,
            cwd: "/repo",
            status: "working",
            started_at: "2026-02-24T10:00:00.000Z",
            last_seen: "2026-02-24T11:59:00.000Z",
            uptime_ms: 7200000,
            current_phase: "responding",
        });
        mockGetSessionContextSummary.mockResolvedValue({
            model: "qwen3-coder-plus",
            approval_mode: "default",
            token_budget: {
                current_tokens: 118000,
                effective_limit: 128000,
            },
            active_tool_calls: 2,
            turn_age_ms: 25000,
            metadata: {
                last_error: "Rate limit exceeded",
            },
        });
        mockGetSessionRecentHistory.mockResolvedValue({
            source: "details",
            truncated: false,
            total_items: 2,
            total_chars: 120,
            items: [
                {
                    role: "assistant",
                    content: "Running build check now.",
                    timestamp: "2026-02-24T11:58:40.000Z",
                },
                {
                    role: "unknown",
                    content: "Error: request failed with status 429",
                    timestamp: "2026-02-24T11:58:50.000Z",
                },
            ],
        });
        const invocation = tool.build({
            session_id: "session-alpha",
            include_history: true,
            max_messages: 5,
        });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        const parsed = JSON.parse(String(result.returnDisplay));
        expect(parsed.sessions_inspected).toBe(1);
        expect(parsed.sessions[0].session_id).toBe("session-alpha");
        expect(parsed.sessions[0].model).toBe("qwen3-coder-plus");
        expect(parsed.sessions[0].auth).toBe("qwen_oauth");
        expect(parsed.sessions[0].context_window.state).toBe("critical");
        expect(parsed.sessions[0].recent_messages.items).toHaveLength(2);
        expect(parsed.sessions[0].error_signals.some((entry) => entry.includes("429"))).toBe(true);
    });
    it("lists only non-stale sessions by default", async () => {
        const nowIso = "2026-02-24T11:59:40.000Z";
        const staleIso = "2026-02-24T11:40:00.000Z";
        mockListSessions.mockResolvedValue([
            {
                id: "session-active",
                pid: 2001,
                mode: "headless",
                cwd: "/repo/a",
                started_at: nowIso,
                last_seen: nowIso,
                status: "idle",
            },
            {
                id: "session-stale",
                pid: 2002,
                mode: "headless",
                cwd: "/repo/b",
                started_at: staleIso,
                last_seen: staleIso,
                status: "idle",
            },
        ]);
        mockGetSessionStatusView.mockResolvedValue(null);
        mockGetSessionContextSummary.mockResolvedValue(null);
        mockGetSessionRecentHistory.mockResolvedValue(null);
        const invocation = tool.build({});
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        const parsed = JSON.parse(String(result.returnDisplay));
        expect(parsed.sessions_inspected).toBe(1);
        expect(parsed.sessions[0].session_id).toBe("session-active");
    });
    it("returns tool params error for invalid max_messages", async () => {
        const invocation = tool.build({ max_messages: 1000 });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error?.message).toContain("max_messages must be <= 100");
    });
});
//# sourceMappingURL=inspect-sessions.test.js.map