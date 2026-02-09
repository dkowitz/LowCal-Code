/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from "@google/genai";
import type { Config } from "../config/config.js";
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  getLaunchTaskState,
  isLaunchTaskTerminal,
  listLaunchTaskStates,
} from "./launch-task-state.js";

type ReadSessionMessagesAction = "pull" | "peek" | "clear" | "wait";

export interface ReadSessionMessagesParams {
  action?: ReadSessionMessagesAction;
  session_id?: string;
  max_items?: number;
  task_id?: string;
  timeout_seconds?: number;
}

interface SessionMessageRecord {
  to_session_id?: string;
  from_session_id?: string;
  from_task_id?: string;
  job_id?: string;
  status?: "success" | "error";
  timestamp?: string;
  prompt_preview?: string;
  preview?: string;
  output_path?: string;
  return_payload?: string;
}

interface ParsedMailboxLine {
  raw: string;
  parsed?: SessionMessageRecord;
}

const DEFAULT_MAX_ITEMS = 20;
const MAX_ITEMS_LIMIT = 200;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 30;
const MAX_WAIT_TIMEOUT_SECONDS = 300;
const WAIT_POLL_INTERVAL_MS = 500;

const readSessionMessagesToolSchemaData: FunctionDeclaration = {
  name: ToolNames.READ_SESSION_MESSAGES,
  description:
    "Reads inter-session mailbox messages produced by launched tasks. Use this to receive task results sent back to the current session.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["pull", "peek", "clear", "wait"],
        description:
          "Mailbox action. pull = read and consume messages, peek = read without consuming, clear = delete mailbox contents, wait = block until a message arrives or timeout.",
      },
      session_id: {
        type: "string",
        description:
          "Target session id mailbox to read. Defaults to the current session id.",
      },
      max_items: {
        type: "number",
        description:
          "Maximum number of messages to return for pull/peek. Default 20, max 200.",
      },
      task_id: {
        type: "string",
        description:
          "Optional task id filter. For wait, returns only messages from this task id.",
      },
      timeout_seconds: {
        type: "number",
        description:
          "For wait action: max time to wait for messages. Default 30s, max 300s.",
      },
    },
    $schema: "http://json-schema.org/draft-07/schema#",
  },
};

const readSessionMessagesToolDescription = `
Read inter-session messages that launched tasks send back to a parent session.

## Actions

- \`pull\` (default): Read and consume up to \`max_items\` messages.
- \`peek\`: Read messages without consuming them.
- \`clear\`: Delete all queued messages for the mailbox.
- \`wait\`: Block until a message arrives (or timeout). Use this after \`launch_task\` to avoid busy polling.

## Typical usage

When you launch background tasks with \`launch_task\`, they can return summaries and status through this mailbox.
Use \`read_session_messages action="wait"\` to wait for completion instead of polling log files.

## Parent Protocol (Recommended)

1. Launch one child task with \`launch_task\`.
2. Call \`read_session_messages\` with \`action: "wait"\` and the same \`task_id\`.
3. If timeout occurs, assume task may still be running; do not launch a duplicate.
4. Repeat \`wait\` or report running status, then consume final result with \`wait\`/\`pull\`.
`;

function clampMaxItems(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAX_ITEMS;
  }
  const normalized = Math.floor(value);
  if (normalized < 1) return 1;
  if (normalized > MAX_ITEMS_LIMIT) return MAX_ITEMS_LIMIT;
  return normalized;
}

function clampWaitTimeoutSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WAIT_TIMEOUT_SECONDS;
  }
  const normalized = Math.floor(value);
  if (normalized < 1) return 1;
  if (normalized > MAX_WAIT_TIMEOUT_SECONDS) return MAX_WAIT_TIMEOUT_SECONDS;
  return normalized;
}

function getMailboxPath(baseDir: string, sessionId: string): string {
  return path.join(baseDir, ".lowcal", "session-messages", `${sessionId}.jsonl`);
}

async function readMailboxLines(mailboxPath: string): Promise<ParsedMailboxLine[]> {
  try {
    const raw = await fs.readFile(mailboxPath, "utf-8");
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return lines.map((line) => {
      try {
        const parsed = JSON.parse(line) as SessionMessageRecord;
        return { raw: line, parsed };
      } catch {
        return { raw: line, parsed: undefined };
      }
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeMailboxLines(
  mailboxPath: string,
  lines: ParsedMailboxLine[],
): Promise<void> {
  if (lines.length === 0) {
    await fs.unlink(mailboxPath).catch((error) => {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "ENOENT") {
        throw error;
      }
    });
    return;
  }

  await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
  await fs.writeFile(
    mailboxPath,
    `${lines.map((line) => line.raw).join("\n")}\n`,
    "utf-8",
  );
}

function matchesTaskId(
  message: SessionMessageRecord,
  taskId: string | undefined,
): boolean {
  if (!taskId) {
    return true;
  }
  return (
    message.from_task_id === taskId ||
    message.job_id === taskId ||
    message.from_session_id === taskId
  );
}

function formatMessage(
  index: number,
  message: SessionMessageRecord,
): string {
  const taskId =
    message.from_task_id ?? message.job_id ?? message.from_session_id ?? "unknown-task";
  const status = message.status ?? "unknown";
  const time = message.timestamp
    ? new Date(message.timestamp).toLocaleString()
    : "unknown-time";
  const preview =
    (message.return_payload && message.return_payload.trim().length > 0
      ? message.return_payload
      : message.preview) ?? "";
  const compactPreview = preview.trim().replace(/\s+/g, " ").slice(0, 500);
  const outputPath = message.output_path ? `\n  output: ${message.output_path}` : "";
  return `[${index}] ${taskId} (${status}) at ${time}\n  ${compactPreview}${outputPath}`;
}

class ReadSessionMessagesInvocation extends BaseToolInvocation<
  ReadSessionMessagesParams,
  ToolResult
> {
  constructor(
    params: ReadSessionMessagesParams,
    private readonly config: Config,
  ) {
    super(params);
  }

  getDescription(): string {
    const action = this.params.action ?? "pull";
    const sessionId = this.params.session_id ?? this.config.getSessionId();
    return `Reading session mailbox (${action}) for ${sessionId}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const result = await this.executeAction();
      return {
        llmContent: result,
        returnDisplay: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }
  }

  private async executeAction(): Promise<string> {
    const action: ReadSessionMessagesAction = this.params.action ?? "pull";
    const sessionId = (this.params.session_id ?? this.config.getSessionId()).trim();
    if (!sessionId) {
      throw new Error("session_id cannot be empty");
    }
    const taskId =
      typeof this.params.task_id === "string" &&
      this.params.task_id.trim().length > 0
        ? this.params.task_id.trim()
        : undefined;

    const maxItems = clampMaxItems(this.params.max_items);
    const waitTimeoutSeconds = clampWaitTimeoutSeconds(this.params.timeout_seconds);
    const baseDir = this.config.getTargetDir();
    const mailboxPath = getMailboxPath(baseDir, sessionId);

    const tryReadMessages = async (): Promise<{
      lines: ParsedMailboxLine[];
      selected: Array<{ lineIndex: number; message: SessionMessageRecord }>;
    }> => {
      const lines = await readMailboxLines(mailboxPath);
      const validMessages = lines
        .map((line, lineIndex) => ({ lineIndex, message: line.parsed }))
        .filter(
          (
            item,
          ): item is { lineIndex: number; message: SessionMessageRecord } =>
            item.message !== undefined,
        )
        .filter((item) => matchesTaskId(item.message, taskId));
      const selected = validMessages.slice(0, maxItems);
      return { lines, selected };
    };

    const consumeSelected = async (
      lines: ParsedMailboxLine[],
      selected: Array<{ lineIndex: number; message: SessionMessageRecord }>,
    ): Promise<void> => {
      if (selected.length === 0) {
        return;
      }
      const consumed = new Set(selected.map((entry) => entry.lineIndex));
      const remaining = lines.filter((_, index) => !consumed.has(index));
      await writeMailboxLines(mailboxPath, remaining);
    };

    if (action === "clear") {
      const { lines, selected } = await tryReadMessages();
      if (taskId) {
        await consumeSelected(lines, selected);
      } else {
        await fs.unlink(mailboxPath).catch((error) => {
          const nodeError = error as NodeJS.ErrnoException;
          if (nodeError?.code !== "ENOENT") {
            throw error;
          }
        });
      }
      return selected.length === 0
        ? `No session messages to clear for "${sessionId}"${taskId ? ` (task ${taskId})` : ""}.`
        : `Cleared ${selected.length} session message(s) for "${sessionId}"${taskId ? ` (task ${taskId})` : ""}.`;
    }

    if (action === "wait") {
      const startMs = Date.now();
      const deadlineMs = startMs + waitTimeoutSeconds * 1000;

      while (Date.now() < deadlineMs) {
        const { lines, selected } = await tryReadMessages();
        if (selected.length > 0) {
          await consumeSelected(lines, selected);
          const waitedMs = Date.now() - startMs;
          const header = `Wait received ${selected.length} message(s) for "${sessionId}" after ${(waitedMs / 1000).toFixed(1)}s.`;
          const body = selected
            .map((entry, index) => formatMessage(index + 1, entry.message))
            .join("\n\n");
          return `${header}\n\n${body}`;
        }

        if (taskId) {
          const taskState = await getLaunchTaskState(baseDir, taskId);
          if (taskState && isLaunchTaskTerminal(taskState.status)) {
            const outputPath = taskState.result_ref?.output_path
              ? `\nOutput: ${taskState.result_ref.output_path}`
              : "";
            const errorText = taskState.last_error
              ? `\nError: ${taskState.last_error}`
              : "";
            return `No mailbox message for task "${taskId}", but task is ${taskState.status}.${outputPath}${errorText}`;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
      }

      const activeTasks = await listLaunchTaskStates(baseDir, {
        parentSessionId: sessionId,
        statuses: ["queued", "running"],
        limit: 5,
      });
      const activeSummary =
        activeTasks.length > 0
          ? `\nActive tasks: ${activeTasks
              .map(
                (task) =>
                  `${task.task_id}(${task.status}${
                    task.last_heartbeat ? ` @ ${new Date(task.last_heartbeat).toLocaleTimeString()}` : ""
                  })`,
              )
              .join(", ")}`
          : "";
      if (taskId) {
        const taskState = await getLaunchTaskState(baseDir, taskId);
        if (taskState) {
          return `Timed out waiting ${waitTimeoutSeconds}s for task "${taskId}" mailbox message. Current task state: ${taskState.status}.${activeSummary}`;
        }
      }
      return `Timed out waiting ${waitTimeoutSeconds}s for session "${sessionId}" mailbox messages.${activeSummary}`;
    }

    const { lines, selected } = await tryReadMessages();
    if (selected.length === 0) {
      return taskId
        ? `No session messages for "${sessionId}" matching task "${taskId}".`
        : `No session messages for "${sessionId}".`;
    }

    if (action === "pull") {
      await consumeSelected(lines, selected);
    }

    const header = `${action === "pull" ? "Pulled" : "Peeked"} ${selected.length} message(s) for "${sessionId}".`;
    const body = selected
      .map((entry, index) => formatMessage(index + 1, entry.message))
      .join("\n\n");
    return `${header}\n\n${body}`;
  }
}

export class ReadSessionMessagesTool extends BaseDeclarativeTool<
  ReadSessionMessagesParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_SESSION_MESSAGES;

  constructor(private readonly config: Config) {
    super(
      ToolNames.READ_SESSION_MESSAGES,
      "Read Session Messages",
      readSessionMessagesToolDescription,
      Kind.Other,
      readSessionMessagesToolSchemaData.parametersJsonSchema,
      true,
      false,
    );
  }

  protected override createInvocation(
    params: ReadSessionMessagesParams,
  ): ReadSessionMessagesInvocation {
    return new ReadSessionMessagesInvocation(params, this.config);
  }
}
