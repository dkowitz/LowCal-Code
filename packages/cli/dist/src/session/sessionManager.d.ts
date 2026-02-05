/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionMode, SessionStatus } from "@qwen-code/qwen-code-core";
export declare const DEFAULT_SESSION_HEARTBEAT_MS: number;
export declare const DEFAULT_SESSION_TTL_MS: number;
export declare function startSessionRegistration(options: {
    id: string;
    mode: SessionMode;
    status?: SessionStatus;
    details?: Record<string, unknown>;
    cwd?: string;
    pid?: number;
    heartbeatIntervalMs?: number;
}): Promise<void>;
export declare function stopSessionRegistration(): Promise<void>;
export declare function setSessionStatus(status: SessionStatus, details?: Record<string, unknown>): Promise<void>;
export declare function updateSessionDetails(details: Record<string, unknown>): Promise<void>;
export declare function getRegisteredSessionId(): string | null;
