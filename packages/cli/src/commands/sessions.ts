/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI commands for managing LowCal sessions
 */

import type { CommandModule, Argv, ArgumentsCamelCase } from "yargs";

import {
  listSessions,
  getSession,
  pruneStaleSessions,
  type SessionRecord,
} from "@qwen-code/qwen-code-core";
import { DEFAULT_SESSION_TTL_MS } from "../session/sessionManager.js";

type SessionsArgs = {
  ttl?: number;
  id?: string;
  watch?: boolean;
  interval?: number;
};

function getTtlMs(ttlSeconds?: number): number {
  if (!ttlSeconds || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return DEFAULT_SESSION_TTL_MS;
  }
  return ttlSeconds * 1000;
}

function getIntervalMs(intervalSeconds?: number): number {
  if (
    !intervalSeconds ||
    !Number.isFinite(intervalSeconds) ||
    intervalSeconds <= 0
  ) {
    return 2000;
  }
  return intervalSeconds * 1000;
}

function renderSessions(sessions: SessionRecord[], ttlMs: number): void {
  const now = Date.now();
  if (sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  const sorted = [...sessions].sort((a, b) => {
    const aLast = Date.parse(a.last_seen);
    const bLast = Date.parse(b.last_seen);
    const aStale = Number.isFinite(aLast) && now - aLast > ttlMs;
    const bStale = Number.isFinite(bLast) && now - bLast > ttlMs;
    const aRank = aStale ? 2 : a.status === "working" ? 0 : 1;
    const bRank = bStale ? 2 : b.status === "working" ? 0 : 1;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    if (Number.isFinite(aLast) && Number.isFinite(bLast)) {
      return bLast - aLast;
    }
    return 0;
  });

  for (const session of sorted) {
    console.log(formatSession(session, ttlMs, now));
    console.log();
  }
}

function formatSession(
  session: SessionRecord,
  ttlMs: number,
  now: number,
): string {
  const lastSeen = Date.parse(session.last_seen);
  const ageMs = Number.isFinite(lastSeen) ? now - lastSeen : Number.NaN;
  const isStale = Number.isFinite(ageMs) && ageMs > ttlMs;
  const statusLabel = isStale ? "stale" : session.status;
  const statusColor = isStale
    ? "\x1b[31m"
    : session.status === "working"
      ? "\x1b[33m"
      : "\x1b[32m";
  const reset = "\x1b[0m";
  const details = session.details ?? {};
  const jobId =
    typeof details["job_id"] === "string" ? details["job_id"] : undefined;
  const activeExecutions =
    typeof details["active_executions"] === "number"
      ? details["active_executions"]
      : undefined;

  const parts = [
    `${statusColor}${statusLabel.toUpperCase()}${reset} ${session.id}`,
    `  mode: ${session.mode}`,
    `  pid: ${session.pid}`,
    `  cwd: ${session.cwd}`,
    `  started: ${new Date(session.started_at).toLocaleString()}`,
    `  last_seen: ${new Date(session.last_seen).toLocaleString()}`,
  ];
  if (jobId) {
    parts.push(`  job_id: ${jobId}`);
  }
  if (typeof activeExecutions === "number") {
    parts.push(`  active_executions: ${activeExecutions}`);
  }
  return parts.join("\n");
}

const listCommand: CommandModule<SessionsArgs, SessionsArgs> = {
  command: "list",
  describe: "List active sessions",
  builder: (yargs: Argv<SessionsArgs>) =>
    yargs
      .option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
      })
      .option("watch", {
        type: "boolean",
        description: "Keep the list live (like top)",
        default: false,
      })
      .option("interval", {
        type: "number",
        description: "Refresh interval in seconds (default: 2)",
      }),
  handler: async (argv: ArgumentsCamelCase<SessionsArgs>) => {
    const ttlMs = getTtlMs(argv.ttl);
    if (!argv.watch) {
      const sessions = await listSessions();
      renderSessions(sessions, ttlMs);
      return;
    }

    const intervalMs = getIntervalMs(argv.interval);
    const render = async () => {
      const sessions = await listSessions();
      process.stdout.write("\x1b[2J\x1b[H");
      console.log(
        `LowCal Sessions (refresh ${Math.round(intervalMs / 1000)}s) - press Ctrl+C to exit`,
      );
      console.log("Press 'p' to prune stale sessions.");
      console.log();
      renderSessions(sessions, ttlMs);
    };

    await render();
    const intervalId = setInterval(render, intervalMs);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on("data", async (data: Buffer) => {
        const key = data.toString("utf-8");
        if (key === "\u0003") {
          clearInterval(intervalId);
          process.exit(0);
        }
        if (key.toLowerCase() === "p") {
          await pruneStaleSessions(ttlMs);
          await render();
        }
      });
    }
  },
};

const getCommand: CommandModule<SessionsArgs, SessionsArgs> = {
  command: "get <id>",
  describe: "Show details for a single session",
  handler: async (argv: ArgumentsCamelCase<SessionsArgs>) => {
    const id = argv.id;
    if (!id) {
      console.error("Session id is required.");
      process.exit(1);
    }
    const session = await getSession(id);
    if (!session) {
      console.log(`Session not found: ${id}`);
      process.exit(1);
    }
    console.log(JSON.stringify(session, null, 2));
  },
};

const pruneCommand: CommandModule<SessionsArgs, SessionsArgs> = {
  command: "prune",
  describe: "Remove stale sessions",
  builder: (yargs: Argv<SessionsArgs>) =>
    yargs.option("ttl", {
      type: "number",
      description: "Stale threshold in seconds (default: 180)",
    }),
  handler: async (argv: ArgumentsCamelCase<SessionsArgs>) => {
    const ttlMs = getTtlMs(argv.ttl);
    const removed = await pruneStaleSessions(ttlMs);
    if (removed.length === 0) {
      console.log("No stale sessions removed.");
      return;
    }
    console.log(`Removed ${removed.length} stale session(s):`);
    for (const session of removed) {
      console.log(`- ${session.id}`);
    }
  },
};

export const sessionsCommand: CommandModule<SessionsArgs, SessionsArgs> = {
  command: "sessions",
  describe: "Manage LowCal sessions",
  builder: (yargs: Argv<SessionsArgs>) =>
    yargs
      .command(listCommand)
      .command(getCommand)
      .command(pruneCommand)
      .option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
      })
      .option("watch", {
        type: "boolean",
        description: "Keep the list live (like top)",
        default: false,
      })
      .option("interval", {
        type: "number",
        description: "Refresh interval in seconds (default: 2)",
      })
      .version(false),
  handler: async (argv: ArgumentsCamelCase<SessionsArgs>) => {
    const ttlMs = getTtlMs(argv.ttl);
    if (!argv.watch) {
      const sessions = await listSessions();
      renderSessions(sessions, ttlMs);
      return;
    }

    const intervalMs = getIntervalMs(argv.interval);
    const render = async () => {
      const sessions = await listSessions();
      process.stdout.write("\x1b[2J\x1b[H");
      console.log(
        `LowCal Sessions (refresh ${Math.round(intervalMs / 1000)}s) - press Ctrl+C to exit`,
      );
      console.log();
      renderSessions(sessions, ttlMs);
    };

    await render();
    setInterval(render, intervalMs);
  },
};
