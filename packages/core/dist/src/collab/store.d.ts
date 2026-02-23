/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from "node:events";
export declare const COLLAB_MAX_TEXT_CHARS = 600;
export declare const COLLAB_MAX_REFS = 8;
export declare const COLLAB_MAX_TYPE_CHARS = 48;
export declare const COLLAB_MAX_SESSION_ID_CHARS = 160;
export declare const COLLAB_MAX_TTL_SECONDS: number;
export declare const COLLAB_NOTIFY_MODES: readonly ["passive", "wake_view", "wake_prompt"];
export type CollabNotifyMode = (typeof COLLAB_NOTIFY_MODES)[number];
export interface CollabMessage {
    message_id: string;
    seq: number;
    timestamp: string;
    from_session_id: string;
    to_session_id?: string;
    type: string;
    text: string;
    refs?: string[];
    in_reply_to?: string;
    ttl_seconds?: number;
    notify?: CollabNotifyMode;
    source?: "tool" | "slash_command" | "system";
}
export interface PostCollabMessageInput {
    baseDir: string;
    fromSessionId: string;
    toSessionId?: string;
    type?: string;
    text: string;
    refs?: string[];
    inReplyTo?: string;
    ttlSeconds?: number;
    notify?: CollabNotifyMode;
    source?: "tool" | "slash_command" | "system";
}
export interface PostCollabMessageResult {
    message: CollabMessage;
    notifyPath: string;
}
export interface ReadCollabMessagesOptions {
    sessionId?: string;
    sinceSeq?: number;
    limit?: number;
    includeExpired?: boolean;
}
export interface CollabPaths {
    collabDir: string;
    messagesPath: string;
    metaPath: string;
    lockPath: string;
    notifyPath: string;
}
export declare const collabEvents: EventEmitter<[never]>;
export declare function getCollabPaths(baseDir: string): CollabPaths;
export declare function postCollabMessage(input: PostCollabMessageInput): Promise<PostCollabMessageResult>;
export declare function readCollabMessages(baseDir: string, options?: ReadCollabMessagesOptions): Promise<CollabMessage[]>;
