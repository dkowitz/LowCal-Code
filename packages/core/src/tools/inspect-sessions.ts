/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from "@google/genai";
import {
  getSessionContextSummary,
  getSessionRecentHistory,
  getSessionStatusView,
} from "../sessions/session-api.js";
import { getSession, listSessions } from "../sessions/session-store.js";
import type {
  SessionContextSummary,
  SessionRecord,
  SessionRecentHistory,
} from "../sessions/types.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";

const DEFAULT_TTL_SECONDS = 180;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const DEFAULT_MAX_MESSAGES = 12;
const MAX_MAX_MESSAGES = 100;
const DEFAULT_MAX_MESSAGE_CHARS = 4000;
const MAX_MAX_MESSAGE_CHARS = 20000;
const MAX_MESSAGE_PREVIEW_CHARS = 600;

const ERROR_PATTERN =
  /(error|failed|failure|exception|traceback|timeout|unauthorized|rate limit|429|loop)/i;

export interface InspectSessionsParams {
  session_id?: string;
  include_stale?: boolean;
  ttl_seconds?: number;
  limit?: number;
  include_history?: boolean;
  max_messages?: number;
  max_message_chars?: number;
  include_details?: boolean;
}

const inspectSessionsToolSchema: FunctionDeclaration = {
  name: ToolNames.INSPECT_SESSIONS,
  description:
    "Inspect internal runtime state for one or more running sessions, including message tail, model/auth context, health, and error signals.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      session_id: {
        type: "string",
        description:
          "Optional target session id. If omitted, inspects multiple sessions from the registry.",
      },
      include_stale: {
        type: "boolean",
        description:
          "When session_id is omitted, include stale sessions. Default false.",
      },
      ttl_seconds: {
        type: "number",
        description:
          "Stale threshold in seconds. Default 180 seconds.",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of sessions when session_id is omitted. Default 20, max 200.",
      },
      include_history: {
        type: "boolean",
        description:
          "Include recent conversation/message tail for each session. Default true.",
      },
      max_messages: {
        type: "number",
        description:
          "Maximum recent messages per session when include_history=true. Default 12, max 100.",
      },
      max_message_chars: {
        type: "number",
        description:
          "Maximum total characters to read from recent history per session. Default 4000, max 20000.",
      },
      include_details: {
        type: "boolean",
        description:
          "Include a sanitized details preview from the session record metadata. Default false.",
      },
    },
    $schema: "http://json-schema.org/draft-07/schema#",
  },
};

const inspectSessionsToolDescription = `
Inspect internal runtime state for one or more sessions.

This tool is intended for orchestration/supervision workflows where a parent agent
needs to assess what other sessions are doing (or why they appear idle/stalled).

Returned data includes:
- session status, staleness, health, and process liveness
- model/approval/auth metadata
- context-window/token budget estimate (when available)
- recent message tail and extracted error signals

Use this before deciding whether to send \`post_collab_message\` (for example with \`notify="wake_prompt"\`).
`;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function normalizePositiveInteger(
  value: number | undefined,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
  const normalized = Math.floor(value);
  if (normalized < 1) {
    throw new Error(`${fieldName} must be >= 1.`);
  }
  return normalized;
}

function normalizeTtlSeconds(value: number | undefined): number {
  const ttl = normalizePositiveInteger(value, "ttl_seconds");
  return ttl ?? DEFAULT_TTL_SECONDS;
}

function normalizeLimit(value: number | undefined): number {
  const limit = normalizePositiveInteger(value, "limit") ?? DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    throw new Error(`limit must be <= ${MAX_LIMIT}.`);
  }
  return limit;
}

function normalizeMaxMessages(value: number | undefined): number {
  const maxMessages =
    normalizePositiveInteger(value, "max_messages") ?? DEFAULT_MAX_MESSAGES;
  if (maxMessages > MAX_MAX_MESSAGES) {
    throw new Error(`max_messages must be <= ${MAX_MAX_MESSAGES}.`);
  }
  return maxMessages;
}

function normalizeMaxMessageChars(value: number | undefined): number {
  const maxChars =
    normalizePositiveInteger(value, "max_message_chars") ??
    DEFAULT_MAX_MESSAGE_CHARS;
  if (maxChars > MAX_MAX_MESSAGE_CHARS) {
    throw new Error(`max_message_chars must be <= ${MAX_MAX_MESSAGE_CHARS}.`);
  }
  return maxChars;
}

function isSessionStale(
  session: SessionRecord,
  nowMs: number,
  ttlMs: number,
): boolean {
  const lastSeen = Date.parse(session.last_seen);
  return Number.isFinite(lastSeen) && nowMs - lastSeen > ttlMs;
}

function sortSessions(
  sessions: SessionRecord[],
  nowMs: number,
  ttlMs: number,
): SessionRecord[] {
  return [...sessions].sort((a, b) => {
    const aLast = Date.parse(a.last_seen);
    const bLast = Date.parse(b.last_seen);
    const aStale = isSessionStale(a, nowMs, ttlMs);
    const bStale = isSessionStale(b, nowMs, ttlMs);
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
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getAuthLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const selectedType = asString(record["selectedType"]);
  const providerId = asString(record["providerId"]);
  const providerType = asString(record["provider_type"]);
  const parts = [selectedType, providerId, providerType].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(":");
}

function pickNumber(
  source: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = asFiniteNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function deriveContextWindow(
  tokenBudget: Record<string, unknown> | undefined,
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const currentTokens =
    pickNumber(tokenBudget, [
      "current_tokens",
      "current",
      "tokens",
      "current_context_tokens",
    ]) ?? asFiniteNumber(details?.["current_context_tokens"]);
  const limitTokens =
    pickNumber(tokenBudget, [
      "effective_limit",
      "limit",
      "session_token_limit",
      "context_limit",
    ]) ?? asFiniteNumber(details?.["session_token_limit"]);

  if (currentTokens === undefined && limitTokens === undefined) {
    return undefined;
  }

  let state = "unknown";
  let utilizationRatio: number | undefined;
  if (
    currentTokens !== undefined &&
    limitTokens !== undefined &&
    limitTokens > 0
  ) {
    utilizationRatio = currentTokens / limitTokens;
    if (utilizationRatio >= 1) {
      state = "exceeded";
    } else if (utilizationRatio >= 0.9) {
      state = "critical";
    } else if (utilizationRatio >= 0.75) {
      state = "high";
    } else if (utilizationRatio >= 0.5) {
      state = "moderate";
    } else {
      state = "normal";
    }
  } else if (currentTokens !== undefined) {
    state = "unknown_limit";
  } else if (limitTokens !== undefined) {
    state = "unknown_usage";
  }

  const output: Record<string, unknown> = { state };
  if (currentTokens !== undefined) {
    output["current_tokens"] = currentTokens;
  }
  if (limitTokens !== undefined) {
    output["limit_tokens"] = limitTokens;
  }
  if (utilizationRatio !== undefined) {
    output["utilization_ratio"] = utilizationRatio;
  }
  return output;
}

function summarizeHistoryEntries(
  history: SessionRecentHistory,
): Array<Record<string, unknown>> {
  return history.items.map((item) => {
    const collapsed = item.content.replace(/\s+/g, " ").trim();
    const content =
      collapsed.length > MAX_MESSAGE_PREVIEW_CHARS
        ? `${collapsed.slice(0, MAX_MESSAGE_PREVIEW_CHARS)}...`
        : collapsed;
    const entry: Record<string, unknown> = {
      role: item.role,
      content,
    };
    if (item.timestamp) {
      entry["timestamp"] = item.timestamp;
    }
    return entry;
  });
}

function collectErrorSignals(
  session: SessionRecord,
  details: Record<string, unknown> | undefined,
  history: SessionRecentHistory | undefined,
  contextWindow: Record<string, unknown> | undefined,
): string[] {
  const signals = new Set<string>();

  if (session.health?.state && session.health.state !== "ok") {
    const reason = session.health.reason ? `:${session.health.reason}` : "";
    signals.add(`health:${session.health.state}${reason}`);
  }

  const lastError = asString(details?.["last_error"]);
  if (lastError && lastError.trim().length > 0) {
    signals.add(`last_error:${lastError.trim().slice(0, 160)}`);
  }

  const contextState = asString(contextWindow?.["state"]);
  if (contextState === "critical" || contextState === "exceeded") {
    signals.add(`context_window:${contextState}`);
  }

  if (history) {
    for (const item of history.items) {
      if (ERROR_PATTERN.test(item.content)) {
        const compact = item.content.replace(/\s+/g, " ").trim();
        signals.add(`history:${compact.slice(0, 160)}`);
      }
      if (signals.size >= 8) {
        break;
      }
    }
  }

  return Array.from(signals);
}

function summarizeValue(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    return "[truncated]";
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      preview: value.slice(0, 5).map((entry) => summarizeValue(entry, depth + 1)),
    };
  }
  const record = asRecord(value);
  if (!record) {
    return String(value);
  }
  const output: Record<string, unknown> = {};
  const keys = Object.keys(record).slice(0, 25);
  for (const key of keys) {
    if (
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("password") ||
      key.includes("apiKey") ||
      key.includes("api_key")
    ) {
      output[key] = "[redacted]";
      continue;
    }
    if (key === "recent_history" || key === "history") {
      const historyValue = record[key];
      if (Array.isArray(historyValue)) {
        output[key] = { type: "array", length: historyValue.length };
      } else {
        output[key] = summarizeValue(historyValue, depth + 1);
      }
      continue;
    }
    output[key] = summarizeValue(record[key], depth + 1);
  }
  return output;
}

function buildDetailsPreview(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }
  const summarized = summarizeValue(details);
  return asRecord(summarized);
}

async function inspectSession(
  session: SessionRecord,
  options: {
    nowMs: number;
    ttlMs: number;
    includeHistory: boolean;
    maxMessages: number;
    maxMessageChars: number;
    includeDetails: boolean;
  },
): Promise<Record<string, unknown>> {
  const statusView = await getSessionStatusView(session.id);
  const contextSummary: SessionContextSummary | null =
    await getSessionContextSummary(session.id);
  const history: SessionRecentHistory | null = options.includeHistory
    ? await getSessionRecentHistory(session.id, {
        max_items: options.maxMessages,
        max_chars: options.maxMessageChars,
      })
    : null;

  const details = {
    ...(asRecord(session.details) ?? {}),
    ...(asRecord(contextSummary?.metadata) ?? {}),
  };
  const mergedDetails = Object.keys(details).length > 0 ? details : undefined;
  const tokenBudget =
    asRecord(contextSummary?.token_budget) ??
    asRecord(mergedDetails?.["token_budget"]);
  const contextWindow = deriveContextWindow(tokenBudget, mergedDetails);

  const record: Record<string, unknown> = {
    session_id: session.id,
    mode: session.mode,
    pid: session.pid,
    cwd: session.cwd,
    status: statusView?.status ?? session.status,
    stale: isSessionStale(session, options.nowMs, options.ttlMs),
    process_alive: isProcessAlive(session.pid),
    started_at: session.started_at,
    last_seen: session.last_seen,
    capabilities: session.capabilities,
    health: session.health,
    model:
      contextSummary?.model ??
      asString(mergedDetails?.["model"]) ??
      asString(mergedDetails?.["model_actual"]),
    approval_mode:
      contextSummary?.approval_mode ??
      asString(mergedDetails?.["approval_mode"]),
    auth:
      getAuthLabel(mergedDetails?.["auth_type"]) ??
      getAuthLabel(mergedDetails?.["auth"]) ??
      getAuthLabel(mergedDetails?.["auth_actual"]),
    active_tool_calls:
      contextSummary?.active_tool_calls ??
      asFiniteNumber(mergedDetails?.["active_tool_calls"]),
    turn_age_ms: contextSummary?.turn_age_ms,
    context_window: contextWindow,
    api: session.api
      ? {
          transport: session.api.transport,
          address: session.api.address,
          version: session.api.version,
        }
      : undefined,
  };

  const lastSeenMs = Date.parse(session.last_seen);
  if (Number.isFinite(lastSeenMs)) {
    record["last_seen_age_ms"] = Math.max(0, options.nowMs - lastSeenMs);
  }

  if (statusView?.current_phase) {
    record["phase"] = statusView.current_phase;
  }

  const historyForErrors = history ?? undefined;
  record["error_signals"] = collectErrorSignals(
    session,
    mergedDetails,
    historyForErrors,
    contextWindow,
  );

  if (history) {
    record["recent_messages"] = {
      source: history.source,
      truncated: history.truncated,
      total_items: history.total_items,
      total_chars: history.total_chars,
      items: summarizeHistoryEntries(history),
    };
  }

  if (options.includeDetails) {
    record["details"] = buildDetailsPreview(mergedDetails);
  }

  return record;
}

class InspectSessionsInvocation extends BaseToolInvocation<
  InspectSessionsParams,
  ToolResult
> {
  getDescription(): string {
    if (typeof this.params.session_id === "string" && this.params.session_id.trim()) {
      return `Inspecting session ${this.params.session_id.trim()}`;
    }
    return "Inspecting running sessions";
  }

  async execute(): Promise<ToolResult> {
    try {
      const ttlSeconds = normalizeTtlSeconds(this.params.ttl_seconds);
      const ttlMs = ttlSeconds * 1000;
      const includeStale = this.params.include_stale === true;
      const includeHistory = this.params.include_history !== false;
      const includeDetails = this.params.include_details === true;
      const maxMessages = normalizeMaxMessages(this.params.max_messages);
      const maxMessageChars = normalizeMaxMessageChars(
        this.params.max_message_chars,
      );
      const nowMs = Date.now();

      let sessions: SessionRecord[] = [];
      let truncated = false;
      const requestedSessionId =
        typeof this.params.session_id === "string"
          ? this.params.session_id.trim()
          : "";

      if (requestedSessionId.length > 0) {
        const one = await getSession(requestedSessionId);
        if (!one) {
          const notFound = `Session not found: ${requestedSessionId}`;
          return {
            llmContent: notFound,
            returnDisplay: notFound,
          };
        }
        sessions = [one];
      } else {
        const limit = normalizeLimit(this.params.limit);
        const all = await listSessions();
        const filtered = includeStale
          ? all
          : all.filter((session) => !isSessionStale(session, nowMs, ttlMs));
        const sorted = sortSessions(filtered, nowMs, ttlMs);
        if (sorted.length > limit) {
          truncated = true;
        }
        sessions = sorted.slice(0, limit);
      }

      if (sessions.length === 0) {
        const emptyMessage = includeStale
          ? "No sessions found."
          : `No active sessions found (ttl=${ttlSeconds}s).`;
        return {
          llmContent: emptyMessage,
          returnDisplay: emptyMessage,
        };
      }

      const inspected: Array<Record<string, unknown>> = [];
      for (const session of sessions) {
        inspected.push(
          await inspectSession(session, {
            nowMs,
            ttlMs,
            includeHistory,
            maxMessages,
            maxMessageChars,
            includeDetails,
          }),
        );
      }

      const report = {
        generated_at: new Date(nowMs).toISOString(),
        requested_session_id: requestedSessionId || undefined,
        ttl_seconds: ttlSeconds,
        include_stale: includeStale,
        include_history: includeHistory,
        include_details: includeDetails,
        sessions_inspected: inspected.length,
        truncated,
        sessions: inspected,
      };
      const output = JSON.stringify(report, null, 2);
      return {
        llmContent: output,
        returnDisplay: output,
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
}

export class InspectSessionsTool extends BaseDeclarativeTool<
  InspectSessionsParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.INSPECT_SESSIONS;

  constructor() {
    super(
      ToolNames.INSPECT_SESSIONS,
      "Inspect Sessions",
      inspectSessionsToolDescription,
      Kind.Other,
      inspectSessionsToolSchema.parametersJsonSchema,
      true,
      false,
    );
  }

  protected override createInvocation(
    params: InspectSessionsParams,
  ): InspectSessionsInvocation {
    return new InspectSessionsInvocation(params);
  }
}
