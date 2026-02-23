/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COLLAB_MAX_TEXT_CHARS, getCollabPaths, postCollabMessage, readCollabMessages, } from "./store.js";
describe("collab store", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lowcal-collab-test-"));
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("posts and reads collab messages with session targeting", async () => {
        const first = await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-a",
            text: "Broadcast update",
            source: "tool",
        });
        const second = await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-b",
            toSessionId: "session-c",
            type: "request",
            text: "Please review docs/collab.md",
            refs: ["docs/collab.md"],
            notify: "wake_prompt",
            source: "slash_command",
        });
        expect(first.message.seq).toBe(1);
        expect(second.message.seq).toBe(2);
        expect(second.message.notify).toBe("wake_prompt");
        const forSessionC = await readCollabMessages(tempDir, {
            sessionId: "session-c",
            limit: 10,
        });
        expect(forSessionC).toHaveLength(2);
        expect(forSessionC[0]?.text).toBe("Broadcast update");
        expect(forSessionC[1]?.to_session_id).toBe("session-c");
        expect(forSessionC[1]?.notify).toBe("wake_prompt");
        const forSessionX = await readCollabMessages(tempDir, {
            sessionId: "session-x",
            limit: 10,
        });
        expect(forSessionX).toHaveLength(1);
        expect(forSessionX[0]?.text).toBe("Broadcast update");
    });
    it("rejects oversized message text", async () => {
        const oversized = "a".repeat(COLLAB_MAX_TEXT_CHARS + 1);
        await expect(postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-a",
            text: oversized,
        })).rejects.toThrow(`text exceeds ${COLLAB_MAX_TEXT_CHARS} characters. Write larger content to a file and reference it with refs.`);
    });
    it("fails after lock retry attempts when lock is active", async () => {
        const paths = getCollabPaths(tempDir);
        await fs.mkdir(paths.collabDir, { recursive: true });
        await fs.writeFile(paths.lockPath, `${JSON.stringify({
            owner: "blocked-session",
            acquired_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30_000).toISOString(),
        })}\n`, "utf-8");
        await expect(postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-a",
            text: "blocked write",
        })).rejects.toThrow(/Unable to acquire collab lock after 3 attempts/);
    });
    it("reclaims expired lock file and proceeds", async () => {
        const paths = getCollabPaths(tempDir);
        await fs.mkdir(paths.collabDir, { recursive: true });
        await fs.writeFile(paths.lockPath, `${JSON.stringify({
            owner: "stale-session",
            acquired_at: new Date(Date.now() - 60_000).toISOString(),
            expires_at: new Date(Date.now() - 30_000).toISOString(),
        })}\n`, "utf-8");
        const result = await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-a",
            text: "write after stale lock",
        });
        expect(result.message.seq).toBe(1);
        await expect(fs.readFile(paths.lockPath, "utf-8")).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
});
//# sourceMappingURL=store.test.js.map