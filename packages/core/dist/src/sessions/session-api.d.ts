/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionContextSummary, SessionHealthSnapshot, SessionRecentHistory, SessionStatusView } from "./types.js";
export declare function getSessionStatusView(sessionId: string): Promise<SessionStatusView | null>;
export declare function getSessionHealthView(sessionId: string): Promise<SessionHealthSnapshot | null>;
export declare function getSessionContextSummary(sessionId: string): Promise<SessionContextSummary | null>;
export interface SessionHistoryOptions {
    max_items?: number;
    max_chars?: number;
}
export declare function getSessionRecentHistory(sessionId: string, options?: SessionHistoryOptions): Promise<SessionRecentHistory | null>;
