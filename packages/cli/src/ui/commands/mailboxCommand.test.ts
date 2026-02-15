/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import type { CommandContext } from "./types.js";
import { mailboxCommand } from "./mailboxCommand.js";

const { listLaunchTaskStatesMock, reconcileLaunchTaskStateMock } = vi.hoisted(
  () => ({
    listLaunchTaskStatesMock: vi.fn(),
    reconcileLaunchTaskStateMock: vi.fn(),
  }),
);

vi.mock("@qwen-code/qwen-code-core", () => ({
  listLaunchTaskStates: listLaunchTaskStatesMock,
  reconcileLaunchTaskState: reconcileLaunchTaskStateMock,
}));

describe("mailboxCommand", () => {
  let context: CommandContext;
  let tempDir: string;
  const addHistoryMock = vi.fn();

  const sessionId = "session-test-123";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lowcal-mailbox-test-"));
    addHistoryMock.mockReset();
    addHistoryMock.mockResolvedValue(undefined);
    context = createMockCommandContext({
      services: {
        config: {
          getSessionId: () => sessionId,
          getTargetDir: () => tempDir,
          getGeminiClient: () => ({
            addHistory: addHistoryMock,
          }),
        } as unknown as CommandContext["services"]["config"],
      },
    });
    listLaunchTaskStatesMock.mockReset();
    reconcileLaunchTaskStateMock.mockReset();
    listLaunchTaskStatesMock.mockResolvedValue([]);
    reconcileLaunchTaskStateMock.mockResolvedValue({
      staleMarked: 0,
      staleTaskIds: [],
      pruned: 0,
      prunedTaskIds: [],
    });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeMailbox(lines: Array<Record<string, unknown>>): Promise<void> {
    const mailboxPath = path.join(
      tempDir,
      ".lowcal",
      "session-messages",
      `${sessionId}.jsonl`,
    );
    await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
    const payload = lines.map((line) => JSON.stringify(line)).join("\n");
    await fs.writeFile(mailboxPath, `${payload}\n`, "utf-8");
  }

  it("returns an error when configuration is unavailable", async () => {
    const noConfigContext = createMockCommandContext({
      services: { config: null },
    });
    const result = await mailboxCommand.action!(noConfigContext, "");
    expect(result).toEqual({
      type: "message",
      messageType: "error",
      content: "Mailbox is unavailable: missing active configuration.",
    });
  });

  it("lists received and pending mailbox entries", async () => {
    await writeMailbox([
      {
        from_task_id: "vision-ocr-1",
        status: "success",
        timestamp: "2026-02-15T10:00:00.000Z",
        return_payload: "OCR done",
      },
      {
        from_task_id: "vision-ocr-2",
        status: "error",
        timestamp: "2026-02-15T11:00:00.000Z",
        preview: "task failed quickly",
      },
    ]);
    listLaunchTaskStatesMock.mockResolvedValue([
      {
        task_id: "web-scrape-1",
        status: "running",
        created_at: "2026-02-15T10:30:00.000Z",
        last_heartbeat: "2026-02-15T11:10:00.000Z",
        execution_mode_actual: "headless",
      },
    ]);

    const result = await mailboxCommand.action!(context, "list");
    expect(result).toMatchObject({
      type: "message",
      messageType: "info",
    });
    expect(result).toHaveProperty("content");
    const content = (result as { content: string }).content;
    expect(content).toContain(`Mailbox for session "${sessionId}"`);
    expect(content).toContain("Received (2):");
    expect(content).toContain("[1] vision-ocr-2");
    expect(content).toContain("[2] vision-ocr-1");
    expect(content).toContain("Pending (1):");
    expect(content).toContain("web-scrape-1 (running");
  });

  it("opens mailbox dialog by default", async () => {
    const result = await mailboxCommand.action!(context, "");
    expect(result).toEqual({
      type: "dialog",
      dialog: "mailbox",
    });
  });

  it("shows the selected payload by index", async () => {
    const resultFilePath = path.join(tempDir, ".lowcal", "results", "vision.md");
    await fs.mkdir(path.dirname(resultFilePath), { recursive: true });
    await fs.writeFile(resultFilePath, "# OCR Result\n\nDetected text.", "utf-8");
    await writeMailbox([
      {
        from_task_id: "vision-ocr-1",
        status: "success",
        timestamp: "2026-02-15T11:00:00.000Z",
        result_file_path: resultFilePath,
      },
    ]);

    const result = await mailboxCommand.action!(context, "show 1");
    expect(result).toMatchObject({
      type: "message",
      messageType: "info",
    });
    expect((result as { content: string }).content).toContain("Mailbox payload [1]");
    expect((result as { content: string }).content).toContain("Detected text.");
  });

  it("injects selected payload into display/model history with use", async () => {
    await writeMailbox([
      {
        from_task_id: "compress-context-1",
        status: "success",
        timestamp: "2026-02-15T12:00:00.000Z",
        return_payload: "Compacted summary payload",
      },
    ]);

    const result = await mailboxCommand.action!(context, "use 1");
    expect(result).toEqual({
      type: "message",
      messageType: "info",
      content:
        'Injected mailbox payload [1] into chat/model history (display-only).',
    });
    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "gemini_content",
        text: expect.stringContaining("Compacted summary payload"),
      }),
      expect.any(Number),
    );
    expect(addHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
      }),
    );
  });

  it("clears mailbox entries", async () => {
    await writeMailbox([
      {
        from_task_id: "task-1",
        status: "success",
        timestamp: "2026-02-15T12:00:00.000Z",
      },
    ]);

    const result = await mailboxCommand.action!(context, "clear");
    expect(result).toEqual({
      type: "message",
      messageType: "info",
      content: `Cleared mailbox entries for session "${sessionId}".`,
    });

    const mailboxPath = path.join(
      tempDir,
      ".lowcal",
      "session-messages",
      `${sessionId}.jsonl`,
    );
    await expect(fs.readFile(mailboxPath, "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
