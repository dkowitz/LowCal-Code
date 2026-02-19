/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { LaunchTaskTool, getSession, getTeamState, listSessions, listTeamStates, removeTeamState, upsertTeamState, } from "@qwen-code/qwen-code-core";
import { CommandKind, } from "./types.js";
import { TeamManifestError, loadTeamManifestFromFile, } from "../../team/manifest-loader.js";
import { getDefaultTeamAgentSessionId, startTeamAgentDaemon, stopTeamAgentDaemon, } from "../../team/agent-daemon.js";
import { isOrchestratorRunning, startOrchestrator, } from "../../orchestrator/daemon.js";
function usageError(content) {
    return {
        type: "message",
        messageType: "error",
        content,
    };
}
function info(content) {
    return {
        type: "message",
        messageType: "info",
        content,
    };
}
function tokenizeArgs(input) {
    const tokens = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;
    while ((match = regex.exec(input)) !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
    }
    return tokens;
}
function parseOption(tokens, key) {
    const index = tokens.findIndex((value) => value === key);
    if (index < 0) {
        return undefined;
    }
    const value = tokens[index + 1];
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function splitCsvOrLines(value) {
    return value
        .split(/[\n,]+/g)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
function parseAgentStartupMode(value, context) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "immediate") {
        return "immediate";
    }
    if (normalized === "idle") {
        return "idle";
    }
    throw new TeamManifestError(`${context} must be "immediate" or "idle" (received "${value}").`);
}
function parseInlineAgentTaskModes(value) {
    const entries = splitCsvOrLines(value);
    const modes = new Map();
    for (const [index, entry] of entries.entries()) {
        const separatorIndex = entry.indexOf(":");
        if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
            throw new TeamManifestError(`Invalid agent-task mode entry "${entry}" at position ${index + 1}. Use task_id:immediate|idle.`);
        }
        const taskId = entry.slice(0, separatorIndex).trim();
        const modeRaw = entry.slice(separatorIndex + 1).trim();
        if (!taskId) {
            throw new TeamManifestError(`Invalid agent-task mode entry "${entry}" at position ${index + 1}. Missing task id.`);
        }
        if (modes.has(taskId)) {
            throw new TeamManifestError(`Duplicate task id "${taskId}" in --agent-task-modes.`);
        }
        modes.set(taskId, parseAgentStartupMode(modeRaw, `--agent-task-modes entry "${entry}"`));
    }
    return modes;
}
function parseInlineAgents(value) {
    const entries = splitCsvOrLines(value);
    if (entries.length === 0) {
        throw new TeamManifestError("Inline create requires at least one agent via --agents (format: id:role,id2:role2).");
    }
    const seen = new Set();
    return entries.map((entry, index) => {
        const separatorIndex = entry.indexOf(":");
        if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
            throw new TeamManifestError(`Invalid agent entry "${entry}" at position ${index + 1}. Use id:role.`);
        }
        const id = entry.slice(0, separatorIndex).trim();
        const role = entry.slice(separatorIndex + 1).trim();
        if (!id || !role) {
            throw new TeamManifestError(`Invalid agent entry "${entry}" at position ${index + 1}. Use id:role.`);
        }
        if (role === "orchestrator") {
            throw new TeamManifestError(`Invalid agent entry "${entry}" at position ${index + 1}: role cannot be "orchestrator".`);
        }
        if (seen.has(id)) {
            throw new TeamManifestError(`Duplicate agent id "${id}" in --agents.`);
        }
        seen.add(id);
        return { id, role, startup: "immediate" };
    });
}
function parseInlineAgentTasks(value, startupModes) {
    const entries = splitCsvOrLines(value);
    if (entries.length === 0) {
        throw new TeamManifestError("Inline create requires at least one task id via --agent-tasks.");
    }
    const seen = new Set();
    const tasks = entries.map((entry, index) => {
        const taskId = entry.trim();
        if (!taskId) {
            throw new TeamManifestError(`Invalid task id entry at position ${index + 1} in --agent-tasks.`);
        }
        if (seen.has(taskId)) {
            throw new TeamManifestError(`Duplicate task id "${taskId}" in --agent-tasks.`);
        }
        seen.add(taskId);
        return {
            id: taskId,
            role: taskId,
            startup: startupModes?.get(taskId) ?? "immediate",
        };
    });
    if (startupModes && startupModes.size > 0) {
        const taskIds = new Set(tasks.map((task) => task.id));
        const unknown = Array.from(startupModes.keys()).filter((id) => !taskIds.has(id));
        if (unknown.length > 0) {
            throw new TeamManifestError(`--agent-task-modes references task ids not present in --agent-tasks: ${unknown.join(", ")}`);
        }
    }
    return tasks;
}
function normalizeChannelName(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return "";
    }
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
function parseInlineChannels(value) {
    const entries = splitCsvOrLines(value)
        .map(normalizeChannelName)
        .filter((entry) => entry.length > 0);
    if (entries.length === 0) {
        throw new TeamManifestError("Inline create requires at least one channel via --channels.");
    }
    const seen = new Set();
    return entries.map((name) => {
        if (seen.has(name)) {
            throw new TeamManifestError(`Duplicate channel name "${name}" in --channels.`);
        }
        seen.add(name);
        return {
            name,
            history: "shared",
        };
    });
}
function buildInlineManifest(tokens) {
    const id = parseOption(tokens, "--id");
    const name = parseOption(tokens, "--name");
    const description = parseOption(tokens, "--description");
    const agentsValue = parseOption(tokens, "--agents");
    const agentTasksValue = parseOption(tokens, "--agent-tasks");
    const agentTaskModesValue = parseOption(tokens, "--agent-task-modes");
    const channelsValue = parseOption(tokens, "--channels");
    if (!id || !name || (!agentsValue && !agentTasksValue) || !channelsValue) {
        throw new TeamManifestError("Usage: /team create --id <team_id> --name <team_name> (--agents <id:role,...> | --agent-tasks <task_id,...>) --channels <#name,...> [--description <text>] [--agent-task-modes <task_id:immediate|idle,...>]");
    }
    if (agentTaskModesValue && !agentTasksValue) {
        throw new TeamManifestError("--agent-task-modes can only be used with --agent-tasks.");
    }
    const agentTaskModes = agentTaskModesValue
        ? parseInlineAgentTaskModes(agentTaskModesValue)
        : undefined;
    return {
        version: "1.0",
        id,
        name,
        description,
        agents: agentsValue
            ? parseInlineAgents(agentsValue)
            : parseInlineAgentTasks(agentTasksValue, agentTaskModes),
        channels: parseInlineChannels(channelsValue),
    };
}
function channelFilePath(teamId, channelName) {
    const safe = channelName.replace(/^#/, "").replace(/[^a-zA-Z0-9._-]/g, "-");
    return path.join(".lowcal", "team-channels", `${teamId}-${safe}.jsonl`);
}
function buildTeamState(manifest, nowIso) {
    const agents = Object.fromEntries(manifest.agents.map((agent) => [
        agent.id,
        {
            agent_id: agent.id,
            role: agent.role,
            status: "pending",
        },
    ]));
    const channels = Object.fromEntries(manifest.channels.map((channel) => [
        channel.name,
        {
            channel_name: channel.name,
            message_count: 0,
            path: channelFilePath(manifest.id, channel.name),
        },
    ]));
    return {
        team_id: manifest.id,
        name: manifest.name,
        status: "active",
        created_at: nowIso,
        started_at: nowIso,
        manifest,
        orchestrator_session_id: "orchestrator-pending",
        agents,
        channels,
        coordination: {
            phase: "planning",
            turn_number: 0,
            waiting_on_agent_ids: [],
            last_transition_at: nowIso,
            last_updated_at: nowIso,
            delegations: {},
        },
    };
}
async function provisionTeamAgents(baseDir, manifest) {
    const provisioned = await Promise.all(manifest.agents.map(async (agent) => {
        const sessionId = getDefaultTeamAgentSessionId(manifest.id, agent.id);
        const started = await startTeamAgentDaemon({
            baseDir,
            sessionId,
            teamId: manifest.id,
            agentId: agent.id,
            role: agent.role,
            model: agent.model,
            instructions: agent.instructions,
        });
        return {
            agent_id: agent.id,
            session_id: sessionId,
            started,
        };
    }));
    return provisioned;
}
function formatTeamStatus(state) {
    const agentRows = Object.values(state.agents)
        .map((agent) => {
        const sessionInfo = agent.session_id ? ` session=${agent.session_id}` : "";
        return `- ${agent.agent_id} (${agent.role}) status=${agent.status}${sessionInfo}`;
    })
        .join("\n");
    const channelRows = Object.values(state.channels)
        .map((channel) => `- ${channel.channel_name} messages=${channel.message_count} path=${channel.path}`)
        .join("\n");
    const lines = [
        `Team: ${state.team_id}`,
        `Name: ${state.name}`,
        `Status: ${state.status}`,
        `Phase: ${state.coordination?.phase ?? "planning"}`,
        `Created: ${new Date(state.created_at).toLocaleString()}`,
        `Orchestrator Session: ${state.orchestrator_session_id}`,
        "",
        `Agents (${Object.keys(state.agents).length}):`,
        agentRows || "- none",
        "",
        `Channels (${Object.keys(state.channels).length}):`,
        channelRows || "- none",
    ];
    return lines.join("\n");
}
function createRunCoordinationState(nowIso) {
    return {
        phase: "planning",
        turn_number: 0,
        waiting_on_agent_ids: [],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {},
    };
}
function sanitizeId(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
async function resolveOrchestratorSessionId(fallback) {
    const sessions = await listSessions();
    const active = sessions
        .filter((session) => session.mode === "orchestrator")
        .filter((session) => Number.isFinite(session.pid) && isProcessAlive(session.pid))
        .sort((a, b) => {
        const tsA = Date.parse(a.last_seen ?? a.started_at ?? "");
        const tsB = Date.parse(b.last_seen ?? b.started_at ?? "");
        const safeA = Number.isFinite(tsA) ? tsA : 0;
        const safeB = Number.isFinite(tsB) ? tsB : 0;
        return safeB - safeA;
    })[0];
    if (active?.id) {
        return active.id;
    }
    if (typeof fallback === "string" &&
        fallback.trim().length > 0 &&
        fallback !== "orchestrator-pending") {
        return fallback;
    }
    return undefined;
}
async function launchTeamAgentTasks(team) {
    const launchTool = new LaunchTaskTool();
    const orchestratorSessionId = await resolveOrchestratorSessionId(team.orchestrator_session_id);
    const baseTs = Date.now();
    const launched = [];
    const failed = [];
    const immediateAgents = team.manifest.agents.filter((agent) => agent.startup !== "idle");
    await Promise.all(immediateAgents.map(async (agent, index) => {
        const taskId = `team-${sanitizeId(team.team_id)}-${sanitizeId(agent.id)}-${baseTs + index}`;
        const result = await launchTool.validateBuildAndExecute({
            action: "create",
            id: taskId,
            template_id: agent.id,
            template_level: "auto",
            description: `Team kickoff task for ${team.team_id}/${agent.id}`,
            ...(orchestratorSessionId
                ? { return_to_session_id: orchestratorSessionId }
                : {}),
        }, new AbortController().signal);
        if (result.error) {
            failed.push({
                agent_id: agent.id,
                error: result.error.message,
            });
            return;
        }
        launched.push({
            agent_id: agent.id,
            task_id: taskId,
        });
    }));
    return {
        launched,
        failed,
        orchestratorSessionId,
    };
}
function buildTeamChannelsState(teamId, channels, existing) {
    const next = {};
    for (const channel of channels) {
        const current = existing?.[channel.name];
        next[channel.name] = {
            channel_name: channel.name,
            message_count: current?.message_count ?? 0,
            last_message_at: current?.last_message_at,
            path: current?.path ?? channelFilePath(teamId, channel.name),
        };
    }
    return next;
}
function buildTeamAgentsState(teamId, agents, existing) {
    const next = {};
    for (const agent of agents) {
        const current = existing?.[agent.id];
        next[agent.id] = {
            agent_id: agent.id,
            role: agent.role,
            session_id: current?.session_id ?? getDefaultTeamAgentSessionId(teamId, agent.id),
            status: current?.status ?? "pending",
            last_turn_at: current?.last_turn_at,
            result_summary: current?.result_summary,
            last_error: current?.last_error,
        };
    }
    return next;
}
async function ensureTeamChannelFiles(baseDir, channels) {
    await Promise.all(Object.values(channels).map(async (channel) => {
        const resolved = path.resolve(baseDir, channel.path);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        try {
            await fs.access(resolved);
        }
        catch {
            await fs.writeFile(resolved, "", "utf-8");
        }
    }));
}
function resolveTeamPromptChannel(state) {
    if (state.channels["#general"]) {
        return state.channels["#general"];
    }
    const first = Object.values(state.channels)[0];
    return first;
}
async function appendPromptToTeamChannel(baseDir, state, prompt) {
    const channel = resolveTeamPromptChannel(state);
    if (!channel) {
        return;
    }
    const resolvedPath = path.resolve(baseDir, channel.path);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    const timestamp = new Date().toISOString();
    const turnNumber = Math.max(0, channel.message_count) + 1;
    const message = {
        channel: channel.channel_name,
        from_agent: "user",
        turn_number: turnNumber,
        timestamp,
        message_type: "instruction",
        content: {
            text: prompt,
        },
        metadata: {
            team_id: state.team_id,
            source: "team_prompt",
        },
    };
    await fs.appendFile(resolvedPath, `${JSON.stringify(message)}\n`, "utf-8");
}
async function createTeamFromManifest(baseDir, manifest, sourceDescription) {
    const normalizedManifest = {
        ...manifest,
        agents: manifest.agents.map((agent) => ({
            ...agent,
            startup: agent.startup ?? "immediate",
        })),
    };
    const existing = await getTeamState(baseDir, normalizedManifest.id);
    if (existing && existing.status !== "dissolved") {
        return usageError(`Team "${normalizedManifest.id}" already exists with status "${existing.status}".`);
    }
    const created = await upsertTeamState(baseDir, normalizedManifest.id, (_current, nowIso) => buildTeamState(normalizedManifest, nowIso));
    await ensureTeamChannelFiles(baseDir, created.channels);
    const provisionedAgents = await provisionTeamAgents(baseDir, normalizedManifest);
    const provisionedByAgentId = new Map(provisionedAgents.map((entry) => [entry.agent_id, entry]));
    const updated = await upsertTeamState(baseDir, normalizedManifest.id, (current) => {
        const existingState = current ?? created;
        const nextAgents = { ...existingState.agents };
        for (const agent of manifest.agents) {
            const provisioned = provisionedByAgentId.get(agent.id);
            if (!provisioned) {
                continue;
            }
            const currentState = nextAgents[agent.id] ?? {
                agent_id: agent.id,
                role: agent.role,
                status: "pending",
            };
            nextAgents[agent.id] = {
                ...currentState,
                session_id: provisioned.session_id,
                status: provisioned.started ? "idle" : "failed",
                last_error: provisioned.started
                    ? undefined
                    : `failed to start team agent daemon for session "${provisioned.session_id}"`,
            };
        }
        return {
            ...existingState,
            agents: nextAgents,
        };
    });
    const readyCount = provisionedAgents.filter((entry) => entry.started).length;
    const failed = provisionedAgents.filter((entry) => !entry.started);
    const provisioningSummary = failed.length === 0
        ? `Provisioned team_agent sessions: ${readyCount}/${provisionedAgents.length}.`
        : `Provisioned team_agent sessions: ${readyCount}/${provisionedAgents.length}. Failed: ${failed.map((entry) => entry.agent_id).join(", ")}`;
    return info([
        `Team "${updated.team_id}" created from ${sourceDescription}.`,
        `Agents: ${Object.keys(updated.agents).length}`,
        `Channels: ${Object.keys(updated.channels).length}`,
        provisioningSummary,
        "Agents are persistent `team_agent` sessions and are orchestrator-mediated in v1.",
    ].join("\n"));
}
async function updateTeamFromInlineOptions(baseDir, state, tokens) {
    const name = parseOption(tokens, "--name");
    const description = parseOption(tokens, "--description");
    const channelsValue = parseOption(tokens, "--channels");
    const agentTasksValue = parseOption(tokens, "--agent-tasks");
    const agentTaskModesValue = parseOption(tokens, "--agent-task-modes");
    if (!name &&
        !description &&
        !channelsValue &&
        !agentTasksValue &&
        !agentTaskModesValue) {
        return usageError("Usage: /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>]");
    }
    if (agentTaskModesValue && !agentTasksValue) {
        const startupModes = parseInlineAgentTaskModes(agentTaskModesValue);
        const knownAgentIds = new Set(state.manifest.agents.map((agent) => agent.id));
        const unknown = Array.from(startupModes.keys()).filter((id) => !knownAgentIds.has(id));
        if (unknown.length > 0) {
            return usageError(`--agent-task-modes references agents not present in the team: ${unknown.join(", ")}`);
        }
    }
    const startupModes = agentTaskModesValue
        ? parseInlineAgentTaskModes(agentTaskModesValue)
        : undefined;
    const nextAgents = agentTasksValue
        ? parseInlineAgentTasks(agentTasksValue, startupModes)
        : state.manifest.agents.map((agent) => ({
            ...agent,
            startup: startupModes?.get(agent.id) ?? agent.startup ?? "immediate",
        }));
    const nextChannels = channelsValue
        ? parseInlineChannels(channelsValue)
        : state.manifest.channels;
    const nextManifest = {
        ...state.manifest,
        ...(name ? { name } : {}),
        ...(description ? { description } : {}),
        agents: nextAgents.map((agent) => ({
            ...agent,
            startup: agent.startup ?? "immediate",
        })),
        channels: nextChannels,
    };
    const nextAgentIds = new Set(nextManifest.agents.map((agent) => agent.id));
    const removedAgentSessionIds = Object.values(state.agents)
        .filter((agent) => !nextAgentIds.has(agent.agent_id))
        .map((agent) => agent.session_id)
        .filter((sessionId) => Boolean(sessionId));
    const nextChannelNames = new Set(nextManifest.channels.map((channel) => channel.name));
    const removedChannelPaths = Object.values(state.channels)
        .filter((channel) => !nextChannelNames.has(channel.channel_name))
        .map((channel) => channel.path);
    const updated = await upsertTeamState(baseDir, state.team_id, (current) => {
        const existing = current ?? state;
        return {
            ...existing,
            name: nextManifest.name,
            manifest: nextManifest,
            agents: buildTeamAgentsState(existing.team_id, nextManifest.agents, existing.agents),
            channels: buildTeamChannelsState(existing.team_id, nextManifest.channels, existing.channels),
            last_error: undefined,
        };
    });
    await ensureTeamChannelFiles(baseDir, updated.channels);
    await Promise.all(removedChannelPaths.map(async (relativePath) => {
        const resolved = path.resolve(baseDir, relativePath);
        await fs.unlink(resolved).catch((error) => {
            const nodeError = error;
            if (nodeError?.code !== "ENOENT") {
                throw error;
            }
        });
    }));
    await Promise.all(removedAgentSessionIds.map(async (sessionId) => {
        await stopTeamAgentDaemon(baseDir, sessionId).catch(() => { });
    }));
    const provisionedAgents = await provisionTeamAgents(baseDir, nextManifest);
    const provisionedByAgentId = new Map(provisionedAgents.map((entry) => [entry.agent_id, entry]));
    const refreshed = await upsertTeamState(baseDir, state.team_id, (current) => {
        const existing = current ?? updated;
        const nextStateAgents = { ...existing.agents };
        for (const manifestAgent of nextManifest.agents) {
            const provisioned = provisionedByAgentId.get(manifestAgent.id);
            if (!provisioned) {
                continue;
            }
            const currentAgent = nextStateAgents[manifestAgent.id] ?? {
                agent_id: manifestAgent.id,
                role: manifestAgent.role,
                status: "pending",
            };
            const nextStatus = provisioned.started
                ? currentAgent.status === "working"
                    ? "working"
                    : "idle"
                : "failed";
            nextStateAgents[manifestAgent.id] = {
                ...currentAgent,
                role: manifestAgent.role,
                session_id: provisioned.session_id,
                status: nextStatus,
                last_error: provisioned.started
                    ? undefined
                    : `failed to start team agent daemon for session "${provisioned.session_id}"`,
            };
        }
        return {
            ...existing,
            name: nextManifest.name,
            manifest: nextManifest,
            agents: nextStateAgents,
            channels: buildTeamChannelsState(existing.team_id, nextManifest.channels, existing.channels),
            last_error: undefined,
        };
    });
    const immediateCount = nextManifest.agents.filter((agent) => agent.startup !== "idle").length;
    const idleCount = nextManifest.agents.length - immediateCount;
    return info([
        `Team "${refreshed.team_id}" updated.`,
        `Name: ${refreshed.name}`,
        `Agents: ${nextManifest.agents.length} (immediate=${immediateCount}, idle=${idleCount})`,
        `Channels: ${nextManifest.channels.length}`,
    ].join("\n"));
}
export const teamCommand = {
    name: "team",
    description: "create and inspect orchestrator-managed agent teams",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const config = context.services.config;
        if (!config) {
            return usageError("Team commands are unavailable: missing active configuration.");
        }
        const baseDir = config.getTargetDir();
        const tokens = tokenizeArgs(args.trim());
        if (tokens.length === 0) {
            return {
                type: "dialog",
                dialog: "team",
            };
        }
        const subcommand = tokens[0] ?? "help";
        if (subcommand === "open") {
            return {
                type: "dialog",
                dialog: "team",
            };
        }
        if (subcommand === "help") {
            return info([
                "Team commands:",
                "- /team (opens Team Management TUI)",
                "- /team open",
                "- /team create --file <manifest.yaml>",
                "- /team create --id <team_id> --name <team_name> (--agents <id:role,...> | --agent-tasks <task_id,...>) --channels <#name,...> [--description <text>] [--agent-task-modes <task_id:immediate|idle,...>]",
                "- /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>]",
                "- /team list",
                "- /team status <team_id>",
                "- /team run <team_id>",
                "- /team prompt <team_id> <instruction>",
                "- /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>]",
                "- /team remove-agent <team_id> <agent_id>",
                "- /team dissolve <team_id>",
            ].join("\n"));
        }
        if (subcommand === "create") {
            const fileArg = parseOption(tokens, "--file");
            if (fileArg) {
                const resolvedManifestPath = path.resolve(baseDir, fileArg);
                let manifest;
                try {
                    manifest = await loadTeamManifestFromFile(resolvedManifestPath);
                }
                catch (error) {
                    if (error instanceof TeamManifestError) {
                        return usageError(error.message);
                    }
                    return usageError(error instanceof Error ? error.message : String(error));
                }
                return await createTeamFromManifest(baseDir, manifest, resolvedManifestPath);
            }
            try {
                const inlineManifest = buildInlineManifest(tokens);
                return await createTeamFromManifest(baseDir, inlineManifest, "inline wizard");
            }
            catch (error) {
                if (error instanceof TeamManifestError) {
                    return usageError(error.message);
                }
                return usageError(error instanceof Error ? error.message : String(error));
            }
        }
        if (subcommand === "update") {
            const teamId = tokens[1]?.trim();
            if (!teamId) {
                return usageError("Usage: /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>]");
            }
            const state = await getTeamState(baseDir, teamId);
            if (!state) {
                return usageError(`Team "${teamId}" not found.`);
            }
            try {
                return await updateTeamFromInlineOptions(baseDir, state, tokens);
            }
            catch (error) {
                if (error instanceof TeamManifestError) {
                    return usageError(error.message);
                }
                return usageError(error instanceof Error ? error.message : String(error));
            }
        }
        if (subcommand === "list") {
            const teams = await listTeamStates(baseDir, { limit: 100 });
            if (teams.length === 0) {
                return info("No teams found.");
            }
            const lines = teams.map((team) => `- ${team.team_id} (${team.status}) agents=${Object.keys(team.agents).length} channels=${Object.keys(team.channels).length}`);
            return info(`Teams (${teams.length}):\n${lines.join("\n")}`);
        }
        if (subcommand === "status") {
            const teamId = tokens[1]?.trim();
            if (!teamId) {
                return usageError("Usage: /team status <team_id>");
            }
            const state = await getTeamState(baseDir, teamId);
            if (!state) {
                return usageError(`Team "${teamId}" not found.`);
            }
            return info(formatTeamStatus(state));
        }
        if (subcommand === "run") {
            const teamId = tokens[1]?.trim();
            if (!teamId) {
                return usageError("Usage: /team run <team_id>");
            }
            const state = await getTeamState(baseDir, teamId);
            if (!state) {
                return usageError(`Team "${teamId}" not found.`);
            }
            const alreadyRunning = await isOrchestratorRunning();
            if (!alreadyRunning) {
                const started = await startOrchestrator();
                if (!started) {
                    return usageError("Failed to start orchestrator daemon.");
                }
            }
            const launchResult = await launchTeamAgentTasks(state);
            const launchByAgentId = new Map(launchResult.launched.map((entry) => [entry.agent_id, entry]));
            const launchFailureByAgentId = new Map(launchResult.failed.map((entry) => [entry.agent_id, entry.error]));
            const immediateConfiguredCount = state.manifest.agents.filter((agent) => (agent.startup ?? "immediate") !== "idle").length;
            const updated = await upsertTeamState(baseDir, teamId, (current, nowIso) => {
                const existing = current ?? state;
                const nextAgents = {};
                const manifestAgentById = new Map(existing.manifest.agents.map((agent) => [agent.id, agent]));
                for (const [agentId, agent] of Object.entries(existing.agents)) {
                    const launched = launchByAgentId.get(agentId);
                    const launchError = launchFailureByAgentId.get(agentId);
                    const baseStatus = agent.session_id ? "idle" : "pending";
                    nextAgents[agentId] = {
                        ...agent,
                        status: launched
                            ? "working"
                            : launchError
                                ? "failed"
                                : baseStatus,
                        last_turn_at: launched ? nowIso : undefined,
                        result_summary: undefined,
                        last_error: launchError
                            ? `launch failed for team-member task "${agentId}": ${launchError}`
                            : undefined,
                    };
                }
                for (const manifestAgent of existing.manifest.agents) {
                    const existingAgent = nextAgents[manifestAgent.id];
                    const launched = launchByAgentId.get(manifestAgent.id);
                    const launchError = launchFailureByAgentId.get(manifestAgent.id);
                    const startupMode = manifestAgent.startup ?? "immediate";
                    if (existingAgent) {
                        nextAgents[manifestAgent.id] = {
                            ...existingAgent,
                            role: existingAgent.role || manifestAgent.role,
                        };
                        continue;
                    }
                    nextAgents[manifestAgent.id] = {
                        agent_id: manifestAgent.id,
                        role: manifestAgent.role,
                        status: launched
                            ? "working"
                            : launchError
                                ? "failed"
                                : startupMode === "idle"
                                    ? "idle"
                                    : "pending",
                        last_turn_at: launched ? nowIso : undefined,
                        last_error: launchError
                            ? `launch failed for team-member task "${manifestAgent.id}": ${launchError}`
                            : undefined,
                    };
                }
                const coordination = createRunCoordinationState(nowIso);
                for (const launched of launchResult.launched) {
                    const role = nextAgents[launched.agent_id]?.role ??
                        manifestAgentById.get(launched.agent_id)?.role ??
                        launched.agent_id;
                    coordination.delegations[launched.task_id] = {
                        task_id: launched.task_id,
                        agent_id: launched.agent_id,
                        delegated_at: nowIso,
                        status: "running",
                        task_description: `Kickoff team-member task for "${launched.agent_id}" (${role})`,
                    };
                }
                coordination.waiting_on_agent_ids = launchResult.launched.map((entry) => entry.agent_id);
                coordination.phase =
                    launchResult.launched.length > 0 ? "waiting" : "planning";
                return {
                    ...existing,
                    status: "active",
                    started_at: nowIso,
                    finished_at: undefined,
                    last_error: undefined,
                    orchestrator_session_id: launchResult.orchestratorSessionId ?? existing.orchestrator_session_id,
                    coordination,
                    agents: nextAgents,
                };
            });
            const lines = [
                `Team "${updated.team_id}" run initiated.`,
                alreadyRunning
                    ? "Orchestrator daemon already running."
                    : "Orchestrator daemon started.",
                `Launched immediate-start team-member tasks: ${launchResult.launched.length}/${immediateConfiguredCount}.`,
            ];
            if (launchResult.orchestratorSessionId) {
                lines.push(`Task completion messages will route to orchestrator session "${launchResult.orchestratorSessionId}".`);
            }
            if (launchResult.failed.length > 0) {
                lines.push(`Launch failures: ${launchResult.failed
                    .map((entry) => `${entry.agent_id} (${entry.error})`)
                    .join("; ")}`);
            }
            lines.push(launchResult.launched.length > 0
                ? "Team kickoff tasks were started in parallel; orchestrator will track results on the next tick."
                : immediateConfiguredCount === 0
                    ? "No kickoff tasks were launched because all agents are configured for idle start."
                    : "No kickoff tasks were launched. Ensure each immediate-start team member task template id matches the team agent id.");
            return info(lines.join("\n"));
        }
        if (subcommand === "prompt") {
            const teamId = tokens[1]?.trim();
            const instruction = tokens.slice(2).join(" ").trim();
            if (!teamId || !instruction) {
                return usageError('Usage: /team prompt <team_id> "<instruction>"');
            }
            const state = await getTeamState(baseDir, teamId);
            if (!state) {
                return usageError(`Team "${teamId}" not found.`);
            }
            const alreadyRunning = await isOrchestratorRunning();
            if (!alreadyRunning) {
                const started = await startOrchestrator();
                if (!started) {
                    return usageError("Failed to start orchestrator daemon.");
                }
            }
            const orchestratorSessionId = await resolveOrchestratorSessionId(state.orchestrator_session_id);
            const updated = await upsertTeamState(baseDir, teamId, (current, nowIso) => {
                const existing = current ?? state;
                const nextAgents = {};
                for (const [agentId, agent] of Object.entries(existing.agents)) {
                    nextAgents[agentId] = {
                        ...agent,
                        status: agent.status === "failed" ? "failed" : agent.session_id ? "idle" : "pending",
                        last_turn_at: undefined,
                        result_summary: undefined,
                        last_error: agent.status === "failed" ? agent.last_error : undefined,
                    };
                }
                return {
                    ...existing,
                    status: "active",
                    started_at: nowIso,
                    finished_at: undefined,
                    manifest: {
                        ...existing.manifest,
                        description: instruction,
                    },
                    orchestrator_session_id: orchestratorSessionId ?? existing.orchestrator_session_id,
                    coordination: createRunCoordinationState(nowIso),
                    agents: nextAgents,
                    last_error: undefined,
                };
            });
            await appendPromptToTeamChannel(baseDir, updated, instruction);
            await upsertTeamState(baseDir, teamId, (current, nowIso) => {
                const existing = current ?? updated;
                const channel = resolveTeamPromptChannel(existing);
                if (!channel) {
                    return existing;
                }
                const nextChannels = {
                    ...existing.channels,
                    [channel.channel_name]: {
                        ...channel,
                        message_count: Math.max(0, channel.message_count) + 1,
                        last_message_at: nowIso,
                    },
                };
                return {
                    ...existing,
                    channels: nextChannels,
                };
            });
            return info([
                `Prompt accepted for team "${teamId}".`,
                alreadyRunning
                    ? "Orchestrator daemon already running."
                    : "Orchestrator daemon started.",
                orchestratorSessionId
                    ? `Using orchestrator session "${orchestratorSessionId}".`
                    : "Orchestrator session id is pending; instruction was persisted and will be picked up.",
                "Team coordination reset to planning; orchestrator will act on the next tick.",
            ].join("\n"));
        }
        if (subcommand === "add-agent") {
            const teamId = tokens[1]?.trim();
            if (!teamId) {
                return usageError("Usage: /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>]");
            }
            const agentId = parseOption(tokens, "--agent-id");
            const sessionId = parseOption(tokens, "--session-id");
            const role = parseOption(tokens, "--role");
            if (!agentId) {
                return usageError("Usage: /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>]");
            }
            const team = await getTeamState(baseDir, teamId);
            if (!team) {
                return usageError(`Team "${teamId}" not found.`);
            }
            const existingAgent = team.agents[agentId];
            const resolvedRole = role ??
                existingAgent?.role ??
                team.manifest.agents.find((entry) => entry.id === agentId)?.role ??
                undefined;
            if (!resolvedRole) {
                return usageError(`Agent "${agentId}" is not in the manifest. Provide --role to add it.`);
            }
            let resolvedSessionId = sessionId;
            if (!resolvedSessionId) {
                resolvedSessionId = getDefaultTeamAgentSessionId(teamId, agentId);
                const started = await startTeamAgentDaemon({
                    baseDir,
                    sessionId: resolvedSessionId,
                    teamId,
                    agentId,
                    role: resolvedRole,
                    model: team.manifest.agents.find((entry) => entry.id === agentId)?.model,
                    instructions: team.manifest.agents.find((entry) => entry.id === agentId)
                        ?.instructions,
                });
                if (!started) {
                    return usageError(`Failed to start team agent daemon for "${agentId}" (session "${resolvedSessionId}").`);
                }
            }
            const session = await getSession(resolvedSessionId);
            if (!session) {
                return usageError(`Session "${resolvedSessionId}" not found.`);
            }
            if (session.mode !== "team_agent") {
                return usageError(`Session "${resolvedSessionId}" has mode "${session.mode}". Team agents must be registered with mode "team_agent".`);
            }
            const next = await upsertTeamState(baseDir, teamId, (current) => {
                const existing = current ?? team;
                const manifestHasAgent = existing.manifest.agents.some((entry) => entry.id === agentId);
                return {
                    ...existing,
                    manifest: manifestHasAgent
                        ? existing.manifest
                        : {
                            ...existing.manifest,
                            agents: [
                                ...existing.manifest.agents,
                                { id: agentId, role: resolvedRole, startup: "immediate" },
                            ],
                        },
                    agents: {
                        ...existing.agents,
                        [agentId]: {
                            agent_id: agentId,
                            session_id: resolvedSessionId,
                            role: resolvedRole,
                            status: "idle",
                        },
                    },
                };
            });
            return info(`Bound agent "${agentId}" to session "${resolvedSessionId}" in team "${next.team_id}".`);
        }
        if (subcommand === "remove-agent") {
            const teamId = tokens[1]?.trim();
            const agentId = tokens[2]?.trim();
            if (!teamId || !agentId) {
                return usageError("Usage: /team remove-agent <team_id> <agent_id>");
            }
            const team = await getTeamState(baseDir, teamId);
            if (!team) {
                return usageError(`Team "${teamId}" not found.`);
            }
            if (!team.agents[agentId]) {
                return usageError(`Agent "${agentId}" not found in team "${teamId}".`);
            }
            await upsertTeamState(baseDir, teamId, (current) => {
                const existing = current ?? team;
                const nextAgents = { ...existing.agents };
                delete nextAgents[agentId];
                return {
                    ...existing,
                    manifest: {
                        ...existing.manifest,
                        agents: existing.manifest.agents.filter((entry) => entry.id !== agentId),
                    },
                    agents: nextAgents,
                };
            });
            return info(`Removed agent "${agentId}" from team "${teamId}".`);
        }
        if (subcommand === "dissolve") {
            const teamId = tokens[1]?.trim();
            if (!teamId) {
                return usageError("Usage: /team dissolve <team_id>");
            }
            const state = await getTeamState(baseDir, teamId);
            if (!state) {
                return usageError(`Team "${teamId}" not found.`);
            }
            await Promise.all(Object.values(state.channels).map(async (channel) => {
                const resolved = path.resolve(baseDir, channel.path);
                await fs.unlink(resolved).catch((error) => {
                    const nodeError = error;
                    if (nodeError?.code !== "ENOENT") {
                        throw error;
                    }
                });
            }));
            await Promise.all(Object.values(state.agents).map(async (agent) => {
                const sessionId = agent.session_id;
                if (!sessionId) {
                    return;
                }
                await stopTeamAgentDaemon(baseDir, sessionId).catch(() => { });
            }));
            const removed = await removeTeamState(baseDir, teamId);
            if (!removed) {
                return usageError(`Failed to dissolve team "${teamId}".`);
            }
            return info(`Team "${teamId}" dissolved and channel files cleaned up.`);
        }
        return usageError("Unknown subcommand. Use /team (or /team open), /team help, /team create --file <manifest.yaml>, /team create --id <team_id> --name <team_name> (--agents <id:role,...> | --agent-tasks <task_id,...>) --channels <#name,...> [--description <text>] [--agent-task-modes <task_id:immediate|idle,...>], /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>], /team list, /team status <team_id>, /team run <team_id>, /team prompt <team_id> <instruction>, /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>], /team remove-agent <team_id> <agent_id>, or /team dissolve <team_id>.");
    },
};
//# sourceMappingURL=teamCommand.js.map