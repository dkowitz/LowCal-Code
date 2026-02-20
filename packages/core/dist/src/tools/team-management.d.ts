/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import { BaseDeclarativeTool, BaseToolInvocation } from "./tools.js";
import type { ToolResult } from "./tools.js";
type TeamManagementAction = "list_teams" | "get_team_status" | "post_to_channel" | "post_message" | "read_channel" | "read_messages" | "delegate_task";
export interface TeamManagementParams {
    action: TeamManagementAction;
    team_id?: string;
    channel_name?: string;
    content?: string;
    from_agent?: string;
    to_agent?: string;
    participant?: string;
    thread_id?: string;
    after_turn?: number;
    limit?: number;
    agent_id?: string;
    task_description?: string;
    expected_output_format?: string;
    constraints?: string[];
}
declare class TeamManagementInvocation extends BaseToolInvocation<TeamManagementParams, ToolResult> {
    private readonly config;
    constructor(params: TeamManagementParams, config: Config);
    getDescription(): string;
    execute(): Promise<ToolResult>;
    private requireOrchestratorSessionId;
    private loadTeam;
    private executeAction;
}
export declare class TeamManagementTool extends BaseDeclarativeTool<TeamManagementParams, ToolResult> {
    private readonly config;
    static readonly Name: "team_management";
    constructor(config: Config);
    protected createInvocation(params: TeamManagementParams): TeamManagementInvocation;
}
export {};
