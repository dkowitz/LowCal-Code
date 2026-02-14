/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SessionCapabilities, SessionControlEndpoint, SessionMode, SessionStatus, SetSessionHealthInput, TaskRuntimeProfile } from "@qwen-code/qwen-code-core";
export declare const DEFAULT_SESSION_HEARTBEAT_MS: number;
export declare const DEFAULT_SESSION_TTL_MS: number;
export interface SessionControlHandlerResult {
    accepted: boolean;
    reason?: string;
}
export interface SessionEnqueueTaskPayload {
    task_id: string;
    action_type: "prompt" | "slash_command";
    action_value: string;
    description?: string;
    source_session_id?: string;
    return_to_session_id?: string;
    runtime_profile?: TaskRuntimeProfile;
}
export interface SessionControlHandlers {
    cancelTurn?: () => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    restartTurn?: () => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    pause?: () => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    resume?: () => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    setModel?: (model: string) => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    setApprovalMode?: (mode: string) => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    requestSelfRepair?: (payload?: Record<string, unknown>) => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
    enqueueTask?: (payload: SessionEnqueueTaskPayload) => Promise<boolean | SessionControlHandlerResult> | boolean | SessionControlHandlerResult;
}
export declare function setSessionControlHandlers(handlers: SessionControlHandlers): void;
export declare function startSessionRegistration(options: {
    id: string;
    mode: SessionMode;
    status?: SessionStatus;
    details?: Record<string, unknown>;
    capabilities?: SessionCapabilities;
    api?: SessionControlEndpoint;
    health?: SetSessionHealthInput;
    cwd?: string;
    pid?: number;
    heartbeatIntervalMs?: number;
}): Promise<void>;
export declare function stopSessionRegistration(): Promise<void>;
export declare function setSessionStatus(status: SessionStatus, details?: Record<string, unknown>): Promise<void>;
export declare function updateSessionDetails(details: Record<string, unknown>): Promise<void>;
export declare function setRegisteredSessionHealth(input: SetSessionHealthInput): Promise<void>;
export declare function clearRegisteredSessionHealth(): Promise<void>;
export declare function getRegisteredSessionId(): string | null;
