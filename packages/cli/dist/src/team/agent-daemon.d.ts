/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
interface StartTeamAgentDaemonOptions {
    baseDir: string;
    sessionId: string;
    teamId: string;
    agentId: string;
    role: string;
    model?: string;
    instructions?: string;
}
export declare function startTeamAgentDaemon(options: StartTeamAgentDaemonOptions): Promise<boolean>;
export declare function stopTeamAgentDaemon(baseDir: string, sessionId: string): Promise<boolean>;
export declare function getDefaultTeamAgentSessionId(teamId: string, agentId: string): string;
export {};
