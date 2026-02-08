/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface OrchestratorStatus {
    running: boolean;
    pid?: number;
    started_at?: string;
    last_tick?: string;
    tick_interval_ms: number;
    policy_ids: string[];
    sessions_scanned: number;
    stalled_sessions: number;
    recoveries_attempted: number;
    recoveries_succeeded: number;
    last_action?: {
        timestamp: string;
        session_id: string;
        outcome: string;
        attempt: number;
    };
}
export declare function isOrchestratorRunning(): Promise<boolean>;
export declare function getOrchestratorStatus(): Promise<OrchestratorStatus>;
export declare function stopOrchestrator(): Promise<boolean>;
export declare function startOrchestrator(): Promise<boolean>;
