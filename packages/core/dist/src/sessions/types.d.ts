/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type SessionStatus = "idle" | "working";
export type SessionMode = "tui" | "headless" | "noninteractive" | "scheduler" | "orchestrator" | "team_agent";
export type SessionHealthState = "ok" | "degraded" | "stalled" | "loop_fault" | "error" | "recovering" | "offline";
export type SessionHealthReason = "heartbeat_stale" | "loop_detected" | "no_progress_timeout" | "repeated_tool_failure" | "scheduler_flap" | "unhandled_error" | "manual_pause" | "loop_remediation_attempt" | "error_remediation_attempt";
export interface SessionHealthSnapshot {
    state: SessionHealthState;
    reason?: SessionHealthReason;
    confidence: number;
    first_seen: string;
    last_seen: string;
    evidence?: Record<string, unknown>;
    remediation?: {
        stage: string;
        attempts: number;
        next_eligible_at?: string;
    };
}
export interface SessionControlEndpoint {
    transport: "unix" | "tcp";
    address: string;
    version: "v1";
    auth_token?: string;
}
export interface SessionCapabilities {
    observe: boolean;
    control: boolean;
    interact: boolean;
}
export interface SessionStatusView {
    id: string;
    mode: SessionMode;
    pid: number;
    cwd: string;
    status: SessionStatus;
    started_at: string;
    last_seen: string;
    uptime_ms: number;
    current_phase?: string;
}
export interface SessionContextSummary {
    model?: string;
    approval_mode?: string;
    token_budget?: Record<string, unknown>;
    active_tool_calls?: number;
    turn_age_ms?: number;
    metadata?: Record<string, unknown>;
}
export interface SessionHistoryEntry {
    timestamp?: string;
    role: "system" | "user" | "assistant" | "tool" | "unknown";
    content: string;
}
export interface SessionRecentHistory {
    source: "details" | "log" | "none";
    items: SessionHistoryEntry[];
    truncated: boolean;
    total_items: number;
    total_chars: number;
}
export interface SessionRecord {
    id: string;
    pid: number;
    mode: SessionMode;
    cwd: string;
    started_at: string;
    last_seen: string;
    status: SessionStatus;
    details?: Record<string, unknown>;
    health?: SessionHealthSnapshot;
    api?: SessionControlEndpoint;
    capabilities?: SessionCapabilities;
}
export interface SessionStore {
    version: string;
    sessions: SessionRecord[];
    last_modified: string;
}
