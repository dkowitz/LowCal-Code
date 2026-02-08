/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionHealthReason, SessionHealthSnapshot, SessionHealthState, SessionRecord, SessionStatus } from "./types.js";
export interface SetSessionHealthInput {
    state: SessionHealthState;
    reason?: SessionHealthReason;
    confidence?: number;
    evidence?: Record<string, unknown>;
    remediation?: SessionHealthSnapshot["remediation"];
}
export declare function registerSession(session: SessionRecord): Promise<void>;
export declare function getSession(sessionId: string): Promise<SessionRecord | null>;
export declare function updateSession(sessionId: string, patch: Partial<SessionRecord>): Promise<SessionRecord | null>;
export declare function heartbeatSession(sessionId: string, status?: SessionStatus): Promise<SessionRecord | null>;
export declare function setSessionHealth(sessionId: string, input: SetSessionHealthInput): Promise<SessionRecord | null>;
export declare function clearSessionHealth(sessionId: string): Promise<SessionRecord | null>;
export declare function removeSession(sessionId: string): Promise<boolean>;
/**
 * Kill a session by terminating its process
 */
export declare function killSession(sessionId: string): Promise<boolean>;
export declare function listSessions(): Promise<SessionRecord[]>;
export declare function pruneStaleSessions(ttlMs: number): Promise<SessionRecord[]>;
