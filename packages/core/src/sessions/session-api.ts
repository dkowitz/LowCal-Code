/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import type {
  SessionContextSummary,
  SessionHealthSnapshot,
  SessionHistoryEntry,
  SessionRecentHistory,
  SessionRecord,
  SessionStatusView,
} from "./types.js";
import { getSession } from "./session-store.js";

const DEFAULT_HISTORY_MAX_ITEMS = 20;
const DEFAULT_HISTORY_MAX_CHARS = 4000;
const LOG_TAIL_BYTES_FACTOR = 4;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeRole(value: unknown): SessionHistoryEntry["role"] {
  if (
    value === "system" ||
    value === "user" ||
    value === "assistant" ||
    value === "tool"
  ) {
    return value;
  }
  return "unknown";
}

function toHistoryEntry(value: unknown): SessionHistoryEntry | null {
  if (typeof value === "string") {
    return {
      role: "unknown",
      content: value,
    };
  }

  const record = asRecord(value);
  if (!record) return null;

  const content = asString(record["content"]) ?? asString(record["text"]);
  if (!content) return null;

  return {
    timestamp: asString(record["timestamp"]),
    role: normalizeRole(record["role"]),
    content,
  };
}

function summarizeHistory(
  entries: SessionHistoryEntry[],
  maxItems: number,
  maxChars: number,
  source: SessionRecentHistory["source"],
): SessionRecentHistory {
  const totalItems = entries.length;
  const totalChars = entries.reduce(
    (sum, entry) => sum + entry.content.length,
    0,
  );
  const cappedByItems = entries.slice(-maxItems);

  const keptReversed: SessionHistoryEntry[] = [];
  let chars = 0;
  let truncated = cappedByItems.length < entries.length;

  for (let index = cappedByItems.length - 1; index >= 0; index--) {
    const item = cappedByItems[index];
    const nextTotal = chars + item.content.length;

    if (nextTotal <= maxChars) {
      keptReversed.push(item);
      chars = nextTotal;
      continue;
    }

    truncated = true;
    if (chars === 0 && maxChars > 0) {
      const cutFrom = Math.max(0, item.content.length - maxChars);
      keptReversed.push({
        ...item,
        content: item.content.slice(cutFrom),
      });
      chars = maxChars;
    }
    break;
  }

  return {
    source,
    items: keptReversed.reverse(),
    truncated,
    total_items: totalItems,
    total_chars: totalChars,
  };
}

function getTurnAgeMs(
  details: Record<string, unknown> | undefined,
): number | undefined {
  if (!details) return undefined;
  const turnStartedAt = asString(details["turn_started_at"]);
  if (!turnStartedAt) return undefined;
  const parsed = Date.parse(turnStartedAt);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Date.now() - parsed);
}

function getLogPath(
  details: Record<string, unknown> | undefined,
): string | undefined {
  if (!details) return undefined;
  return (
    asString(details["history_log_path"]) ??
    asString(details["session_log_path"]) ??
    asString(details["log_file_path"])
  );
}

async function readLogTail(logPath: string, maxChars: number): Promise<string> {
  const stat = await fs.stat(logPath);
  const bytesToRead = Math.min(
    stat.size,
    Math.max(maxChars * LOG_TAIL_BYTES_FACTOR, maxChars),
  );
  const fd = await fs.open(logPath, "r");
  try {
    const start = Math.max(0, stat.size - bytesToRead);
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await fd.read(buffer, 0, bytesToRead, start);
    return buffer.toString("utf-8", 0, bytesRead);
  } finally {
    await fd.close();
  }
}

export async function getSessionStatusView(
  sessionId: string,
): Promise<SessionStatusView | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  const details = asRecord(session.details);
  const phase = asString(details?.["phase"]);
  const startedAt = Date.parse(session.started_at);
  const uptimeMs = Number.isFinite(startedAt)
    ? Math.max(0, Date.now() - startedAt)
    : 0;

  return {
    id: session.id,
    mode: session.mode,
    pid: session.pid,
    cwd: session.cwd,
    status: session.status,
    started_at: session.started_at,
    last_seen: session.last_seen,
    uptime_ms: uptimeMs,
    current_phase: phase,
  };
}

export async function getSessionHealthView(
  sessionId: string,
): Promise<SessionHealthSnapshot | null> {
  const session = await getSession(sessionId);
  return session?.health ?? null;
}

export async function getSessionContextSummary(
  sessionId: string,
): Promise<SessionContextSummary | null> {
  const session = await getSession(sessionId);
  if (!session) return null;
  const details = asRecord(session.details);

  return {
    model: asString(details?.["model"]),
    approval_mode: asString(details?.["approval_mode"]),
    token_budget: asRecord(details?.["token_budget"]),
    active_tool_calls: asFiniteNumber(details?.["active_tool_calls"]),
    turn_age_ms: getTurnAgeMs(details),
    metadata: details,
  };
}

export interface SessionHistoryOptions {
  max_items?: number;
  max_chars?: number;
}

function normalizeHistoryLimits(options: SessionHistoryOptions | undefined): {
  maxItems: number;
  maxChars: number;
} {
  const maxItems =
    typeof options?.max_items === "number" && options.max_items > 0
      ? Math.floor(options.max_items)
      : DEFAULT_HISTORY_MAX_ITEMS;
  const maxChars =
    typeof options?.max_chars === "number" && options.max_chars > 0
      ? Math.floor(options.max_chars)
      : DEFAULT_HISTORY_MAX_CHARS;
  return { maxItems, maxChars };
}

function parseHistoryFromDetails(
  details: Record<string, unknown> | undefined,
): SessionHistoryEntry[] {
  if (!details) return [];
  const candidates = [details["recent_history"], details["history"]];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const parsed = candidate
      .map(toHistoryEntry)
      .filter((entry): entry is SessionHistoryEntry => Boolean(entry));
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return [];
}

function parseHistoryFromLog(logTail: string): SessionHistoryEntry[] {
  return logTail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      role: "unknown" as const,
      content: line,
    }));
}

export async function getSessionRecentHistory(
  sessionId: string,
  options?: SessionHistoryOptions,
): Promise<SessionRecentHistory | null> {
  const session: SessionRecord | null = await getSession(sessionId);
  if (!session) return null;

  const { maxItems, maxChars } = normalizeHistoryLimits(options);
  const details = asRecord(session.details);

  const detailEntries = parseHistoryFromDetails(details);
  if (detailEntries.length > 0) {
    return summarizeHistory(detailEntries, maxItems, maxChars, "details");
  }

  const logPath = getLogPath(details);
  if (logPath) {
    try {
      const logTail = await readLogTail(logPath, maxChars);
      const logEntries = parseHistoryFromLog(logTail);
      if (logEntries.length > 0) {
        return summarizeHistory(logEntries, maxItems, maxChars, "log");
      }
    } catch {
      // Keep fallback behavior when logs are not accessible.
    }
  }

  return {
    source: "none",
    items: [],
    truncated: false,
    total_items: 0,
    total_chars: 0,
  };
}
