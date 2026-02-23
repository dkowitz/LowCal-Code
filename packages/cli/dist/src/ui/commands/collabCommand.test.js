/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, } from "vitest";
import { enqueueCollabWakeForMessage, postCollabMessage, readCollabMessages, } from "@qwen-code/qwen-code-core";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { collabCommand } from "./collabCommand.js";
describe("collabCommand", () => {
    let context;
    let tempDir;
    const sessionId = "session-local";
    let messages = [];
    let nextSeq = 1;
    const enqueueCollabWakeForMessageMock = enqueueCollabWakeForMessage;
    const postCollabMessageMock = postCollabMessage;
    const readCollabMessagesMock = readCollabMessages;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lowcal-collab-cmd-test-"));
        messages = [];
        nextSeq = 1;
        postCollabMessageMock.mockImplementation(async (input) => {
            const message = {
                message_id: `${nextSeq}-test`,
                seq: nextSeq,
                timestamp: new Date(Date.now() + nextSeq).toISOString(),
                from_session_id: input.fromSessionId,
                to_session_id: input.toSessionId,
                type: input.type ?? "note",
                text: input.text,
                refs: input.refs,
                notify: input.notify ?? "passive",
            };
            nextSeq += 1;
            messages.push(message);
            return {
                message,
                notifyPath: path.join(input.baseDir, ".lowcal", "collab", "notify.json"),
            };
        });
        readCollabMessagesMock.mockImplementation(async (_baseDir, options) => {
            const sessionTarget = options?.sessionId;
            const sinceSeq = options?.sinceSeq ?? 0;
            const limit = options?.limit ?? 20;
            const filtered = messages
                .filter((message) => message.seq > sinceSeq)
                .filter((message) => {
                if (!sessionTarget) {
                    return true;
                }
                return !message.to_session_id || message.to_session_id === sessionTarget;
            })
                .sort((a, b) => a.seq - b.seq);
            if (filtered.length <= limit) {
                return filtered;
            }
            return filtered.slice(filtered.length - limit);
        });
        enqueueCollabWakeForMessageMock.mockResolvedValue({
            notifyMode: "wake_prompt",
            attempted: true,
            enqueued: true,
            targetSessionId: "session-peer",
            actionType: "prompt",
            actionId: "action-1",
        });
        context = createMockCommandContext({
            services: {
                config: {
                    getSessionId: () => sessionId,
                    getTargetDir: () => tempDir,
                },
            },
        });
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
        enqueueCollabWakeForMessageMock.mockReset();
        postCollabMessageMock.mockReset();
        readCollabMessagesMock.mockReset();
    });
    it("returns an error when config is unavailable", async () => {
        const noConfigContext = createMockCommandContext({
            services: { config: null },
        });
        const result = await collabCommand.action(noConfigContext, "");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "Collab board is unavailable: missing active configuration.",
        });
    });
    it("posts a message with refs", async () => {
        const result = await collabCommand.action(context, "post \"Please review\" --to session-peer --ref src/main.ts --type request");
        expect(result).toMatchObject({
            type: "message",
            messageType: "info",
        });
        expect(result).toHaveProperty("content");
        const content = result.content;
        expect(content).toContain("Posted collab message [1]");
        expect(content).toContain("To: session-peer");
        expect(content).toContain("Please review");
        expect(content).toContain("src/main.ts");
        expect(content).toContain("Notify: passive");
    });
    it("posts with wake notify mode", async () => {
        const result = await collabCommand.action(context, "post \"Need follow-up\" --to session-peer --notify wake_prompt");
        expect(result).toMatchObject({
            type: "message",
            messageType: "info",
        });
        const content = result.content;
        expect(content).toContain("Notify: wake_prompt");
        expect(content).toContain("Wake: queued prompt wake for session-peer.");
        expect(enqueueCollabWakeForMessageMock).toHaveBeenCalledTimes(1);
    });
    it("rejects wake notify mode without direct target", async () => {
        const result = await collabCommand.action(context, "post \"Need follow-up\" --notify wake_prompt");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "--notify wake_view/wake_prompt requires --to <session>.",
        });
        expect(enqueueCollabWakeForMessageMock).not.toHaveBeenCalled();
    });
    it("views messages for current session by default", async () => {
        await collabCommand.action(context, "post \"broadcast status\"");
        await collabCommand.action(context, "post \"for local\" --to session-local");
        await collabCommand.action(context, "post \"for other\" --to session-other");
        const result = await collabCommand.action(context, "view --limit 10");
        expect(result).toMatchObject({
            type: "message",
            messageType: "info",
        });
        const content = result.content;
        expect(content).toContain(`Collab board messages for session "${sessionId}"`);
        expect(content).toContain("broadcast status");
        expect(content).toContain("for local");
        expect(content).not.toContain("for other");
    });
    it("views all targets with --all", async () => {
        await collabCommand.action(context, "post \"for local\" --to session-local");
        await collabCommand.action(context, "post \"for other\" --to session-other");
        const result = await collabCommand.action(context, "view --all --limit 10");
        expect(result).toMatchObject({
            type: "message",
            messageType: "info",
        });
        const content = result.content;
        expect(content).toContain("Collab board messages (all targets)");
        expect(content).toContain("for local");
        expect(content).toContain("for other");
    });
});
//# sourceMappingURL=collabCommand.test.js.map