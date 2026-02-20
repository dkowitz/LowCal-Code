/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import {
  LaunchTaskTool,
  getSession,
  getTeamState,
  listSessions,
  listTeamStates,
  removeTeamState,
  upsertTeamState,
  type TeamManifest,
  type TeamState,
} from "@qwen-code/qwen-code-core";
import {
  CommandKind,
  type MessageActionReturn,
  type OpenDialogActionReturn,
  type SlashCommand,
} from "./types.js";
import {
  TeamManifestError,
  loadTeamManifestFromFile,
} from "../../team/manifest-loader.js";
import {
  getDefaultTeamAgentSessionId,
  startTeamAgentDaemon,
  stopTeamAgentDaemon,
} from "../../team/agent-daemon.js";
import {
  isOrchestratorRunning,
  startOrchestrator,
} from "../../orchestrator/daemon.js";

type AgentStartupMode = "immediate" | "idle";
type TeamParticipantId = "user" | "orchestrator" | string;
type LaunchExecutionMode = "headless" | "zellij_tab";

interface TeamChannelLogMessage {
  channel: string;
  from_agent: string;
  to_agent?: string;
  visibility?: "public" | "direct";
  turn_number: number;
  timestamp: string;
  message_type:
    | "instruction"
    | "task_update"
    | "result"
    | "question"
    | "clarification"
    | "chat"
    | "dm";
  content: {
    text: string;
  };
  metadata?: Record<string, unknown>;
}

const DM_CHANNEL_PREFIX = "@dm:";

function usageError(content: string): MessageActionReturn {
  return {
    type: "message",
    messageType: "error",
    content,
  };
}

function info(content: string): MessageActionReturn {
  return {
    type: "message",
    messageType: "info",
    content,
  };
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function parseOption(tokens: string[], key: string): string | undefined {
  const index = tokens.findIndex((value) => value === key);
  if (index < 0) {
    return undefined;
  }
  const value = tokens[index + 1];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseOptionalPositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function splitCsvOrLines(value: string): string[] {
  return value
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseAgentStartupMode(
  value: string,
  context: string,
): AgentStartupMode {
  const normalized = value.trim().toLowerCase();
  if (normalized === "immediate") {
    return "immediate";
  }
  if (normalized === "idle") {
    return "idle";
  }
  throw new TeamManifestError(
    `${context} must be "immediate" or "idle" (received "${value}").`,
  );
}

function parseInlineAgentTaskModes(value: string): Map<string, AgentStartupMode> {
  const entries = splitCsvOrLines(value);
  const modes = new Map<string, AgentStartupMode>();
  for (const [index, entry] of entries.entries()) {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
      throw new TeamManifestError(
        `Invalid agent-task mode entry "${entry}" at position ${index + 1}. Use task_id:immediate|idle.`,
      );
    }
    const taskId = entry.slice(0, separatorIndex).trim();
    const modeRaw = entry.slice(separatorIndex + 1).trim();
    if (!taskId) {
      throw new TeamManifestError(
        `Invalid agent-task mode entry "${entry}" at position ${index + 1}. Missing task id.`,
      );
    }
    if (modes.has(taskId)) {
      throw new TeamManifestError(
        `Duplicate task id "${taskId}" in --agent-task-modes.`,
      );
    }
    modes.set(
      taskId,
      parseAgentStartupMode(modeRaw, `--agent-task-modes entry "${entry}"`),
    );
  }
  return modes;
}

function parseInlineAgents(value: string): TeamManifest["agents"] {
  const entries = splitCsvOrLines(value);
  if (entries.length === 0) {
    throw new TeamManifestError(
      "Inline create requires at least one agent via --agents (format: id:role,id2:role2).",
    );
  }

  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 1 || separatorIndex === entry.length - 1) {
      throw new TeamManifestError(
        `Invalid agent entry "${entry}" at position ${index + 1}. Use id:role.`,
      );
    }
    const id = entry.slice(0, separatorIndex).trim();
    const role = entry.slice(separatorIndex + 1).trim();
    if (!id || !role) {
      throw new TeamManifestError(
        `Invalid agent entry "${entry}" at position ${index + 1}. Use id:role.`,
      );
    }
    if (role === "orchestrator") {
      throw new TeamManifestError(
        `Invalid agent entry "${entry}" at position ${index + 1}: role cannot be "orchestrator".`,
      );
    }
    if (seen.has(id)) {
      throw new TeamManifestError(`Duplicate agent id "${id}" in --agents.`);
    }
    seen.add(id);
    return { id, role, startup: "immediate" };
  });
}

function parseInlineAgentTasks(
  value: string,
  startupModes?: Map<string, AgentStartupMode>,
): TeamManifest["agents"] {
  const entries = splitCsvOrLines(value);
  if (entries.length === 0) {
    throw new TeamManifestError(
      "Inline create requires at least one task id via --agent-tasks.",
    );
  }

  const seen = new Set<string>();
  const tasks = entries.map((entry, index) => {
    const taskId = entry.trim();
    if (!taskId) {
      throw new TeamManifestError(
        `Invalid task id entry at position ${index + 1} in --agent-tasks.`,
      );
    }
    if (seen.has(taskId)) {
      throw new TeamManifestError(
        `Duplicate task id "${taskId}" in --agent-tasks.`,
      );
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
    const unknown = Array.from(startupModes.keys()).filter(
      (id) => !taskIds.has(id),
    );
    if (unknown.length > 0) {
      throw new TeamManifestError(
        `--agent-task-modes references task ids not present in --agent-tasks: ${unknown.join(", ")}`,
      );
    }
  }

  return tasks;
}

function normalizeChannelName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith(DM_CHANNEL_PREFIX)) {
    return trimmed;
  }
  if (trimmed.startsWith("@")) {
    return trimmed;
  }
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function normalizeParticipant(value: string): TeamParticipantId {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "user" || trimmed === "orchestrator") {
    return trimmed;
  }
  if (trimmed.startsWith("agent:")) {
    return trimmed.slice("agent:".length).trim();
  }
  return trimmed;
}

function resolveParticipantOrError(
  team: TeamState,
  raw: string | undefined,
  fieldName: string,
): TeamParticipantId | TeamManifestError {
  if (!raw || raw.trim().length === 0) {
    return new TeamManifestError(`${fieldName} is required.`);
  }
  const participant = normalizeParticipant(raw);
  if (participant === "user" || participant === "orchestrator") {
    return participant;
  }
  if (team.agents[participant]) {
    return participant;
  }
  return new TeamManifestError(
    `${fieldName} "${raw}" is invalid. Expected user, orchestrator, or an existing team agent id.`,
  );
}

function buildDmChannelName(
  leftRaw: TeamParticipantId,
  rightRaw: TeamParticipantId,
): string {
  const left = String(leftRaw).trim();
  const right = String(rightRaw).trim();
  const ordered = [left, right].sort((a, b) => a.localeCompare(b));
  return `${DM_CHANNEL_PREFIX}${ordered[0]}|${ordered[1]}`;
}

function parseDmChannelParticipants(
  channelName: string,
): [string, string] | undefined {
  if (!channelName.startsWith(DM_CHANNEL_PREFIX)) {
    return undefined;
  }
  const payload = channelName.slice(DM_CHANNEL_PREFIX.length);
  const pieces = payload.split("|");
  if (pieces.length !== 2) {
    return undefined;
  }
  const left = pieces[0]?.trim();
  const right = pieces[1]?.trim();
  if (!left || !right) {
    return undefined;
  }
  return [left, right];
}

function resolveTeamObjective(manifest: TeamManifest): string | undefined {
  const objective =
    manifest.description?.trim() ?? manifest.orchestrator?.prompt?.trim();
  return objective && objective.length > 0 ? objective : undefined;
}

function resolveOrchestratorPrompt(manifest: TeamManifest): string | undefined {
  const prompt = manifest.orchestrator?.prompt?.trim();
  if (prompt && prompt.length > 0) {
    return prompt;
  }
  return resolveTeamObjective(manifest);
}

function resolveTeamExecutionMode(
  manifest: TeamManifest,
): LaunchExecutionMode | undefined {
  if (manifest.execution?.mode === "headless") {
    return "headless";
  }
  if (manifest.execution?.mode === "interactive") {
    return "zellij_tab";
  }
  return undefined;
}

function resolveChannelSpec(
  team: TeamState,
  channelName: string,
): TeamManifest["channels"][number] | undefined {
  return team.manifest.channels.find((entry) => entry.name === channelName);
}

function isParticipantAllowedInChannel(
  team: TeamState,
  channelName: string,
  participant: TeamParticipantId,
): boolean {
  const participantId = String(participant);
  if (participantId === "user" || participantId === "orchestrator") {
    return true;
  }
  if (channelName.startsWith(DM_CHANNEL_PREFIX)) {
    const members = parseDmChannelParticipants(channelName);
    return members?.includes(participantId) ?? false;
  }

  const channelSpec = resolveChannelSpec(team, channelName);
  if (!channelSpec || channelSpec.visibility !== "restricted") {
    return true;
  }
  return (channelSpec.members ?? []).includes(participantId);
}

function isDynamicCommsChannel(channelName: string): boolean {
  return channelName.startsWith(DM_CHANNEL_PREFIX);
}

function parseInlineChannels(value: string): TeamManifest["channels"] {
  const entries = splitCsvOrLines(value)
    .map(normalizeChannelName)
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    throw new TeamManifestError(
      "Inline create requires at least one channel via --channels.",
    );
  }

  const seen = new Set<string>();
  return entries.map((name) => {
    if (seen.has(name)) {
      throw new TeamManifestError(`Duplicate channel name "${name}" in --channels.`);
    }
    seen.add(name);
    return {
      name,
      history: "shared" as const,
    };
  });
}

function buildInlineManifest(tokens: string[]): TeamManifest {
  const id = parseOption(tokens, "--id");
  const name = parseOption(tokens, "--name");
  const description = parseOption(tokens, "--description");
  const agentsValue = parseOption(tokens, "--agents");
  const agentTasksValue = parseOption(tokens, "--agent-tasks");
  const agentTaskModesValue = parseOption(tokens, "--agent-task-modes");
  const channelsValue = parseOption(tokens, "--channels");

  if (!id || !name || (!agentsValue && !agentTasksValue) || !channelsValue) {
    throw new TeamManifestError(
      "Usage: /team create --id <team_id> --name <team_name> (--agents <id:role,...> | --agent-tasks <task_id,...>) --channels <#name,...> [--description <text>] [--agent-task-modes <task_id:immediate|idle,...>]",
    );
  }
  if (agentTaskModesValue && !agentTasksValue) {
    throw new TeamManifestError(
      "--agent-task-modes can only be used with --agent-tasks.",
    );
  }
  const agentTaskModes = agentTaskModesValue
    ? parseInlineAgentTaskModes(agentTaskModesValue)
    : undefined;

  return {
    version: "1.0",
    id,
    name,
    description,
    ...(description
      ? {
          orchestrator: {
            prompt: description,
          },
        }
      : {}),
    agents: agentsValue
      ? parseInlineAgents(agentsValue)
      : parseInlineAgentTasks(agentTasksValue!, agentTaskModes),
    channels: parseInlineChannels(channelsValue),
  };
}

function channelFilePath(teamId: string, channelName: string): string {
  const safe = channelName.replace(/^#/, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  return path.join(".lowcal", "team-channels", `${teamId}-${safe}.jsonl`);
}

function buildTeamState(manifest: TeamManifest, nowIso: string): TeamState {
  const agents = Object.fromEntries(
    manifest.agents.map((agent) => [
      agent.id,
      {
        agent_id: agent.id,
        role: agent.role,
        status: "pending" as const,
      },
    ]),
  );

  const channels = Object.fromEntries(
    manifest.channels.map((channel) => [
      channel.name,
      {
        channel_name: channel.name,
        message_count: 0,
        path: channelFilePath(manifest.id, channel.name),
      },
    ]),
  );

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

interface ProvisionedAgentInfo {
  agent_id: string;
  session_id: string;
  started: boolean;
}

async function provisionTeamAgents(
  baseDir: string,
  manifest: TeamManifest,
): Promise<ProvisionedAgentInfo[]> {
  const provisioned = await Promise.all(
    manifest.agents.map(async (agent) => {
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
    }),
  );
  return provisioned;
}

function formatTeamStatus(state: TeamState): string {
  const agentRows = Object.values(state.agents)
    .map((agent) => {
      const sessionInfo = agent.session_id ? ` session=${agent.session_id}` : "";
      return `- ${agent.agent_id} (${agent.role}) status=${agent.status}${sessionInfo}`;
    })
    .join("\n");

  const channelRows = Object.values(state.channels)
    .map(
      (channel) =>
        `- ${channel.channel_name} messages=${channel.message_count} path=${channel.path}`,
    )
    .join("\n");

  const lines = [
    `Team: ${state.team_id}`,
    `Name: ${state.name}`,
    `Status: ${state.status}`,
    `Phase: ${state.coordination?.phase ?? "planning"}`,
    `Objective: ${resolveTeamObjective(state.manifest) ?? "(unset)"}`,
    `Orchestrator Prompt: ${resolveOrchestratorPrompt(state.manifest) ?? "(unset)"}`,
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

function createRunCoordinationState(
  nowIso: string,
): NonNullable<TeamState["coordination"]> {
  return {
    phase: "planning",
    turn_number: 0,
    waiting_on_agent_ids: [],
    last_transition_at: nowIso,
    last_updated_at: nowIso,
    delegations: {},
  };
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

const LOWCAL_SCHEDULER_CWD_ENV = "LOWCAL_SCHEDULER_CWD";

async function withSchedulerWorkspaceRoot<T>(
  baseDir: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = process.env[LOWCAL_SCHEDULER_CWD_ENV];
  process.env[LOWCAL_SCHEDULER_CWD_ENV] = baseDir;
  try {
    return await operation();
  } finally {
    if (previous === undefined) {
      delete process.env[LOWCAL_SCHEDULER_CWD_ENV];
    } else {
      process.env[LOWCAL_SCHEDULER_CWD_ENV] = previous;
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function resolveOrchestratorSessionId(
  fallback?: string,
): Promise<string | undefined> {
  const sessions = await listSessions();
  const active = sessions
    .filter((session) => session.mode === "orchestrator")
    .filter(
      (session) =>
        Number.isFinite(session.pid) && isProcessAlive(session.pid),
    )
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
  if (
    typeof fallback === "string" &&
    fallback.trim().length > 0 &&
    fallback !== "orchestrator-pending"
  ) {
    return fallback;
  }
  return undefined;
}

interface TeamRunLaunchResult {
  agent_id: string;
  task_id: string;
}

interface TeamRunLaunchFailure {
  agent_id: string;
  error: string;
}

async function launchTeamAgentTasks(
  team: TeamState,
): Promise<{
  launched: TeamRunLaunchResult[];
  failed: TeamRunLaunchFailure[];
  orchestratorSessionId?: string;
}> {
  const launchTool = new LaunchTaskTool();
  const orchestratorSessionId = await resolveOrchestratorSessionId(
    team.orchestrator_session_id,
  );
  const baseTs = Date.now();
  const launched: TeamRunLaunchResult[] = [];
  const failed: TeamRunLaunchFailure[] = [];
  const executionMode = resolveTeamExecutionMode(team.manifest);
  const objective = resolveTeamObjective(team.manifest);
  const immediateAgents = team.manifest.agents.filter(
    (agent) => agent.startup !== "idle",
  );

  await Promise.all(
    immediateAgents.map(async (agent, index) => {
      const taskId = `team-${sanitizeId(team.team_id)}-${sanitizeId(agent.id)}-${baseTs + index}`;
      const result = await launchTool.validateBuildAndExecute(
        {
          action: "create",
          id: taskId,
          template_id: agent.id,
          template_level: "auto",
          description: objective
            ? `Team kickoff task for ${team.team_id}/${agent.id}: ${objective}`
            : `Team kickoff task for ${team.team_id}/${agent.id}`,
          ...(orchestratorSessionId
            ? { return_to_session_id: orchestratorSessionId }
            : {}),
          ...(executionMode
            ? { execution_mode: executionMode, execution_mode_override: true }
            : {}),
        },
        new AbortController().signal,
      );

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
    }),
  );

  return {
    launched,
    failed,
    orchestratorSessionId,
  };
}

function buildTeamChannelsState(
  teamId: string,
  channels: TeamManifest["channels"],
  existing?: TeamState["channels"],
): TeamState["channels"] {
  const next: TeamState["channels"] = {};
  for (const channel of channels) {
    const current = existing?.[channel.name];
    next[channel.name] = {
      channel_name: channel.name,
      message_count: current?.message_count ?? 0,
      last_message_at: current?.last_message_at,
      path: current?.path ?? channelFilePath(teamId, channel.name),
    };
  }
  for (const [channelName, channelState] of Object.entries(existing ?? {})) {
    if (next[channelName]) {
      continue;
    }
    if (!isDynamicCommsChannel(channelName)) {
      continue;
    }
    next[channelName] = { ...channelState };
  }
  return next;
}

function buildTeamAgentsState(
  teamId: string,
  agents: TeamManifest["agents"],
  existing?: TeamState["agents"],
): TeamState["agents"] {
  const next: TeamState["agents"] = {};
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

async function ensureTeamChannelFiles(
  baseDir: string,
  channels: TeamState["channels"],
): Promise<void> {
  await Promise.all(
    Object.values(channels).map(async (channel) => {
      const resolved = path.resolve(baseDir, channel.path);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      try {
        await fs.access(resolved);
      } catch {
        await fs.writeFile(resolved, "", "utf-8");
      }
    }),
  );
}

function resolvePublicChannelName(state: TeamState): string {
  if (state.channels["#public"]) {
    return "#public";
  }
  if (state.channels["#general"]) {
    return "#general";
  }
  const manifestChannel = state.manifest.channels.find((channel) =>
    channel.name.startsWith("#"),
  );
  if (manifestChannel) {
    return manifestChannel.name;
  }
  const first = Object.keys(state.channels).find(
    (channelName) => !channelName.startsWith(DM_CHANNEL_PREFIX),
  );
  return first ?? "#public";
}

function resolveChannelPath(baseDir: string, relativeOrAbsolute: string): string {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(baseDir, relativeOrAbsolute);
}

async function readChannelLog(
  baseDir: string,
  channel: TeamState["channels"][string],
): Promise<TeamChannelLogMessage[]> {
  const channelPath = resolveChannelPath(baseDir, channel.path);
  try {
    const raw = await fs.readFile(channelPath, "utf-8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as TeamChannelLogMessage;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is TeamChannelLogMessage => Boolean(entry));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function ensureTeamChannel(
  baseDir: string,
  team: TeamState,
  channelName: string,
): Promise<TeamState> {
  if (team.channels[channelName]) {
    return team;
  }
  const next = await upsertTeamState(baseDir, team.team_id, (current) => {
    const existing = current ?? team;
    if (existing.channels[channelName]) {
      return existing;
    }
    return {
      ...existing,
      channels: {
        ...existing.channels,
        [channelName]: {
          channel_name: channelName,
          message_count: 0,
          path: channelFilePath(existing.team_id, channelName),
        },
      },
    };
  });
  await ensureTeamChannelFiles(baseDir, next.channels);
  return next;
}

async function appendTeamChannelMessage(
  baseDir: string,
  team: TeamState,
  channelName: string,
  payload: {
    from: TeamParticipantId;
    to?: TeamParticipantId;
    text: string;
    visibility: "public" | "direct";
    messageType: TeamChannelLogMessage["message_type"];
    metadata?: Record<string, unknown>;
  },
): Promise<{ updated: TeamState; turnNumber: number }> {
  const withChannel = await ensureTeamChannel(baseDir, team, channelName);
  const channel = withChannel.channels[channelName];
  if (!channel) {
    throw new TeamManifestError(
      `Failed to resolve channel "${channelName}" for team "${team.team_id}".`,
    );
  }

  const turnNumber = Math.max(0, channel.message_count) + 1;
  const timestamp = new Date().toISOString();
  const message: TeamChannelLogMessage = {
    channel: channel.channel_name,
    from_agent: String(payload.from),
    ...(payload.to ? { to_agent: String(payload.to) } : {}),
    visibility: payload.visibility,
    turn_number: turnNumber,
    timestamp,
    message_type: payload.messageType,
    content: {
      text: payload.text,
    },
    metadata: {
      team_id: withChannel.team_id,
      ...(payload.metadata ?? {}),
    },
  };

  const channelPath = resolveChannelPath(baseDir, channel.path);
  await fs.mkdir(path.dirname(channelPath), { recursive: true });
  await fs.appendFile(channelPath, `${JSON.stringify(message)}\n`, "utf-8");

  const updated = await upsertTeamState(baseDir, withChannel.team_id, (current) => {
    const existing = current ?? withChannel;
    const currentChannel = existing.channels[channelName];
    if (!currentChannel) {
      return existing;
    }
    return {
      ...existing,
      channels: {
        ...existing.channels,
        [channelName]: {
          ...currentChannel,
          message_count: turnNumber,
          last_message_at: timestamp,
        },
      },
    };
  });

  return {
    updated,
    turnNumber,
  };
}

async function appendPromptToTeamChannel(
  baseDir: string,
  state: TeamState,
  prompt: string,
): Promise<void> {
  const channelName = resolvePublicChannelName(state);
  await appendTeamChannelMessage(baseDir, state, channelName, {
    from: "user",
    text: prompt,
    visibility: "public",
    messageType: "instruction",
    metadata: {
      source: "team_prompt",
    },
  });
}

async function createTeamFromManifest(
  baseDir: string,
  manifest: TeamManifest,
  sourceDescription: string,
): Promise<MessageActionReturn> {
  const normalizedManifest: TeamManifest = {
    ...manifest,
    ...(resolveOrchestratorPrompt(manifest)
      ? {
          orchestrator: {
            prompt: resolveOrchestratorPrompt(manifest)!,
          },
        }
      : {}),
    agents: manifest.agents.map((agent) => ({
      ...agent,
      startup: agent.startup ?? "immediate",
    })),
  };

  const existing = await getTeamState(baseDir, normalizedManifest.id);
  if (existing && existing.status !== "dissolved") {
    return usageError(
      `Team "${normalizedManifest.id}" already exists with status "${existing.status}".`,
    );
  }

  const created = await upsertTeamState(
    baseDir,
    normalizedManifest.id,
    (_current, nowIso) => buildTeamState(normalizedManifest, nowIso),
  );

  await ensureTeamChannelFiles(baseDir, created.channels);

  const provisionedAgents = await provisionTeamAgents(baseDir, normalizedManifest);
  const provisionedByAgentId = new Map(
    provisionedAgents.map((entry) => [entry.agent_id, entry]),
  );

  const updated = await upsertTeamState(baseDir, normalizedManifest.id, (current) => {
    const existingState = current ?? created;
    const nextAgents: TeamState["agents"] = { ...existingState.agents };
    for (const agent of manifest.agents) {
      const provisioned = provisionedByAgentId.get(agent.id);
      if (!provisioned) {
        continue;
      }
      const currentState = nextAgents[agent.id] ?? {
        agent_id: agent.id,
        role: agent.role,
        status: "pending" as const,
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
  const provisioningSummary =
    failed.length === 0
      ? `Provisioned team_agent sessions: ${readyCount}/${provisionedAgents.length}.`
      : `Provisioned team_agent sessions: ${readyCount}/${provisionedAgents.length}. Failed: ${failed.map((entry) => entry.agent_id).join(", ")}`;

  return info(
    [
      `Team "${updated.team_id}" created from ${sourceDescription}.`,
      `Agents: ${Object.keys(updated.agents).length}`,
      `Channels: ${Object.keys(updated.channels).length}`,
      provisioningSummary,
      "Agents are persistent `team_agent` sessions and are orchestrator-mediated in v1.",
    ].join("\n"),
  );
}

async function updateTeamFromInlineOptions(
  baseDir: string,
  state: TeamState,
  tokens: string[],
): Promise<MessageActionReturn> {
  const name = parseOption(tokens, "--name");
  const description = parseOption(tokens, "--description");
  const channelsValue = parseOption(tokens, "--channels");
  const agentTasksValue = parseOption(tokens, "--agent-tasks");
  const agentTaskModesValue = parseOption(tokens, "--agent-task-modes");

  if (
    !name &&
    !description &&
    !channelsValue &&
    !agentTasksValue &&
    !agentTaskModesValue
  ) {
    return usageError(
      "Usage: /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>]",
    );
  }

  if (agentTaskModesValue && !agentTasksValue) {
    const startupModes = parseInlineAgentTaskModes(agentTaskModesValue);
    const knownAgentIds = new Set(state.manifest.agents.map((agent) => agent.id));
    const unknown = Array.from(startupModes.keys()).filter(
      (id) => !knownAgentIds.has(id),
    );
    if (unknown.length > 0) {
      return usageError(
        `--agent-task-modes references agents not present in the team: ${unknown.join(", ")}`,
      );
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

  const nextManifest: TeamManifest = {
    ...state.manifest,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(description
      ? {
          orchestrator: {
            prompt: description,
          },
        }
      : {}),
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
    .filter((sessionId): sessionId is string => Boolean(sessionId));

  const nextChannelNames = new Set(nextManifest.channels.map((channel) => channel.name));
  const removedChannelPaths = Object.values(state.channels)
    .filter((channel) => !nextChannelNames.has(channel.channel_name))
    .filter((channel) => !isDynamicCommsChannel(channel.channel_name))
    .map((channel) => channel.path);

  const updated = await upsertTeamState(baseDir, state.team_id, (current) => {
    const existing = current ?? state;
    return {
      ...existing,
      name: nextManifest.name,
      manifest: nextManifest,
      agents: buildTeamAgentsState(existing.team_id, nextManifest.agents, existing.agents),
      channels: buildTeamChannelsState(
        existing.team_id,
        nextManifest.channels,
        existing.channels,
      ),
      last_error: undefined,
    };
  });

  await ensureTeamChannelFiles(baseDir, updated.channels);

  await Promise.all(
    removedChannelPaths.map(async (relativePath) => {
      const resolved = path.resolve(baseDir, relativePath);
      await fs.unlink(resolved).catch((error) => {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code !== "ENOENT") {
          throw error;
        }
      });
    }),
  );

  await Promise.all(
    removedAgentSessionIds.map(async (sessionId) => {
      await stopTeamAgentDaemon(baseDir, sessionId).catch(() => {});
    }),
  );

  const provisionedAgents = await provisionTeamAgents(baseDir, nextManifest);
  const provisionedByAgentId = new Map(
    provisionedAgents.map((entry) => [entry.agent_id, entry]),
  );

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
        status: "pending" as const,
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
      channels: buildTeamChannelsState(
        existing.team_id,
        nextManifest.channels,
        existing.channels,
      ),
      last_error: undefined,
    };
  });

  const immediateCount = nextManifest.agents.filter(
    (agent) => agent.startup !== "idle",
  ).length;
  const idleCount = nextManifest.agents.length - immediateCount;

  return info(
    [
      `Team "${refreshed.team_id}" updated.`,
      `Name: ${refreshed.name}`,
      `Agents: ${nextManifest.agents.length} (immediate=${immediateCount}, idle=${idleCount})`,
      `Channels: ${nextManifest.channels.length}`,
    ].join("\n"),
  );
}

function formatChannelMessage(message: TeamChannelLogMessage): string {
  const toSuffix = message.to_agent ? ` -> ${message.to_agent}` : "";
  const visibility = message.visibility ?? "public";
  return [
    `[turn ${message.turn_number}] [${message.channel}] ${message.from_agent}${toSuffix} (${visibility}) @ ${new Date(message.timestamp).toLocaleString()}`,
    message.content?.text ?? "",
  ].join("\n");
}

async function readTeamMessagesForChannel(
  baseDir: string,
  team: TeamState,
  channelName: string,
  options?: { afterTurn?: number; limit?: number },
): Promise<TeamChannelLogMessage[]> {
  const channel = team.channels[channelName];
  if (!channel) {
    return [];
  }
  const messages = await readChannelLog(baseDir, channel);
  const afterTurn = Math.max(0, options?.afterTurn ?? 0);
  const limit = Math.max(1, Math.min(500, options?.limit ?? 50));
  return messages
    .filter((message) => message.turn_number > afterTurn)
    .slice(-limit);
}

async function postTeamCommunication(
  baseDir: string,
  team: TeamState,
  options: {
    fromRaw?: string;
    toRaw?: string;
    channelRaw?: string;
    contentRaw?: string;
    defaultFrom?: TeamParticipantId;
  },
): Promise<{
  updated: TeamState;
  channelName: string;
  turnNumber: number;
  visibility: "public" | "direct";
}> {
  const content = options.contentRaw?.trim();
  if (!content) {
    throw new TeamManifestError("Message content is required (--content).");
  }
  const fromResolved = resolveParticipantOrError(
    team,
    options.fromRaw ?? String(options.defaultFrom ?? "user"),
    "--from",
  );
  if (fromResolved instanceof TeamManifestError) {
    throw fromResolved;
  }

  const channelRawNormalized = options.channelRaw
    ? normalizeChannelName(options.channelRaw)
    : undefined;
  let toResolved: TeamParticipantId | undefined;
  if (options.toRaw) {
    const to = resolveParticipantOrError(team, options.toRaw, "--to");
    if (to instanceof TeamManifestError) {
      throw to;
    }
    toResolved = to;
  }

  let channelName = channelRawNormalized ?? resolvePublicChannelName(team);
  let visibility: "public" | "direct" = "public";

  if (toResolved) {
    channelName = buildDmChannelName(fromResolved, toResolved);
    visibility = "direct";
  } else if (channelName.startsWith(DM_CHANNEL_PREFIX)) {
    const participants = parseDmChannelParticipants(channelName);
    if (!participants) {
      throw new TeamManifestError(
        `DM channel "${channelName}" is malformed. Expected ${DM_CHANNEL_PREFIX}<participantA>|<participantB>.`,
      );
    }
    if (!participants.includes(String(fromResolved))) {
      throw new TeamManifestError(
        `Sender "${String(fromResolved)}" is not a participant in DM channel "${channelName}".`,
      );
    }
    const other = participants.find((entry) => entry !== String(fromResolved));
    toResolved = other;
    visibility = "direct";
  } else {
    channelName = normalizeChannelName(channelName);
  }

  if (
    visibility === "public" &&
    !isParticipantAllowedInChannel(team, channelName, fromResolved)
  ) {
    throw new TeamManifestError(
      `Sender "${String(fromResolved)}" is not allowed in channel "${channelName}".`,
    );
  }
  if (
    visibility === "direct" &&
    toResolved &&
    !isParticipantAllowedInChannel(team, channelName, toResolved)
  ) {
    throw new TeamManifestError(
      `Recipient "${String(toResolved)}" is not allowed in channel "${channelName}".`,
    );
  }

  const result = await appendTeamChannelMessage(baseDir, team, channelName, {
    from: fromResolved,
    ...(toResolved ? { to: toResolved } : {}),
    text: content,
    visibility,
    messageType: visibility === "direct" ? "dm" : "chat",
    metadata: {
      source: "team_message",
    },
  });
  return {
    updated: result.updated,
    channelName,
    turnNumber: result.turnNumber,
    visibility,
  };
}

export const teamCommand: SlashCommand = {
  name: "team",
  description: "create and inspect orchestrator-managed agent teams",
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    args,
  ): Promise<OpenDialogActionReturn | MessageActionReturn | void> => {
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

    if (subcommand === "runtime" || subcommand === "monitor") {
      return info(
        'Team Runtime Console is CLI-only. Run "lowcal team-monitor" (or "qwen team-runtime") in a separate terminal.',
      );
    }

    if (subcommand === "help") {
      return info(
        [
          "Team commands:",
          "- /team (opens Team Management TUI)",
          "- /team open",
          "- /team create --file <manifest.yaml>",
          "- /team create --id <team_id> --name <team_name> (--agents <id:role,...> | --agent-tasks <task_id,...>) --channels <#name,...> [--description <text>] [--agent-task-modes <task_id:immediate|idle,...>]",
          "- /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>]",
          "- /team list",
          "- /team status <team_id>",
          "- /team channels <team_id>",
          '- /team message <team_id> --from <user|orchestrator|agent_id> --content "<text>" [--channel <#name|@dm:...>] [--to <user|orchestrator|agent_id>]',
          '- /team dm <team_id> --from <user|orchestrator|agent_id> --to <user|orchestrator|agent_id> --content "<text>"',
          "- /team read <team_id> [--channel <name>] [--participant <user|orchestrator|agent_id>] [--after-turn <n>] [--limit <n>]",
          "- /team run <team_id>",
          "- /team prompt <team_id> <instruction>",
          "- /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>]",
          "- /team remove-agent <team_id> <agent_id>",
          "- /team dissolve <team_id>",
        ].join("\n"),
      );
    }

    if (subcommand === "create") {
      const fileArg = parseOption(tokens, "--file");
      if (fileArg) {
        const resolvedManifestPath = path.resolve(baseDir, fileArg);
        let manifest: TeamManifest;
        try {
          manifest = await loadTeamManifestFromFile(resolvedManifestPath);
        } catch (error) {
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
      } catch (error) {
        if (error instanceof TeamManifestError) {
          return usageError(error.message);
        }
        return usageError(error instanceof Error ? error.message : String(error));
      }
    }

    if (subcommand === "update") {
      const teamId = tokens[1]?.trim();
      if (!teamId) {
        return usageError(
          "Usage: /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>]",
        );
      }
      const state = await getTeamState(baseDir, teamId);
      if (!state) {
        return usageError(`Team "${teamId}" not found.`);
      }
      try {
        return await updateTeamFromInlineOptions(baseDir, state, tokens);
      } catch (error) {
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

      const lines = teams.map(
        (team) =>
          `- ${team.team_id} (${team.status}) agents=${Object.keys(team.agents).length} channels=${Object.keys(team.channels).length}`,
      );
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

    if (subcommand === "channels") {
      const teamId = tokens[1]?.trim();
      if (!teamId) {
        return usageError("Usage: /team channels <team_id>");
      }
      const state = await getTeamState(baseDir, teamId);
      if (!state) {
        return usageError(`Team "${teamId}" not found.`);
      }

      const rows = Object.values(state.channels)
        .sort((left, right) =>
          left.channel_name.localeCompare(right.channel_name),
        )
        .map((channel) => {
          const dmParticipants = parseDmChannelParticipants(channel.channel_name);
          const kind = dmParticipants ? "direct" : "public";
          const participants = dmParticipants
            ? ` participants=${dmParticipants.join("<->")}`
            : "";
          return `- ${channel.channel_name} (${kind}) messages=${channel.message_count}${participants}`;
        });

      return info(
        `Channels for team "${teamId}" (${rows.length}):\n${rows.join("\n")}`,
      );
    }

    if (subcommand === "message" || subcommand === "dm") {
      const teamId = tokens[1]?.trim();
      if (!teamId) {
        return usageError(
          subcommand === "dm"
            ? 'Usage: /team dm <team_id> --from <participant> --to <participant> --content "<text>"'
            : 'Usage: /team message <team_id> --from <participant> --content "<text>" [--channel <name>] [--to <participant>]',
        );
      }
      const state = await getTeamState(baseDir, teamId);
      if (!state) {
        return usageError(`Team "${teamId}" not found.`);
      }

      const fromRaw = parseOption(tokens, "--from") ?? "user";
      const toRaw =
        subcommand === "dm"
          ? parseOption(tokens, "--to")
          : parseOption(tokens, "--to");
      const contentRaw = parseOption(tokens, "--content");
      const channelRaw = parseOption(tokens, "--channel");
      if (subcommand === "dm" && !toRaw) {
        return usageError(
          'Usage: /team dm <team_id> --from <participant> --to <participant> --content "<text>"',
        );
      }

      try {
        const posted = await postTeamCommunication(baseDir, state, {
          fromRaw,
          toRaw,
          channelRaw,
          contentRaw,
          defaultFrom: "user",
        });
        return info(
          [
            `Posted message to team "${posted.updated.team_id}".`,
            `Channel: ${posted.channelName} (${posted.visibility})`,
            `Turn: ${posted.turnNumber}`,
          ].join("\n"),
        );
      } catch (error) {
        if (error instanceof TeamManifestError) {
          return usageError(error.message);
        }
        return usageError(error instanceof Error ? error.message : String(error));
      }
    }

    if (subcommand === "read") {
      const teamId = tokens[1]?.trim();
      if (!teamId) {
        return usageError(
          "Usage: /team read <team_id> [--channel <name>] [--participant <user|orchestrator|agent_id>] [--after-turn <n>] [--limit <n>]",
        );
      }
      const state = await getTeamState(baseDir, teamId);
      if (!state) {
        return usageError(`Team "${teamId}" not found.`);
      }

      const channelRaw = parseOption(tokens, "--channel");
      const participantRaw = parseOption(tokens, "--participant");
      const afterTurn = parseOptionalPositiveInt(parseOption(tokens, "--after-turn")) ?? 0;
      const limit = parseOptionalPositiveInt(parseOption(tokens, "--limit")) ?? 40;

      let channelNames: string[] = [];
      if (channelRaw) {
        channelNames = [normalizeChannelName(channelRaw)];
      } else if (participantRaw) {
        const participant = resolveParticipantOrError(
          state,
          participantRaw,
          "--participant",
        );
        if (participant instanceof TeamManifestError) {
          return usageError(participant.message);
        }
        const participantId = String(participant);
        channelNames = Object.keys(state.channels).filter((channelName) => {
          if (!isParticipantAllowedInChannel(state, channelName, participantId)) {
            return false;
          }
          const dmParticipants = parseDmChannelParticipants(channelName);
          if (dmParticipants) {
            return dmParticipants.includes(participantId);
          }
          return true;
        });
      } else {
        channelNames = [resolvePublicChannelName(state)];
      }

      const uniqueChannelNames = Array.from(new Set(channelNames)).filter(
        (channelName) => state.channels[channelName],
      );
      if (uniqueChannelNames.length === 0) {
        return info("No matching channels found.");
      }

      const loaded = await Promise.all(
        uniqueChannelNames.map(async (channelName) => ({
          channelName,
          messages: await readTeamMessagesForChannel(baseDir, state, channelName, {
            afterTurn,
            limit,
          }),
        })),
      );

      const flattened = loaded
        .flatMap((entry) =>
          entry.messages.map((message) => ({
            channelName: entry.channelName,
            message,
          })),
        )
        .sort((left, right) => {
          const leftTime = Date.parse(left.message.timestamp);
          const rightTime = Date.parse(right.message.timestamp);
          const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
          const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
          if (safeLeft !== safeRight) {
            return safeLeft - safeRight;
          }
          return left.message.turn_number - right.message.turn_number;
        })
        .slice(-Math.max(1, Math.min(limit, 500)));

      if (flattened.length === 0) {
        return info("No messages matched the selected filters.");
      }

      const body = flattened
        .map((entry) => formatChannelMessage(entry.message))
        .join("\n\n");
      return info(
        `Read ${flattened.length} message(s) across ${uniqueChannelNames.length} channel(s):\n\n${body}`,
      );
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

      const launchResult = await withSchedulerWorkspaceRoot(baseDir, () =>
        launchTeamAgentTasks(state),
      );
      const launchByAgentId = new Map(
        launchResult.launched.map((entry) => [entry.agent_id, entry]),
      );
      const launchFailureByAgentId = new Map(
        launchResult.failed.map((entry) => [entry.agent_id, entry.error]),
      );
      const immediateConfiguredCount = state.manifest.agents.filter(
        (agent) => (agent.startup ?? "immediate") !== "idle",
      ).length;

      const updated = await upsertTeamState(baseDir, teamId, (current, nowIso) => {
        const existing = current ?? state;
        const nextAgents: TeamState["agents"] = {};
        const manifestAgentById = new Map(
          existing.manifest.agents.map((agent) => [agent.id, agent]),
        );

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
        coordination.waiting_on_agent_ids = launchResult.launched.map(
          (entry) => entry.agent_id,
        );
        coordination.phase =
          launchResult.launched.length > 0 ? "waiting" : "planning";

        return {
          ...existing,
          status: "active",
          started_at: nowIso,
          finished_at: undefined,
          last_error: undefined,
          orchestrator_session_id:
            launchResult.orchestratorSessionId ?? existing.orchestrator_session_id,
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
        lines.push(
          `Task completion messages will route to orchestrator session "${launchResult.orchestratorSessionId}".`,
        );
      }
      if (launchResult.failed.length > 0) {
        lines.push(
          `Launch failures: ${launchResult.failed
            .map((entry) => `${entry.agent_id} (${entry.error})`)
            .join("; ")}`,
        );
      }
      lines.push(
        launchResult.launched.length > 0
          ? "Team kickoff tasks were started in parallel; orchestrator will track results on the next tick."
          : immediateConfiguredCount === 0
            ? "No kickoff tasks were launched because all agents are configured for idle start."
            : "No kickoff tasks were launched. Ensure each immediate-start team member task template id matches the team agent id.",
      );

      return info(
        lines.join("\n"),
      );
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

      const orchestratorSessionId = await resolveOrchestratorSessionId(
        state.orchestrator_session_id,
      );

      const updated = await upsertTeamState(baseDir, teamId, (current, nowIso) => {
        const existing = current ?? state;
        const nextAgents: TeamState["agents"] = {};
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
            ...(existing.manifest.orchestrator?.prompt
              ? {}
              : {
                  orchestrator: {
                    prompt: instruction,
                  },
                }),
          },
          orchestrator_session_id:
            orchestratorSessionId ?? existing.orchestrator_session_id,
          coordination: createRunCoordinationState(nowIso),
          agents: nextAgents,
          last_error: undefined,
        };
      });

      await appendPromptToTeamChannel(baseDir, updated, instruction);

      return info(
        [
          `Prompt accepted for team "${teamId}".`,
          alreadyRunning
            ? "Orchestrator daemon already running."
            : "Orchestrator daemon started.",
          orchestratorSessionId
            ? `Using orchestrator session "${orchestratorSessionId}".`
            : "Orchestrator session id is pending; instruction was persisted and will be picked up.",
          "Team coordination reset to planning; orchestrator will act on the next tick.",
        ].join("\n"),
      );
    }

    if (subcommand === "add-agent") {
      const teamId = tokens[1]?.trim();
      if (!teamId) {
        return usageError(
          "Usage: /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>]",
        );
      }

      const agentId = parseOption(tokens, "--agent-id");
      const sessionId = parseOption(tokens, "--session-id");
      const role = parseOption(tokens, "--role");

      if (!agentId) {
        return usageError(
          "Usage: /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>]",
        );
      }

      const team = await getTeamState(baseDir, teamId);
      if (!team) {
        return usageError(`Team "${teamId}" not found.`);
      }

      const existingAgent = team.agents[agentId];
      const resolvedRole =
        role ??
        existingAgent?.role ??
        team.manifest.agents.find((entry) => entry.id === agentId)?.role ??
        undefined;
      if (!resolvedRole) {
        return usageError(
          `Agent "${agentId}" is not in the manifest. Provide --role to add it.`,
        );
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
          return usageError(
            `Failed to start team agent daemon for "${agentId}" (session "${resolvedSessionId}").`,
          );
        }
      }

      const session = await getSession(resolvedSessionId);
      if (!session) {
        return usageError(`Session "${resolvedSessionId}" not found.`);
      }
      if (session.mode !== "team_agent") {
        return usageError(
          `Session "${resolvedSessionId}" has mode "${session.mode}". Team agents must be registered with mode "team_agent".`,
        );
      }

      const next = await upsertTeamState(baseDir, teamId, (current) => {
        const existing = current ?? team;

        const manifestHasAgent = existing.manifest.agents.some(
          (entry) => entry.id === agentId,
        );

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

      return info(
        `Bound agent "${agentId}" to session "${resolvedSessionId}" in team "${next.team_id}".`,
      );
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

      await Promise.all(
        Object.values(state.channels).map(async (channel) => {
          const resolved = path.resolve(baseDir, channel.path);
          await fs.unlink(resolved).catch((error) => {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError?.code !== "ENOENT") {
              throw error;
            }
          });
        }),
      );
      await Promise.all(
        Object.values(state.agents).map(async (agent) => {
          const sessionId = agent.session_id;
          if (!sessionId) {
            return;
          }
          await stopTeamAgentDaemon(baseDir, sessionId).catch(() => {});
        }),
      );

      const removed = await removeTeamState(baseDir, teamId);
      if (!removed) {
        return usageError(`Failed to dissolve team "${teamId}".`);
      }
      return info(`Team "${teamId}" dissolved and channel files cleaned up.`);
    }

    return usageError(
      "Unknown subcommand. Use /team (or /team open), /team help, /team create --file <manifest.yaml>, /team create --id <team_id> --name <team_name> (--agents <id:role,...> | --agent-tasks <task_id,...>) --channels <#name,...> [--description <text>] [--agent-task-modes <task_id:immediate|idle,...>], /team update <team_id> [--name <team_name>] [--description <text>] [--channels <#name,...>] [--agent-tasks <task_id,...>] [--agent-task-modes <task_id:immediate|idle,...>], /team list, /team status <team_id>, /team channels <team_id>, /team message <team_id> --from <participant> --content <text> [--channel <name>] [--to <participant>], /team dm <team_id> --from <participant> --to <participant> --content <text>, /team read <team_id> [--channel <name>] [--participant <participant>] [--after-turn <n>] [--limit <n>], /team run <team_id>, /team prompt <team_id> <instruction>, /team add-agent <team_id> --agent-id <id> [--session-id <session_id>] [--role <role>], /team remove-agent <team_id> <agent_id>, or /team dissolve <team_id>.",
    );
  },
};
