/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  listLaunchTaskStates,
  reconcileLaunchTaskState,
  type LaunchTaskStateRecord,
} from "@qwen-code/qwen-code-core";
import {
  CommandKind,
  type MessageActionReturn,
  type OpenDialogActionReturn,
  type SlashCommand,
  type SlashCommandActionReturn,
} from "./types.js";
import {
  clearMailboxMessages,
  getMailboxPath,
  loadMailboxPayloadText,
  mailboxMessageTaskId,
  readMailboxMessages,
  resolveMailboxSelection,
  sortMailboxMessages,
  summarizeMailboxPayload,
  type SessionMailboxMessage,
} from "../utils/mailbox.js";

function usageError(content: string): MessageActionReturn {
  return {
    type: "message",
    messageType: "error",
    content,
  };
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function formatPendingTask(record: LaunchTaskStateRecord): string {
  const mode =
    record.execution_mode_actual ?? record.execution_mode_requested ?? "default";
  const activity = record.last_heartbeat ?? record.started_at ?? record.created_at;
  const timeText = activity ? new Date(activity).toLocaleString() : "unknown-time";
  const templateText = record.template_id
    ? ` template=${record.template_id}`
    : "";
  return `- ${record.task_id} (${record.status}, mode=${mode}, last=${timeText})${templateText}`;
}

function buildMailboxListMessage(
  sessionId: string,
  messages: SessionMailboxMessage[],
  pendingTasks: LaunchTaskStateRecord[],
): string {
  const lines: string[] = [];
  lines.push(`Mailbox for session "${sessionId}"`);
  lines.push("");
  lines.push(`Received (${messages.length}):`);

  if (messages.length === 0) {
    lines.push("- none");
  } else {
    messages.forEach((message, idx) => {
      const taskId = mailboxMessageTaskId(message);
      const status = message.status ?? "unknown";
      const time = message.timestamp
        ? new Date(message.timestamp).toLocaleString()
        : "unknown-time";
      lines.push(`[${idx + 1}] ${taskId} (${status}) at ${time}`);
      lines.push(`    ${summarizeMailboxPayload(message)}`);
    });
  }

  lines.push("");
  lines.push(`Pending (${pendingTasks.length}):`);
  if (pendingTasks.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...pendingTasks.map((record) => formatPendingTask(record)));
  }

  lines.push("");
  lines.push("Use:");
  lines.push("- /mailbox show <index|task_id>   (preview payload in chat)");
  lines.push("- /mailbox use <index|task_id>    (inject payload into chat/model)");
  lines.push("- /mailbox clear                  (clear received mailbox entries)");
  return lines.join("\n");
}

export const mailboxCommand: SlashCommand = {
  name: "mailbox",
  description: "view task return payloads and pending task mailbox status",
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    args,
  ): Promise<void | OpenDialogActionReturn | SlashCommandActionReturn> => {
    const config = context.services.config;
    if (!config) {
      return usageError("Mailbox is unavailable: missing active configuration.");
    }

    const sessionId = config.getSessionId();
    const baseDir = config.getTargetDir();
    const mailboxPath = getMailboxPath(baseDir, sessionId);

    const tokens = tokenizeArgs(args.trim());
    const subcommand = tokens[0] ?? "open";

    if (subcommand === "open") {
      return {
        type: "dialog",
        dialog: "mailbox",
      };
    }

    if (subcommand === "list") {
      await reconcileLaunchTaskState(baseDir);
      const rawMessages = await readMailboxMessages(mailboxPath);
      const messages = sortMailboxMessages(rawMessages);
      const pendingTasks = await listLaunchTaskStates(baseDir, {
        parentSessionId: sessionId,
        statuses: ["queued", "running"],
        limit: 50,
      });

      return {
        type: "message",
        messageType: "info",
        content: buildMailboxListMessage(sessionId, messages, pendingTasks),
      };
    }

    if (subcommand === "show" || subcommand === "use") {
      const selector = tokens[1]?.trim();
      if (!selector) {
        return usageError(`Usage: /mailbox ${subcommand} <index|task_id>`);
      }

      const rawMessages = await readMailboxMessages(mailboxPath);
      const messages = sortMailboxMessages(rawMessages);
      const selected = resolveMailboxSelection(messages, selector);

      if (!selected) {
        return usageError(
          `Mailbox entry "${selector}" not found. Run /mailbox list to inspect available entries.`,
        );
      }

      const payload = await loadMailboxPayloadText(selected.message);
      const taskId = mailboxMessageTaskId(selected.message);
      const status = selected.message.status ?? "unknown";
      const time = selected.message.timestamp
        ? new Date(selected.message.timestamp).toLocaleString()
        : "unknown-time";
      const header = [
        `Mailbox payload [${selected.index}]`,
        `Task: ${taskId}`,
        `Status: ${status}`,
        `Time: ${time}`,
      ].join("\n");
      const messageContent = `${header}\n\n${payload}`;

      if (subcommand === "show") {
        return {
          type: "message",
          messageType: "info",
          content: messageContent,
        };
      }

      await config.getGeminiClient()?.addHistory({
        role: "user",
        parts: [{ text: messageContent }],
      });

      context.ui.addItem(
        {
          type: "gemini_content",
          text: messageContent,
        },
        Date.now(),
      );

      return {
        type: "message",
        messageType: "info",
        content: `Injected mailbox payload [${selected.index}] into chat/model history (display-only).`,
      };
    }

    if (subcommand === "clear") {
      await clearMailboxMessages(mailboxPath);
      return {
        type: "message",
        messageType: "info",
        content: `Cleared mailbox entries for session "${sessionId}".`,
      };
    }

    return usageError(
      "Unknown subcommand. Use /mailbox, /mailbox list, /mailbox show <id>, /mailbox use <id>, or /mailbox clear.",
    );
  },
};
