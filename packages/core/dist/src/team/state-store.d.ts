/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { TeamState, TeamStatus } from "./types.js";
export interface ListTeamStatesOptions {
    statuses?: TeamStatus[];
    limit?: number;
}
export declare function getTeamState(baseDir: string, teamId: string): Promise<TeamState | undefined>;
export declare function listTeamStates(baseDir: string, options?: ListTeamStatesOptions): Promise<TeamState[]>;
export declare function upsertTeamState(baseDir: string, teamId: string, updater: (current: TeamState | undefined, nowIso: string) => TeamState): Promise<TeamState>;
export declare function removeTeamState(baseDir: string, teamId: string): Promise<boolean>;
