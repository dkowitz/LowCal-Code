/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "../sessions/types.js";
import type { CollabMessage } from "./store.js";
import { enqueueCollabWakeForMessage } from "./wake.js";

function makeMessage(overrides: Partial<CollabMessage> = {}): CollabMessage {
  return {
    message_id: "1-abcd1234",
    seq: 1,
    timestamp: "2026-02-22T00:00:00.000Z",
    from_session_id: "session-a",
    to_session_id: "session-b",
    type: "note",
    text: "Please review src/main.ts",
    notify: "passive",
    ...overrides,
  };
}

function makeSession(sessionId: string): SessionRecord {
  return {
    id: sessionId,
    pid: 1234,
    mode: "tui",
    cwd: "/workspace",
    started_at: "2026-02-22T00:00:00.000Z",
    last_seen: "2026-02-22T00:00:01.000Z",
    status: "idle",
    api: {
      transport: "unix",
      address: "/tmp/lowcal-session.sock",
      version: "v1",
      auth_token: "token-1",
    },
  };
}

describe("enqueueCollabWakeForMessage", () => {
  it("returns passive result without attempting enqueue", async () => {
    const result = await enqueueCollabWakeForMessage({
      message: makeMessage({ notify: "passive" }),
    });

    expect(result).toMatchObject({
      notifyMode: "passive",
      attempted: false,
      enqueued: false,
      reason: "passive_mode",
    });
  });

  it("requires a direct target for wake modes", async () => {
    const result = await enqueueCollabWakeForMessage({
      message: makeMessage({
        to_session_id: undefined,
        notify: "wake_prompt",
      }),
    });

    expect(result).toMatchObject({
      notifyMode: "wake_prompt",
      attempted: false,
      enqueued: false,
      reason: "notify_requires_direct_target",
    });
  });

  it("returns unavailable when target session cannot be resolved", async () => {
    const result = await enqueueCollabWakeForMessage(
      {
        message: makeMessage({ notify: "wake_view" }),
      },
      {
        resolveSession: vi.fn(async () => null),
      },
    );

    expect(result).toMatchObject({
      notifyMode: "wake_view",
      attempted: true,
      enqueued: false,
      reason: "target_session_unavailable",
      targetSessionId: "session-b",
    });
  });

  it("suppresses wakes for acknowledgements", async () => {
    const result = await enqueueCollabWakeForMessage({
      message: makeMessage({
        type: "ack",
        notify: "wake_prompt",
      }),
    });

    expect(result).toMatchObject({
      notifyMode: "wake_prompt",
      attempted: false,
      enqueued: false,
      reason: "ack_suppressed",
    });
  });

  it("enqueues a prompt wake for a direct target session", async () => {
    const resolveSession = vi.fn(async () => makeSession("session-b"));
    const callSessionApi = vi.fn(async () => ({
      ok: true,
      result: {
        accepted: true,
        action_id: "action-1",
      },
    }));

    const result = await enqueueCollabWakeForMessage(
      {
        message: makeMessage({
          seq: 42,
          message_id: "42-xyz12345",
          notify: "wake_prompt",
        }),
      },
      {
        resolveSession,
        callSessionApi,
      },
    );

    expect(result).toMatchObject({
      notifyMode: "wake_prompt",
      attempted: true,
      enqueued: true,
      targetSessionId: "session-b",
      actionType: "prompt",
      actionId: "action-1",
    });
    expect(callSessionApi).toHaveBeenCalledTimes(1);
    expect(callSessionApi).toHaveBeenCalledWith(
      "/tmp/lowcal-session.sock",
      "session.enqueue_task",
      "token-1",
      expect.objectContaining({
        task_id: "collab-wake-42-xyz12345",
        action_type: "prompt",
        action_value: expect.stringContaining(
          "Do not run shell commands for this.",
        ),
        source_session_id: "session-a",
      }),
    );
    expect(callSessionApi).toHaveBeenCalledWith(
      "/tmp/lowcal-session.sock",
      "session.enqueue_task",
      "token-1",
      expect.objectContaining({
        action_value: expect.stringContaining("read_collab_messages"),
      }),
    );
    expect(callSessionApi).toHaveBeenCalledWith(
      "/tmp/lowcal-session.sock",
      "session.enqueue_task",
      "token-1",
      expect.objectContaining({
        action_value: expect.stringContaining("Protocol: request -> ack -> result."),
      }),
    );
  });
});
