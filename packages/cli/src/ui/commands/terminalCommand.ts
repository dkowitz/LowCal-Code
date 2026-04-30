/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { terminalSessionService } from "@qwen-code/qwen-code-core";
import {
  CommandKind,
  type MessageActionReturn,
  type SlashCommand,
} from "./types.js";

function formatSessionList(): string {
  const sessions = terminalSessionService.list();
  if (sessions.length === 0) {
    return "No interactive terminal sessions are open.";
  }

  return sessions
    .map((session) =>
      [
        `${session.id} (${session.running ? "running" : "exited"})`,
        `  name: ${session.name}`,
        `  backend: ${session.backend}`,
        `  active: ${session.lastLine || "(empty)"}`,
        session.attachCommand ? `  attach: ${session.attachCommand}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function message(
  messageType: MessageActionReturn["messageType"],
  content: string,
): MessageActionReturn {
  return {
    type: "message",
    messageType,
    content,
  };
}

function resolveSessionId(explicitId?: string): string | MessageActionReturn {
  if (explicitId) {
    return explicitId;
  }

  const runningSessions = terminalSessionService
    .list()
    .filter((session) => session.running);
  if (runningSessions.length === 1) {
    return runningSessions[0].id;
  }

  if (runningSessions.length === 0) {
    return message("error", "No running interactive terminal sessions.");
  }

  return message(
    "error",
    `Multiple terminal sessions are running. Use /terminal attach <session_id>.\n\n${formatSessionList()}`,
  );
}

export const terminalCommand: SlashCommand = {
  name: "terminal",
  altNames: ["term"],
  description: "list or attach to LowCal interactive terminal sessions",
  kind: CommandKind.BUILT_IN,
  completion: async (_context, partialArg) => {
    const tokens = partialArg.trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= 1 && "attach".startsWith(tokens[0] ?? "")) {
      return ["attach", "list"];
    }

    const filter = tokens[tokens.length - 1]?.toLowerCase() ?? "";
    return terminalSessionService
      .list()
      .map((session) => session.id)
      .filter((id) => id.toLowerCase().includes(filter));
  },
  action: async (context, args) => {
    const tokens = args.trim().split(/\s+/).filter(Boolean);
    const subcommand = tokens[0] ?? "list";

    if (subcommand === "list" || subcommand === "ls") {
      return message("info", formatSessionList());
    }

    if (subcommand !== "attach") {
      return message(
        "error",
        "Usage: /terminal list or /terminal attach [session_id]",
      );
    }

    const resolved = resolveSessionId(tokens[1]);
    if (typeof resolved !== "string") {
      return resolved;
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return message(
        "error",
        "Attaching to a terminal session requires an interactive TTY.",
      );
    }

    await terminalSessionService.attachInteractive(resolved, {
      input: process.stdin,
      output: process.stdout,
    });
    context.ui.refreshStatic();

    return message("info", `Detached from terminal session ${resolved}.`);
  },
};
