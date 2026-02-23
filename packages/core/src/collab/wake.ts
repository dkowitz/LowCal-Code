/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as net from "node:net";
import { getSession } from "../sessions/index.js";
import type { SessionRecord } from "../sessions/types.js";
import type { CollabMessage, CollabNotifyMode } from "./store.js";

interface SessionApiEnvelope {
  id?: string | number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface SessionApiControlResult {
  accepted: boolean;
  reason?: string;
  action_id?: string;
}

interface CollabWakeAction {
  actionType: "prompt" | "slash_command";
  actionValue: string;
}

type CallSessionApiFn = (
  socketPath: string,
  method: "session.enqueue_task",
  authToken: string | undefined,
  params: Record<string, unknown>,
) => Promise<SessionApiEnvelope | null>;

export interface EnqueueCollabWakeDependencies {
  resolveSession?: (sessionId: string) => Promise<SessionRecord | null>;
  callSessionApi?: CallSessionApiFn;
}

export interface EnqueueCollabWakeResult {
  notifyMode: CollabNotifyMode;
  attempted: boolean;
  enqueued: boolean;
  targetSessionId?: string;
  actionType?: "prompt" | "slash_command";
  actionId?: string;
  reason?: string;
}

function parseControlResult(value: unknown): SessionApiControlResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accepted = record["accepted"];
  if (typeof accepted !== "boolean") {
    return null;
  }
  return {
    accepted,
    reason: typeof record["reason"] === "string" ? record["reason"] : undefined,
    action_id:
      typeof record["action_id"] === "string" ? record["action_id"] : undefined,
  };
}

async function callSessionApi(
  socketPath: string,
  method: "session.enqueue_task",
  authToken: string | undefined,
  params: Record<string, unknown>,
): Promise<SessionApiEnvelope | null> {
  return await new Promise<SessionApiEnvelope | null>((resolve) => {
    const request = {
      id: `collab-wake-${Date.now()}`,
      method,
      auth_token: authToken,
      params,
    };
    let resolved = false;
    let buffer = "";
    const socket = net.createConnection({ path: socketPath });
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(null);
    }, 1500);
    const finish = (value: SessionApiEnvelope | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(value);
    };
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const line = buffer.slice(0, newlineIndex).trim();
      if (!line) {
        finish(null);
        return;
      }
      try {
        finish(JSON.parse(line) as SessionApiEnvelope);
      } catch {
        finish(null);
      }
    });
    socket.on("error", () => finish(null));
    socket.on("end", () => finish(null));
  });
}

function buildWakeAction(
  message: CollabMessage,
  notifyMode: CollabNotifyMode,
): CollabWakeAction | null {
  if (notifyMode === "passive") {
    return null;
  }

  const sinceSeq = Math.max(0, message.seq - 1);
  if (notifyMode === "wake_view") {
    return {
      actionType: "slash_command",
      actionValue: `/collab view --since ${sinceSeq} --limit 20`,
    };
  }

  const preview = message.text.replace(/\s+/g, " ").trim().slice(0, 240);
  const refsText =
    message.refs && message.refs.length > 0
      ? ` Refs: ${message.refs.join(", ")}.`
      : "";
  const replyInstruction =
    `If a response is needed, send exactly one post_collab_message ` +
    `to "${message.from_session_id}" with in_reply_to="${message.message_id}".`;
  const protocolInstruction =
    `Protocol: request -> ack -> result. ` +
    `Use type='request' to ask for work. ` +
    `Use type='ack' once with notify='passive'. ` +
    `Use type='result' when work is complete. ` +
    `Do not acknowledge acknowledgements. ` +
    `Use notify='wake_prompt' only for requests or urgent results that require immediate action.`;
  return {
    actionType: "prompt",
    actionValue:
      `Collab wake-up: new message [${message.seq}] (${message.message_id}) ` +
      `from session "${message.from_session_id}". ` +
      `Preview: "${preview}".${refsText} ` +
      `Do not run shell commands for this. ` +
      `Use read_collab_messages(since_seq=${sinceSeq}, limit=20) if available; ` +
      `otherwise use slash command /collab view --since ${sinceSeq} --limit 20 (slash command, not shell). ` +
      `${replyInstruction} ` +
      `${protocolInstruction}`,
  };
}

export async function enqueueCollabWakeForMessage(
  input: { message: CollabMessage; notifyMode?: CollabNotifyMode },
  dependencies: EnqueueCollabWakeDependencies = {},
): Promise<EnqueueCollabWakeResult> {
  const notifyMode = input.notifyMode ?? input.message.notify ?? "passive";
  const targetSessionId = input.message.to_session_id?.trim();
  if (input.message.type.trim().toLowerCase() === "ack") {
    return {
      notifyMode,
      attempted: false,
      enqueued: false,
      targetSessionId,
      reason: "ack_suppressed",
    };
  }
  const wakeAction = buildWakeAction(input.message, notifyMode);
  if (!wakeAction) {
    return {
      notifyMode,
      attempted: false,
      enqueued: false,
      targetSessionId,
      reason: "passive_mode",
    };
  }

  if (!targetSessionId || targetSessionId === "all") {
    return {
      notifyMode,
      attempted: false,
      enqueued: false,
      targetSessionId,
      actionType: wakeAction.actionType,
      reason: "notify_requires_direct_target",
    };
  }

  if (targetSessionId === input.message.from_session_id) {
    return {
      notifyMode,
      attempted: false,
      enqueued: false,
      targetSessionId,
      actionType: wakeAction.actionType,
      reason: "self_target_not_supported",
    };
  }

  try {
    const resolveSession = dependencies.resolveSession ?? getSession;
    const sendRequest = dependencies.callSessionApi ?? callSessionApi;
    const session = await resolveSession(targetSessionId);
    if (!session?.api) {
      return {
        notifyMode,
        attempted: true,
        enqueued: false,
        targetSessionId,
        actionType: wakeAction.actionType,
        reason: "target_session_unavailable",
      };
    }
    if (session.api.transport !== "unix") {
      return {
        notifyMode,
        attempted: true,
        enqueued: false,
        targetSessionId,
        actionType: wakeAction.actionType,
        reason: `unsupported_transport:${session.api.transport}`,
      };
    }

    const response = await sendRequest(
      session.api.address,
      "session.enqueue_task",
      session.api.auth_token,
      {
        task_id: `collab-wake-${input.message.message_id}`,
        action_type: wakeAction.actionType,
        action_value: wakeAction.actionValue,
        description: `Collab wake for message ${input.message.message_id}`,
        source_session_id: input.message.from_session_id,
      },
    );
    if (!response || response.ok !== true) {
      return {
        notifyMode,
        attempted: true,
        enqueued: false,
        targetSessionId,
        actionType: wakeAction.actionType,
        reason: response?.error ?? "session_api_unavailable",
      };
    }
    const control = parseControlResult(response.result);
    if (!control?.accepted) {
      return {
        notifyMode,
        attempted: true,
        enqueued: false,
        targetSessionId,
        actionType: wakeAction.actionType,
        reason: control?.reason ?? "enqueue_rejected",
      };
    }

    return {
      notifyMode,
      attempted: true,
      enqueued: true,
      targetSessionId,
      actionType: wakeAction.actionType,
      actionId: control.action_id,
    };
  } catch (error) {
    return {
      notifyMode,
      attempted: true,
      enqueued: false,
      targetSessionId,
      actionType: wakeAction.actionType,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
