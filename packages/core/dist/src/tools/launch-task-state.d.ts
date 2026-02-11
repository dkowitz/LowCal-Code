/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { JobExecutionMode } from "../scheduler/types.js";
export type LaunchTaskLifecycleStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export interface LaunchTaskResultRef {
    mailbox_path?: string;
    output_path?: string;
    child_session_id?: string;
    message_timestamp?: string;
}
export interface LaunchTaskStateRecord {
    task_id: string;
    status: LaunchTaskLifecycleStatus;
    created_at: string;
    started_at?: string;
    last_heartbeat?: string;
    finished_at?: string;
    prompt_preview?: string;
    parent_session_id?: string;
    source_session_id?: string;
    dedupe_key?: string;
    execution_mode_requested?: JobExecutionMode;
    execution_mode_actual?: JobExecutionMode;
    pid?: number;
    tab_name?: string;
    result_ref?: LaunchTaskResultRef;
    last_error?: string;
}
interface ListLaunchTaskStatesOptions {
    parentSessionId?: string;
    statuses?: LaunchTaskLifecycleStatus[];
    limit?: number;
}
export interface LaunchTaskMaintenanceOptions {
    staleAfterMs?: number;
    terminalRetentionMs?: number;
}
export interface LaunchTaskMaintenanceResult {
    staleMarked: number;
    staleTaskIds: string[];
    pruned: number;
    prunedTaskIds: string[];
}
export declare function isLaunchTaskTerminal(status: LaunchTaskLifecycleStatus): boolean;
export declare function getLaunchTaskState(baseDir: string, taskId: string): Promise<LaunchTaskStateRecord | undefined>;
export declare function listLaunchTaskStates(baseDir: string, options?: ListLaunchTaskStatesOptions): Promise<LaunchTaskStateRecord[]>;
export declare function findActiveLaunchTaskByDedupeKey(baseDir: string, dedupeKey: string, parentSessionId?: string): Promise<LaunchTaskStateRecord | undefined>;
export declare function upsertLaunchTaskState(baseDir: string, taskId: string, updater: (current: LaunchTaskStateRecord | undefined, nowIso: string) => LaunchTaskStateRecord): Promise<LaunchTaskStateRecord>;
export declare function reconcileLaunchTaskState(baseDir: string, options?: LaunchTaskMaintenanceOptions): Promise<LaunchTaskMaintenanceResult>;
export {};
