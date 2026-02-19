/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";
import { getSession } from "../sessions/session-store.js";
import { getTeamState, listTeamStates, upsertTeamState } from "../team/state-store.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
const teamManagementSchemaData = {
    name: ToolNames.TEAM_MANAGEMENT,
    description: "Operate orchestrator-managed teams: inspect team status, post/read shared channels, and delegate tasks to persistent team agent sessions.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: [
                    "list_teams",
                    "get_team_status",
                    "post_to_channel",
                    "read_channel",
                    "delegate_task",
                ],
            },
            team_id: {
                type: "string",
            },
            channel_name: {
                type: "string",
            },
            content: {
                type: "string",
            },
            thread_id: {
                type: "string",
            },
            after_turn: {
                type: "number",
            },
            limit: {
                type: "number",
            },
            agent_id: {
                type: "string",
            },
            task_description: {
                type: "string",
            },
            expected_output_format: {
                type: "string",
            },
            constraints: {
                type: "array",
                items: { type: "string" },
            },
        },
        required: ["action"],
        $schema: "http://json-schema.org/draft-07/schema#",
    },
};
const teamManagementDescription = `
Manage orchestrator-only team workflows.

Actions:
- list_teams: list known teams
- get_team_status: show one team state
- post_to_channel: append an orchestrator message to a team shared channel
- read_channel: read team shared channel messages
- delegate_task: enqueue a delegated prompt task to a bound agent session

This tool is restricted to sessions registered with mode="orchestrator".
`;
function asString(value, field) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`"${field}" is required and must be a non-empty string.`);
    }
    return value.trim();
}
function asOptionalString(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function asPositiveInt(value, fallback, max) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    const floored = Math.floor(value);
    if (floored <= 0) {
        return fallback;
    }
    return Math.min(floored, max);
}
function formatTeamOverview(team) {
    return `- ${team.team_id} (${team.status}) agents=${Object.keys(team.agents).length} channels=${Object.keys(team.channels).length}`;
}
function resolveChannelPath(baseDir, channelPath) {
    return path.isAbsolute(channelPath) ? channelPath : path.resolve(baseDir, channelPath);
}
function createInitialCoordinationState(nowIso) {
    return {
        phase: "planning",
        turn_number: 0,
        waiting_on_agent_ids: [],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {},
    };
}
async function readChannelMessages(channelPath) {
    try {
        const raw = await fs.readFile(channelPath, "utf-8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter((message) => message !== null);
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}
async function appendChannelMessage(channelPath, message) {
    await fs.mkdir(path.dirname(channelPath), { recursive: true });
    await fs.appendFile(channelPath, `${JSON.stringify(message)}\n`, "utf-8");
}
function parseTeamControlResult(value) {
    if (!value || typeof value !== "object") {
        return null;
    }
    const record = value;
    const accepted = record["accepted"];
    if (typeof accepted !== "boolean") {
        return null;
    }
    return {
        accepted,
        reason: typeof record["reason"] === "string" ? record["reason"] : undefined,
    };
}
async function callUnixSessionApi(socketPath, method, authToken, params) {
    return await new Promise((resolve) => {
        const request = {
            id: `team-management-${Date.now()}`,
            method,
            auth_token: authToken,
            params,
        };
        let resolved = false;
        let buffer = "";
        const socket = net.createConnection({ path: socketPath });
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                socket.destroy();
                resolve(null);
            }
        }, 1500);
        const finish = (value) => {
            if (resolved) {
                return;
            }
            resolved = true;
            clearTimeout(timeout);
            socket.destroy();
            resolve(value);
        };
        socket.on("connect", () => {
            socket.write(`${JSON.stringify(request)}\n`);
        });
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            const newlineIndex = buffer.indexOf("\n");
            if (newlineIndex < 0) {
                return;
            }
            const line = buffer.slice(0, newlineIndex).trim();
            if (!line) {
                finish(null);
                return;
            }
            try {
                finish(JSON.parse(line));
            }
            catch {
                finish(null);
            }
        });
        socket.on("error", () => finish(null));
        socket.on("end", () => finish(null));
        socket.on("close", () => finish(null));
    });
}
class TeamManagementInvocation extends BaseToolInvocation {
    config;
    constructor(params, config) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return `Team management: ${this.params.action}`;
    }
    async execute() {
        try {
            const output = await this.executeAction();
            return {
                llmContent: output,
                returnDisplay: output,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: `Error: ${errorMessage}`,
                error: {
                    message: errorMessage,
                    type: ToolErrorType.INVALID_TOOL_PARAMS,
                },
            };
        }
    }
    async requireOrchestratorSessionId() {
        const sessionId = this.config.getSessionId();
        const session = await getSession(sessionId);
        if (!session || session.mode !== "orchestrator") {
            throw new Error('team_management is restricted to orchestrator sessions (mode="orchestrator").');
        }
        return sessionId;
    }
    async loadTeam(teamIdRaw) {
        const teamId = asString(teamIdRaw, "team_id");
        const baseDir = this.config.getTargetDir();
        const team = await getTeamState(baseDir, teamId);
        if (!team) {
            throw new Error(`Team "${teamId}" not found.`);
        }
        return team;
    }
    async executeAction() {
        const baseDir = this.config.getTargetDir();
        await this.requireOrchestratorSessionId();
        switch (this.params.action) {
            case "list_teams": {
                const teams = await listTeamStates(baseDir, { limit: 200 });
                if (teams.length === 0) {
                    return "No teams found.";
                }
                return `Teams (${teams.length}):\n${teams.map(formatTeamOverview).join("\n")}`;
            }
            case "get_team_status": {
                const team = await this.loadTeam(this.params.team_id);
                return `\`\`\`json\n${JSON.stringify(team, null, 2)}\n\`\`\``;
            }
            case "post_to_channel": {
                const team = await this.loadTeam(this.params.team_id);
                const channelName = asString(this.params.channel_name, "channel_name");
                const content = asString(this.params.content, "content");
                const channel = team.channels[channelName];
                if (!channel) {
                    throw new Error(`Channel "${channelName}" is not registered for team "${team.team_id}".`);
                }
                const channelPath = resolveChannelPath(baseDir, channel.path);
                const existing = await readChannelMessages(channelPath);
                const nextTurn = Math.max(0, ...existing.map((msg) => msg.turn_number || 0)) + 1;
                const nowIso = new Date().toISOString();
                const message = {
                    channel: channelName,
                    from_agent: "orchestrator",
                    turn_number: nextTurn,
                    timestamp: nowIso,
                    message_type: "instruction",
                    content: { text: content },
                    metadata: {
                        thread_id: asOptionalString(this.params.thread_id),
                        team_id: team.team_id,
                    },
                };
                await appendChannelMessage(channelPath, message);
                await upsertTeamState(baseDir, team.team_id, (current, nowIsoInner) => {
                    if (!current)
                        return team;
                    const next = { ...current };
                    const existingChannel = next.channels[channelName];
                    if (existingChannel) {
                        next.channels = {
                            ...next.channels,
                            [channelName]: {
                                ...existingChannel,
                                message_count: existing.length + 1,
                                last_message_at: nowIsoInner,
                            },
                        };
                    }
                    return next;
                });
                return `Posted turn ${nextTurn} to ${channelName} for team "${team.team_id}".`;
            }
            case "read_channel": {
                const team = await this.loadTeam(this.params.team_id);
                const channelName = asString(this.params.channel_name, "channel_name");
                const channel = team.channels[channelName];
                if (!channel) {
                    throw new Error(`Channel "${channelName}" is not registered for team "${team.team_id}".`);
                }
                const channelPath = resolveChannelPath(baseDir, channel.path);
                const afterTurn = typeof this.params.after_turn === "number" && Number.isFinite(this.params.after_turn)
                    ? Math.max(0, Math.floor(this.params.after_turn))
                    : 0;
                const limit = asPositiveInt(this.params.limit, 20, 200);
                const messages = await readChannelMessages(channelPath);
                const selected = messages
                    .filter((msg) => msg.turn_number > afterTurn)
                    .slice(-limit);
                if (selected.length === 0) {
                    return `No channel messages found for ${channelName} after turn ${afterTurn}.`;
                }
                const body = selected
                    .map((msg) => `[turn ${msg.turn_number}] ${msg.from_agent} @ ${new Date(msg.timestamp).toLocaleString()}\n${msg.content.text}`)
                    .join("\n\n");
                return `Read ${selected.length} message(s) from ${channelName}:\n\n${body}`;
            }
            case "delegate_task": {
                const orchestratorSessionId = this.config.getSessionId();
                const team = await this.loadTeam(this.params.team_id);
                const agentId = asString(this.params.agent_id, "agent_id");
                const taskDescription = asString(this.params.task_description, "task_description");
                const expectedOutput = asOptionalString(this.params.expected_output_format);
                const constraints = Array.isArray(this.params.constraints)
                    ? this.params.constraints
                        .filter((entry) => typeof entry === "string")
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0)
                    : [];
                const agent = team.agents[agentId];
                if (!agent) {
                    throw new Error(`Agent "${agentId}" is not part of team "${team.team_id}".`);
                }
                if (!agent.session_id) {
                    throw new Error(`Agent "${agentId}" has no bound session_id. Use /team add-agent to bind a session.`);
                }
                const agentSession = await getSession(agent.session_id);
                if (!agentSession?.api || agentSession.api.transport !== "unix") {
                    throw new Error(`Agent session "${agent.session_id}" is unavailable for delegation.`);
                }
                const agentSpec = team.manifest.agents.find((entry) => entry.id === agentId);
                const delegatedPromptParts = [
                    `You are agent "${agentId}" with role "${agent.role}" in team "${team.team_id}".`,
                    `Subtask: ${taskDescription}`,
                ];
                if (expectedOutput) {
                    delegatedPromptParts.push(`Expected output format: ${expectedOutput}`);
                }
                if (constraints.length > 0) {
                    delegatedPromptParts.push(`Constraints:\n${constraints.map((item) => `- ${item}`).join("\n")}`);
                }
                delegatedPromptParts.push("When complete, provide your result and mention key artifacts or files produced.");
                const actionValue = delegatedPromptParts.join("\n\n");
                const taskId = `team-${team.team_id}-${agentId}-${Date.now()}`;
                const runtimeProfile = {
                    ...(agentSpec?.model ? { model: { name: agentSpec.model } } : {}),
                    run: { returnToSession: true },
                };
                const response = await callUnixSessionApi(agentSession.api.address, "session.enqueue_task", agentSession.api.auth_token, {
                    task_id: taskId,
                    action_type: "prompt",
                    action_value: actionValue,
                    description: `Delegated team task for ${team.team_id}/${agentId}`,
                    source_session_id: orchestratorSessionId,
                    return_to_session_id: orchestratorSessionId,
                    runtime_profile: runtimeProfile,
                });
                if (!response || response.ok !== true) {
                    throw new Error(`Failed to delegate to "${agentId}": ${response?.error ?? "agent API unavailable"}`);
                }
                const control = parseTeamControlResult(response.result);
                if (!control?.accepted) {
                    throw new Error(`Agent "${agentId}" rejected delegation: ${control?.reason ?? "rejected"}`);
                }
                await upsertTeamState(baseDir, team.team_id, (current, nowIso) => {
                    if (!current) {
                        return team;
                    }
                    const next = { ...current };
                    const coordination = next.coordination
                        ? { ...next.coordination, delegations: { ...next.coordination.delegations } }
                        : createInitialCoordinationState(nowIso);
                    const waitingOn = new Set(coordination.waiting_on_agent_ids);
                    waitingOn.add(agentId);
                    coordination.phase = "waiting";
                    coordination.turn_number += 1;
                    coordination.last_transition_at = nowIso;
                    coordination.last_updated_at = nowIso;
                    coordination.waiting_on_agent_ids = Array.from(waitingOn);
                    coordination.delegations[taskId] = {
                        task_id: taskId,
                        agent_id: agentId,
                        delegated_at: nowIso,
                        status: "running",
                        task_description: taskDescription,
                        expected_output_format: expectedOutput,
                    };
                    const currentAgent = next.agents[agentId];
                    if (currentAgent) {
                        next.agents = {
                            ...next.agents,
                            [agentId]: {
                                ...currentAgent,
                                status: "working",
                                last_turn_at: nowIso,
                            },
                        };
                    }
                    next.coordination = coordination;
                    return next;
                });
                return `Delegated task "${taskId}" to agent "${agentId}" (session ${agent.session_id}).`;
            }
            default:
                throw new Error(`Unsupported action: ${this.params.action}`);
        }
    }
}
export class TeamManagementTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.TEAM_MANAGEMENT;
    constructor(config) {
        super(TeamManagementTool.Name, "Team Management", teamManagementDescription, Kind.Other, teamManagementSchemaData.parametersJsonSchema, true, false);
        this.config = config;
    }
    createInvocation(params) {
        return new TeamManagementInvocation(params, this.config);
    }
}
//# sourceMappingURL=team-management.js.map