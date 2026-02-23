/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from "@google/genai";
import { getSession, listSessions } from "../sessions/session-store.js";
import type { SessionRecord } from "../sessions/types.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";

type ReadSessionsAction = "list" | "get";

export interface ReadSessionsParams {
  action?: ReadSessionsAction;
  session_id?: string;
  ttl_seconds?: number;
  include_stale?: boolean;
  limit?: number;
}

const DEFAULT_TTL_SECONDS = 180;
const MAX_LIMIT = 200;

const readSessionsToolSchemaData: FunctionDeclaration = {
  name: ToolNames.READ_SESSIONS,
  description:
    "Read active LowCal sessions from the global session store. Use this instead of shelling out to /sessions.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get"],
        description:
          "Session action. list = list active sessions (default), get = return one session record by session_id.",
      },
      session_id: {
        type: "string",
        description:
          "Session id for action=get. Optional for list (ignored unless supplied for get).",
      },
      ttl_seconds: {
        type: "number",
        description:
          "Stale threshold in seconds used for active/stale status. Default 180.",
      },
      include_stale: {
        type: "boolean",
        description:
          "For list action: include stale sessions in results. Default false.",
      },
      limit: {
        type: "number",
        description:
          "For list action: maximum sessions to return. Default: unlimited, max 200.",
      },
    },
    $schema: "http://json-schema.org/draft-07/schema#",
  },
};

const readSessionsToolDescription = `
Read LowCal sessions from the shared session registry.

Use this tool when you need a readout similar to \`/sessions\` from inside a model tool call.

## Actions

- \`list\` (default): list active sessions (stale entries excluded unless \`include_stale=true\`).
- \`get\`: fetch one full session record by \`session_id\`.
`;

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

function normalizeTtlSeconds(ttlSeconds: number | undefined): number {
  const normalized = normalizePositiveInteger(ttlSeconds, "ttl_seconds");
  return normalized ?? DEFAULT_TTL_SECONDS;
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

function formatSessionLine(
  session: SessionRecord,
  nowMs: number,
  ttlMs: number,
): string {
  const stale = isSessionStale(session, nowMs, ttlMs);
  const status = stale ? "stale" : session.status;
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
    `started_at=${session.started_at}`,
    `last_seen=${session.last_seen}`,
  ];
  if (jobId) {
    parts.push(`job_id=${jobId}`);
  }
  if (typeof activeExecutions === "number") {
    parts.push(`active_executions=${activeExecutions}`);
  }
  if (session.health) {
    parts.push(`health=${session.health.state}`);
    if (session.health.reason) {
      parts.push(`reason=${session.health.reason}`);
    }
  }
  return parts.join(" ");
}

class ReadSessionsInvocation extends BaseToolInvocation<
  ReadSessionsParams,
  ToolResult
> {
  getDescription(): string {
    const action = this.params.action ?? "list";
    if (action === "get") {
      return `Reading session record for ${this.params.session_id ?? "(missing session_id)"}`;
    }
    return "Reading active session list";
  }

  async execute(): Promise<ToolResult> {
    try {
      const action = this.params.action ?? "list";
      if (action === "get") {
        const sessionId =
          typeof this.params.session_id === "string"
            ? this.params.session_id.trim()
            : "";
        if (!sessionId) {
          throw new Error('session_id is required for action="get".');
        }
        const session = await getSession(sessionId);
        if (!session) {
          const notFound = `Session not found: ${sessionId}`;
          return {
            llmContent: notFound,
            returnDisplay: notFound,
          };
        }
        const output = JSON.stringify(session, null, 2);
        return {
          llmContent: output,
          returnDisplay: output,
        };
      }

      const nowMs = Date.now();
      const ttlSeconds = normalizeTtlSeconds(this.params.ttl_seconds);
      const ttlMs = ttlSeconds * 1000;
      const includeStale = this.params.include_stale === true;
      const limit = normalizePositiveInteger(this.params.limit, "limit");
      if (limit && limit > MAX_LIMIT) {
        throw new Error(`limit must be <= ${MAX_LIMIT}.`);
      }

      const sessions = await listSessions();
      const filtered = includeStale
        ? sessions
        : sessions.filter((session) => !isSessionStale(session, nowMs, ttlMs));

      if (filtered.length === 0) {
        const emptyMessage = includeStale
          ? "No sessions found."
          : `No active sessions found (ttl=${ttlSeconds}s).`;
        return {
          llmContent: emptyMessage,
          returnDisplay: emptyMessage,
        };
      }

      const sorted = sortSessions(filtered, nowMs, ttlMs);
      const limited = limit ? sorted.slice(0, limit) : sorted;
      const scope = includeStale ? "total" : "active";
      const truncated =
        limited.length < sorted.length ? ` (showing ${limited.length})` : "";
      const lines = [
        `Sessions (${sorted.length} ${scope})${truncated}:`,
        ...limited.map((session) => formatSessionLine(session, nowMs, ttlMs)),
      ];
      const output = lines.join("\n");
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

export class ReadSessionsTool extends BaseDeclarativeTool<
  ReadSessionsParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_SESSIONS;

  constructor() {
    super(
      ToolNames.READ_SESSIONS,
      "Read Sessions",
      readSessionsToolDescription,
      Kind.Other,
      readSessionsToolSchemaData.parametersJsonSchema,
      true,
      false,
    );
  }

  protected override createInvocation(
    params: ReadSessionsParams,
  ): ReadSessionsInvocation {
    return new ReadSessionsInvocation(params);
  }
}
