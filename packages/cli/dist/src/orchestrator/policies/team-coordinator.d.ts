/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type TeamCoordinationState } from "@qwen-code/qwen-code-core";
import type { TeamPlannerHints } from "./team-planner.js";
export interface TeamCoordinatorMetrics {
    teams_scanned: number;
    teams_updated: number;
    messages_consumed: number;
    delegations_dispatched: number;
    delegations_completed: number;
    delegations_failed: number;
    agent_restart_attempts: number;
    agent_restart_successes: number;
    phase_transitions: number;
}
export interface TeamCoordinatorActionRecord {
    timestamp: string;
    policy_id: "coordinate_team";
    team_id: string;
    phase: TeamCoordinationState["phase"];
    outcome: string;
    consumed_messages: number;
}
export interface RunTeamCoordinatorPolicyParams {
    baseDir: string;
    orchestratorSessionId: string;
    plannerHints?: TeamPlannerHints;
}
export interface TeamCoordinatorResult {
    metrics: TeamCoordinatorMetrics;
    last_action?: TeamCoordinatorActionRecord;
}
export declare function runTeamCoordinatorPolicy(params: RunTeamCoordinatorPolicyParams): Promise<TeamCoordinatorResult>;
