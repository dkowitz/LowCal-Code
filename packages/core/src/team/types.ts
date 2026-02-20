/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TeamManifest {
  version: string;
  id: string;
  name: string;
  description?: string;
  orchestrator?: TeamOrchestratorSpec;
  agents: AgentSpec[];
  channels: ChannelSpec[];
  shared_context?: SharedContextEntry[];
  execution?: TeamExecutionSpec;
}

export interface TeamOrchestratorSpec {
  prompt?: string;
}

export interface AgentSpec {
  id: string;
  role: string;
  startup?: "immediate" | "idle";
  model?: string;
  instructions?: string;
  tools?: string[];
}

export interface ChannelSpec {
  name: string;
  history: "shared";
  visibility?: "all" | "restricted";
  members?: string[];
}

export interface TeamExecutionSpec {
  mode?: "headless" | "interactive";
  timeout_minutes?: number;
}

export type SharedContextEntry =
  | { type: "file"; path: string; read_only: boolean }
  | { type: "variable"; name: string; value: string };

export type TeamStatus =
  | "creating"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "dissolved";

export type TeamAgentStatus =
  | "pending"
  | "idle"
  | "working"
  | "waiting"
  | "completed"
  | "failed";

export type TeamCoordinationPhase =
  | "idle"
  | "planning"
  | "delegating"
  | "waiting"
  | "synthesizing"
  | "done";

export type TeamDelegationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface TeamDelegationState {
  task_id: string;
  agent_id: string;
  delegated_at: string;
  completed_at?: string;
  status: TeamDelegationStatus;
  task_description: string;
  expected_output_format?: string;
  result_summary?: string;
  output_path?: string;
  last_error?: string;
}

export interface TeamCoordinationState {
  phase: TeamCoordinationPhase;
  turn_number: number;
  waiting_on_agent_ids: string[];
  last_transition_at: string;
  last_updated_at: string;
  delegations: Record<string, TeamDelegationState>;
}

export interface TeamAgentState {
  agent_id: string;
  session_id?: string;
  role: string;
  status: TeamAgentStatus;
  last_turn_at?: string;
  result_summary?: string;
  last_error?: string;
}

export interface TeamChannelState {
  channel_name: string;
  message_count: number;
  last_message_at?: string;
  path: string;
}

export interface TeamState {
  team_id: string;
  name: string;
  status: TeamStatus;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  manifest: TeamManifest;
  orchestrator_session_id: string;
  agents: Record<string, TeamAgentState>;
  channels: Record<string, TeamChannelState>;
  coordination?: TeamCoordinationState;
  last_error?: string;
}

export interface TeamStateStore {
  version: "1.0";
  updated_at: string;
  teams: Record<string, TeamState>;
}
