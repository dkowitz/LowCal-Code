/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import type { CommandContext } from "./types.js";
import { tasksCommand } from "./tasksCommand.js";

const listTemplatesMock = vi.fn();

vi.mock("@qwen-code/qwen-code-core", () => ({
  AuthType: {
    USE_OPENAI: "openai",
    USE_GEMINI: "gemini",
  },
  TaskTemplateManager: vi.fn().mockImplementation(() => ({
    listTemplates: listTemplatesMock,
  })),
}));

describe("tasksCommand", () => {
  let context: CommandContext;

  beforeEach(() => {
    context = createMockCommandContext();
    listTemplatesMock.mockReset();
  });

  it("opens the tasks dialog when no args are supplied", async () => {
    const result = await tasksCommand.action!(context, "");
    expect(result).toEqual({
      type: "dialog",
      dialog: "tasks",
    });
  });

  it("returns a launch_task call for run subcommand", async () => {
    const result = await tasksCommand.action!(context, "run vision-ocr --level user");

    expect(result).toMatchObject({
      type: "tool",
      toolName: "launch_task",
      toolArgs: {
        action: "create",
        template_id: "vision-ocr",
        template_level: "user",
      },
    });
  });

  it("returns a schedule_task call for schedule subcommand", async () => {
    const result = await tasksCommand.action!(
      context,
      'schedule compress "0 2 * * *" --id nightly-compress --level project',
    );

    expect(result).toEqual({
      type: "tool",
      toolName: "schedule_task",
      toolArgs: {
        action: "create",
        id: "nightly-compress",
        schedule: "0 2 * * *",
        template_id: "compress",
        template_level: "project",
      },
    });
  });

  it("lists templates", async () => {
    listTemplatesMock.mockResolvedValue([
      { id: "vision", level: "project", name: "Vision OCR" },
      { id: "compress", level: "user", name: "Compress Chat" },
    ]);

    const result = await tasksCommand.action!(context, "list");

    expect(result).toEqual({
      type: "message",
      messageType: "info",
      content:
        "Task templates (2):\n- vision (project): Vision OCR\n- compress (user): Compress Chat",
    });
  });

  it("returns a usage error for unknown subcommands", async () => {
    const result = await tasksCommand.action!(context, "bogus");
    expect(result).toEqual({
      type: "message",
      messageType: "error",
      content:
        'Unknown subcommand. Use /tasks, /tasks list, /tasks run <id>, or /tasks schedule <id> "<cron>".',
    });
  });
});
