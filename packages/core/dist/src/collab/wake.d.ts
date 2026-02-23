/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionRecord } from "../sessions/types.js";
import type { CollabMessage, CollabNotifyMode } from "./store.js";
interface SessionApiEnvelope {
    id?: string | number;
    ok: boolean;
    result?: unknown;
    error?: string;
}
type CallSessionApiFn = (socketPath: string, method: "session.enqueue_task", authToken: string | undefined, params: Record<string, unknown>) => Promise<SessionApiEnvelope | null>;
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
export declare function enqueueCollabWakeForMessage(input: {
    message: CollabMessage;
    notifyMode?: CollabNotifyMode;
}, dependencies?: EnqueueCollabWakeDependencies): Promise<EnqueueCollabWakeResult>;
export {};
