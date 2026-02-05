/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { listSessions, type SessionRecord } from "@qwen-code/qwen-code-core";
import { DEFAULT_SESSION_TTL_MS } from "../../session/sessionManager.js";
import { CommandKind, type SlashCommand } from "./types.js";

function formatSessionLine(
  session: SessionRecord,
  now: number,
  ttlMs: number,
): string {
  const lastSeen = Date.parse(session.last_seen);
  const isStale = Number.isFinite(lastSeen) && now - lastSeen > ttlMs;
  const status = isStale ? "stale" : session.status;
  const details = session.details ?? {};
  const jobId =
    typeof details["job_id"] === "string" ? details["job_id"] : undefined;
  const activeExecutions =
    typeof details["active_executions"] === "number"
      ? details["active_executions"]
      : undefined;

  const parts = [
    `[${status.toUpperCase()}]`,
    session.id,
    `mode=${session.mode}`,
    `pid=${session.pid}`,
    `cwd=${session.cwd}`,
  ];
  if (jobId) {
    parts.push(`job_id=${jobId}`);
  }
  if (typeof activeExecutions === "number") {
    parts.push(`active_executions=${activeExecutions}`);
  }
  return parts.join(" ");
}

export const sessionsCommand: SlashCommand = {
  name: "sessions",
  description: "list active LowCal sessions",
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      context.ui.addItem(
        {
          type: "info",
          text: "No sessions found.",
        },
        Date.now(),
      );
      return;
    }

    const now = Date.now();
    const lines = [
      `Sessions (${sessions.length} total):`,
      ...sessions.map((session) =>
        formatSessionLine(session, now, DEFAULT_SESSION_TTL_MS),
      ),
    ];

    context.ui.addItem(
      {
        type: "info",
        text: lines.join("\n"),
      },
      Date.now(),
    );
  },
};
