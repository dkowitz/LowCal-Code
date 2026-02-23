/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../config/config.js";
import { getCollabPaths } from "../collab/store.js";
import {
  PostCollabMessageTool,
  type PostCollabMessageParams,
} from "./post-collab-message.js";

describe("PostCollabMessageTool", () => {
  let tempDir: string;
  let tool: PostCollabMessageTool;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "lowcal-post-collab-tool-test-"),
    );
    const config = {
      getTargetDir: () => tempDir,
      getSessionId: () => "session-primary",
    } as unknown as Config;
    tool = new PostCollabMessageTool(config);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("throws for empty text", () => {
    const params = { text: "   " } as PostCollabMessageParams;
    expect(() => tool.build(params)).toThrow("Missing or empty \"text\".");
  });

  it("posts a message and writes collab artifacts", async () => {
    const invocation = tool.build({
      text: "Need review for src/app.ts",
      to_session_id: "session-reviewer",
      refs: ["src/app.ts"],
      type: "request",
    });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeUndefined();
    expect(result.returnDisplay).toEqual(expect.stringContaining("Seq: 1"));
    expect(result.returnDisplay).toEqual(
      expect.stringContaining("To: session-reviewer"),
    );
    expect(result.returnDisplay).toEqual(
      expect.stringContaining("Notify: passive"),
    );

    const paths = getCollabPaths(tempDir);
    const rawMessages = await fs.readFile(paths.messagesPath, "utf-8");
    expect(rawMessages).toContain("\"seq\":1");
    expect(rawMessages).toContain("\"text\":\"Need review for src/app.ts\"");
    expect(rawMessages).toContain("\"to_session_id\":\"session-reviewer\"");
    await expect(fs.readFile(paths.notifyPath, "utf-8")).resolves.toContain(
      "\"last_seq\":1",
    );
  });

  it("rejects wake notify mode when target is missing", () => {
    expect(() =>
      tool.build({
        text: "Wake this up",
        notify: "wake_prompt",
      }),
    ).toThrow("notify requires a direct --to session target (not all).");
  });

  it("rejects invalid notify mode", () => {
    expect(() =>
      tool.build({
        text: "bad notify",
        to_session_id: "session-reviewer",
        notify: "ping",
      }),
    ).toThrow(/allowed values/);
  });
});
