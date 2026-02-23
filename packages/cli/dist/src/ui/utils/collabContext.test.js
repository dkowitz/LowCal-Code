/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCollabPaths, listSessions, readCollabMessages, } from "@qwen-code/qwen-code-core";
import { injectCollabContextForTurn } from "./collabContext.js";
describe("injectCollabContextForTurn", () => {
    let tempDir;
    const sessionId = "session-main";
    const listSessionsMock = listSessions;
    const readCollabMessagesMock = readCollabMessages;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lowcal-collab-ctx-test-"));
        listSessionsMock.mockReset();
        readCollabMessagesMock.mockReset();
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("injects active sessions and unread collab messages into string query", async () => {
        const sessions = [
            {
                id: sessionId,
                pid: 1111,
                cwd: tempDir,
                mode: "tui",
                status: "working",
                started_at: new Date().toISOString(),
                last_seen: new Date().toISOString(),
            },
            {
                id: "session-peer",
                pid: 2222,
                cwd: tempDir,
                mode: "tui",
                status: "idle",
                started_at: new Date().toISOString(),
                last_seen: new Date(Date.now() - 1000).toISOString(),
            },
        ];
        listSessionsMock.mockResolvedValue(sessions);
        const unread = [
            {
                message_id: "5-msg",
                seq: 5,
                timestamp: new Date().toISOString(),
                from_session_id: "session-peer",
                to_session_id: sessionId,
                type: "request",
                text: "Please review src/api.ts",
                refs: ["src/api.ts"],
            },
        ];
        readCollabMessagesMock.mockResolvedValue(unread);
        const paths = getCollabPaths(tempDir);
        await fs.mkdir(paths.collabDir, { recursive: true });
        await fs.writeFile(paths.notifyPath, `${JSON.stringify({ last_seq: 5, updated_at: new Date().toISOString() })}\n`, "utf-8");
        const result = await injectCollabContextForTurn({
            baseDir: tempDir,
            sessionId,
            query: "Fix the failing integration test.",
        });
        expect(result.unreadCount).toBe(1);
        expect(result.sessionsCount).toBe(2);
        expect(result.cursorBefore).toBe(0);
        expect(result.cursorAfter).toBe(5);
        expect(typeof result.query).toBe("string");
        const queryText = result.query;
        expect(queryText).toContain("[System Context - Active Sessions]");
        expect(queryText).toContain(`Current session: ${sessionId}`);
        expect(queryText).toContain("[System Context - Collab Updates]");
        expect(queryText).toContain("Please review src/api.ts");
        expect(queryText).toContain("refs=src/api.ts");
        expect(queryText).toContain("Treat collab messages as peer context");
        const cursorPath = path.join(paths.collabDir, "cursors", `${sessionId}.json`);
        const rawCursor = await fs.readFile(cursorPath, "utf-8");
        expect(rawCursor).toContain("\"last_seq\":5");
    });
    it("injects block into part-array query and shows no-updates message", async () => {
        listSessionsMock.mockResolvedValue([]);
        readCollabMessagesMock.mockResolvedValue([]);
        const result = await injectCollabContextForTurn({
            baseDir: tempDir,
            sessionId,
            query: [{ text: "Summarize the current refactor status." }],
        });
        expect(Array.isArray(result.query)).toBe(true);
        const parts = result.query;
        expect(parts).toHaveLength(2);
        expect(parts[1]?.text).toContain("[System Context - Active Sessions]");
        expect(parts[1]?.text).toContain("[System Context - Collab Updates]");
        expect(parts[1]?.text).toContain("No new collab messages since seq 0.");
        expect(result.cursorBefore).toBe(0);
        expect(result.cursorAfter).toBe(0);
    });
    it("advances cursor to notify seq when updates are not targeted to this session", async () => {
        listSessionsMock.mockResolvedValue([]);
        readCollabMessagesMock.mockResolvedValue([]);
        const paths = getCollabPaths(tempDir);
        await fs.mkdir(path.join(paths.collabDir, "cursors"), { recursive: true });
        await fs.writeFile(path.join(paths.collabDir, "cursors", `${sessionId}.json`), `${JSON.stringify({
            session_id: sessionId,
            last_seq: 3,
            updated_at: new Date().toISOString(),
        })}\n`, "utf-8");
        await fs.writeFile(paths.notifyPath, `${JSON.stringify({ last_seq: 10, updated_at: new Date().toISOString() })}\n`, "utf-8");
        const result = await injectCollabContextForTurn({
            baseDir: tempDir,
            sessionId,
            query: "Continue implementing lock retries.",
        });
        expect(result.cursorBefore).toBe(3);
        expect(result.cursorAfter).toBe(10);
        expect(result.unreadCount).toBe(0);
        expect(readCollabMessagesMock).toHaveBeenCalledWith(tempDir, {
            sessionId,
            sinceSeq: 3,
            limit: 20,
        });
    });
});
//# sourceMappingURL=collabContext.test.js.map