/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { postCollabMessage } from "../collab/store.js";
import { ReadCollabMessagesTool } from "./read-collab-messages.js";
describe("ReadCollabMessagesTool", () => {
    let tempDir;
    let tool;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lowcal-read-collab-tool-test-"));
        const config = {
            getTargetDir: () => tempDir,
            getSessionId: () => "session-primary",
        };
        tool = new ReadCollabMessagesTool(config);
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("reads messages scoped to the current session by default", async () => {
        await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-peer",
            toSessionId: "session-primary",
            type: "request",
            text: "Please review src/main.ts",
            source: "tool",
        });
        await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-peer",
            toSessionId: "session-other",
            type: "request",
            text: "Only for another session",
            source: "tool",
        });
        await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-peer",
            type: "note",
            text: "Broadcast update",
            source: "tool",
        });
        const invocation = tool.build({});
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        expect(result.returnDisplay).toContain("Please review src/main.ts");
        expect(result.returnDisplay).toContain("Broadcast update");
        expect(result.returnDisplay).not.toContain("Only for another session");
    });
    it("can include all message targets", async () => {
        await postCollabMessage({
            baseDir: tempDir,
            fromSessionId: "session-peer",
            toSessionId: "session-other",
            type: "request",
            text: "Only for another session",
            source: "tool",
        });
        const invocation = tool.build({ include_all_targets: true });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error).toBeUndefined();
        expect(result.returnDisplay).toContain("Only for another session");
        expect(result.returnDisplay).toContain("Collab messages (all targets)");
    });
    it("returns a tool error for invalid limits", async () => {
        const invocation = tool.build({ limit: 0 });
        const result = await invocation.execute(new AbortController().signal);
        expect(result.error?.message).toContain("limit must be >= 1.");
    });
});
//# sourceMappingURL=read-collab-messages.test.js.map