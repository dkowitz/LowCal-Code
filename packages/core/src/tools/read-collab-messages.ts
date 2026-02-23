/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from "@google/genai";
import type { Config } from "../config/config.js";
import { readCollabMessages, type CollabMessage } from "../collab/store.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";

export interface ReadCollabMessagesParams {
  since_seq?: number;
  limit?: number;
  include_all_targets?: boolean;
  include_expired?: boolean;
  session_id?: string;
}

const readCollabMessagesToolSchema: FunctionDeclaration = {
  name: ToolNames.READ_COLLAB_MESSAGES,
  description:
    "Read collaboration board messages from the shared workspace. Use this instead of shelling out to /collab commands.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      since_seq: {
        type: "number",
        description: "Optional lower bound sequence number (exclusive).",
      },
      limit: {
        type: "number",
        description: "Maximum number of messages to return. Default 20, max 200.",
      },
      include_all_targets: {
        type: "boolean",
        description:
          "If true, include messages for all session targets. If false, scope to the current session plus broadcasts.",
      },
      include_expired: {
        type: "boolean",
        description: "If true, include messages whose ttl_seconds has expired.",
      },
      session_id: {
        type: "string",
        description:
          "Optional session id scope when include_all_targets is false. Defaults to the current session id.",
      },
    },
    $schema: "http://json-schema.org/draft-07/schema#",
  },
};

const readCollabMessagesToolDescription = `
Read collab board messages from \`.lowcal/collab/messages.jsonl\`.

Use this tool to inspect inter-session collaboration traffic without running shell commands.
When responding, prefer \`post_collab_message\` with \`in_reply_to\` so message threads stay coherent.
`;

function normalizeNonNegativeInteger(
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
  if (normalized < 0) {
    throw new Error(`${fieldName} must be >= 0.`);
  }
  return normalized;
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

function formatMessage(message: CollabMessage): string {
  const target = message.to_session_id ?? "all";
  const timestamp = new Date(message.timestamp).toLocaleString();
  const refs =
    message.refs && message.refs.length > 0
      ? `\n  refs: ${message.refs.join(", ")}`
      : "";
  const replyTo = message.in_reply_to ? `\n  in_reply_to: ${message.in_reply_to}` : "";
  return (
    `[${message.seq}] ${message.type} ${message.from_session_id} -> ${target} at ${timestamp}` +
    `\n  message_id: ${message.message_id}` +
    `\n  notify: ${message.notify ?? "passive"}` +
    `\n  ${message.text}${refs}${replyTo}`
  );
}

class ReadCollabMessagesInvocation extends BaseToolInvocation<
  ReadCollabMessagesParams,
  ToolResult
> {
  constructor(
    params: ReadCollabMessagesParams,
    private readonly config: Config,
  ) {
    super(params);
  }

  getDescription(): string {
    const sessionId = this.params.session_id ?? this.config.getSessionId();
    return `Reading collab messages for ${sessionId}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const sinceSeq = normalizeNonNegativeInteger(this.params.since_seq, "since_seq");
      const limit = normalizePositiveInteger(this.params.limit, "limit");
      const includeAllTargets = this.params.include_all_targets === true;
      const includeExpired = this.params.include_expired === true;
      const fallbackSessionId = this.config.getSessionId();
      const requestedSessionId = this.params.session_id?.trim();
      const sessionId =
        requestedSessionId && requestedSessionId.length > 0
          ? requestedSessionId
          : fallbackSessionId;
      const messages = await readCollabMessages(this.config.getTargetDir(), {
        sessionId: includeAllTargets ? undefined : sessionId,
        sinceSeq,
        limit,
        includeExpired,
      });

      const header = includeAllTargets
        ? "Collab messages (all targets):"
        : `Collab messages for "${sessionId}":`;
      const body =
        messages.length === 0
          ? "- none"
          : messages.map((message) => formatMessage(message)).join("\n\n");
      const output = `${header}\n\n${body}`;
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

export class ReadCollabMessagesTool extends BaseDeclarativeTool<
  ReadCollabMessagesParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_COLLAB_MESSAGES;

  constructor(private readonly config: Config) {
    super(
      ToolNames.READ_COLLAB_MESSAGES,
      "Read Collab Messages",
      readCollabMessagesToolDescription,
      Kind.Other,
      readCollabMessagesToolSchema.parametersJsonSchema,
      true,
      false,
    );
  }

  protected override createInvocation(
    params: ReadCollabMessagesParams,
  ): ReadCollabMessagesInvocation {
    return new ReadCollabMessagesInvocation(params, this.config);
  }
}
