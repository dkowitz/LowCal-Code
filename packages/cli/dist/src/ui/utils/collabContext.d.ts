/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PartListUnion } from "@google/genai";
export interface InjectCollabContextOptions {
    baseDir: string;
    sessionId: string;
    query: PartListUnion;
    maxMessages?: number;
    maxSessions?: number;
}
export interface InjectCollabContextResult {
    query: PartListUnion;
    unreadCount: number;
    sessionsCount: number;
    cursorBefore: number;
    cursorAfter: number;
}
export declare function injectCollabContextForTurn(options: InjectCollabContextOptions): Promise<InjectCollabContextResult>;
