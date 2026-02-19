/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type TeamCoordinationState } from "@qwen-code/qwen-code-core";
export type OrchestratorDecisionMode = "deterministic" | "assisted";
export type DecisionModeSource = "env" | "config" | "default";
export type TeamPlannerSource = "disabled" | "heuristic" | "file" | "model" | "model_cache";
export interface OrchestratorPlannerConfig {
    decision_mode?: OrchestratorDecisionMode;
    assisted_plan_file?: string;
}
export interface ResolvedPlannerSettings {
    decisionMode: OrchestratorDecisionMode;
    decisionModeSource: DecisionModeSource;
    assistedPlanFile?: string;
}
export interface TeamPlannerSnapshotAgent {
    agent_id: string;
    role: string;
    startup: "immediate" | "idle";
    status: string;
    has_session: boolean;
    last_error?: string;
}
export interface TeamPlannerSnapshotTeam {
    team_id: string;
    name: string;
    status: string;
    phase: TeamCoordinationState["phase"];
    objective: string;
    waiting_on_agent_ids: string[];
    active_delegations: number;
    completed_delegations: number;
    failed_delegations: number;
    agents: TeamPlannerSnapshotAgent[];
    updated_at: string;
}
export interface TeamPlannerSnapshot {
    schema_version: "1.0";
    generated_at: string;
    teams: TeamPlannerSnapshotTeam[];
}
export interface AssistedTeamPlanDecision {
    team_id: string;
    strategy: "hold" | "delegate_all" | "delegate_subset";
    rationale: string;
    target_agent_ids?: string[];
    preferred_agent_order?: string[];
    max_delegations?: number;
}
export interface AssistedTeamPlan {
    schema_version: "1.0";
    summary: string;
    confidence: number;
    decisions: AssistedTeamPlanDecision[];
}
export interface TeamPlannerDecisionHint {
    strategy: AssistedTeamPlanDecision["strategy"];
    rationale: string;
    target_agent_ids: string[];
    preferred_agent_order: string[];
    max_delegations?: number;
}
export interface TeamPlannerHints {
    by_team_id: Record<string, TeamPlannerDecisionHint>;
}
export interface TeamPlannerRunResult {
    mode: OrchestratorDecisionMode;
    snapshot: TeamPlannerSnapshot;
    hints: TeamPlannerHints;
    summary?: string;
    confidence?: number;
    fallback_reason?: string;
    source: TeamPlannerSource;
}
export declare const ASSISTED_TEAM_PLAN_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["schema_version", "summary", "confidence", "decisions"];
    readonly properties: {
        readonly schema_version: {
            readonly type: "string";
            readonly const: "1.0";
        };
        readonly summary: {
            readonly type: "string";
            readonly minLength: 1;
        };
        readonly confidence: {
            readonly type: "number";
            readonly minimum: 0;
            readonly maximum: 1;
        };
        readonly decisions: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly required: readonly ["team_id", "strategy", "rationale"];
                readonly properties: {
                    readonly team_id: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly strategy: {
                        readonly type: "string";
                        readonly enum: readonly ["hold", "delegate_all", "delegate_subset"];
                    };
                    readonly rationale: {
                        readonly type: "string";
                        readonly minLength: 1;
                    };
                    readonly target_agent_ids: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly preferred_agent_order: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                    };
                    readonly max_delegations: {
                        readonly type: "number";
                        readonly minimum: 1;
                    };
                };
            };
        };
    };
};
export declare function getOrchestratorPlannerConfigPath(baseDir: string): string;
export declare function loadOrchestratorPlannerConfig(baseDir: string): Promise<OrchestratorPlannerConfig>;
export declare function saveOrchestratorPlannerConfig(baseDir: string, config: OrchestratorPlannerConfig): Promise<void>;
export declare function setOrchestratorDecisionModeConfig(baseDir: string, mode: OrchestratorDecisionMode): Promise<OrchestratorPlannerConfig>;
export declare function resolveDecisionModeFromEnv(): OrchestratorDecisionMode;
export declare function resolvePlannerSettings(baseDir: string): Promise<ResolvedPlannerSettings>;
export declare function buildTeamPlannerSnapshot(baseDir: string): Promise<TeamPlannerSnapshot>;
export declare function runTeamPlanner(options: {
    baseDir: string;
    decisionMode: OrchestratorDecisionMode;
    assistedPlanFile?: string;
}): Promise<TeamPlannerRunResult>;
