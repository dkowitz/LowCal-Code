/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type DecisionModeSource, type OrchestratorDecisionMode, type TeamPlannerSource } from "./policies/team-planner.js";
export interface OrchestratorStatus {
    running: boolean;
    pid?: number;
    started_at?: string;
    last_tick?: string;
    tick_interval_ms: number;
    policy_ids: string[];
    decision_mode: OrchestratorDecisionMode;
    decision_mode_source?: DecisionModeSource;
    sessions_scanned: number;
    stalled_sessions: number;
    recoveries_attempted: number;
    recoveries_succeeded: number;
    teams_scanned: number;
    teams_updated: number;
    team_messages_consumed: number;
    team_delegations_dispatched: number;
    team_delegations_completed: number;
    team_delegations_failed: number;
    team_agent_restart_attempts: number;
    team_agent_restart_successes: number;
    team_phase_transitions: number;
    last_action?: {
        timestamp: string;
        session_id: string;
        outcome: string;
        attempt: number;
    };
    last_team_action?: {
        timestamp: string;
        team_id: string;
        phase: string;
        outcome: string;
        consumed_messages: number;
    };
    planner_last_snapshot_at?: string;
    planner_last_plan_at?: string;
    planner_last_summary?: string;
    planner_last_confidence?: number;
    planner_last_fallback_reason?: string;
    planner_last_hint_teams?: number;
    planner_source?: TeamPlannerSource;
}
export declare function isOrchestratorRunning(): Promise<boolean>;
export declare function getOrchestratorStatus(): Promise<OrchestratorStatus>;
export declare function stopOrchestrator(): Promise<boolean>;
export declare function startOrchestrator(): Promise<boolean>;
