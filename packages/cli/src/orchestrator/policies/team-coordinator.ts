/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";
import * as process from "node:process";
import {
  getSession,
  getTeamState,
  listTeamStates,
  upsertTeamState,
  type TaskRuntimeProfile,
  type TeamCoordinationState,
  type TeamDelegationState,
  type TeamState,
} from "@qwen-code/qwen-code-core";
import {
  getDefaultTeamAgentSessionId,
  startTeamAgentDaemon,
} from "../../team/agent-daemon.js";
import type { TeamPlannerHints } from "./team-planner.js";

interface TeamMailboxMessage {
  from_task_id?: string;
  job_id?: string;
  status?: "success" | "error";
  timestamp?: string;
  preview?: string;
  return_payload?: string;
  result_file_path?: string;
  output_path?: string;
}

interface ParsedMailboxLine {
  raw: string;
  parsed?: TeamMailboxMessage;
  task_id?: string;
}

interface SessionApiEnvelope {
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface TeamControlResult {
  accepted: boolean;
  reason?: string;
}

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

const TEAM_COORDINATOR_LOG_FILE = path.join(
  ".lowcal",
  "team-orchestrator",
  "logs",
  "actions.jsonl",
);

function createInitialCoordinationState(nowIso: string): TeamCoordinationState {
  return {
    phase: "planning",
    turn_number: 0,
    waiting_on_agent_ids: [],
    last_transition_at: nowIso,
    last_updated_at: nowIso,
    delegations: {},
  };
}

function normalizeCoordinationState(
  state: TeamState,
  nowIso: string,
): TeamCoordinationState {
  if (!state.coordination) {
    return createInitialCoordinationState(nowIso);
  }
  return {
    ...state.coordination,
    waiting_on_agent_ids: [...state.coordination.waiting_on_agent_ids],
    delegations: { ...state.coordination.delegations },
  };
}

function getMailboxPath(baseDir: string, sessionId: string): string {
  return path.join(baseDir, ".lowcal", "session-messages", `${sessionId}.jsonl`);
}

function resolveTaskId(message: TeamMailboxMessage | undefined): string | undefined {
  if (!message) {
    return undefined;
  }
  if (
    typeof message.from_task_id === "string" &&
    message.from_task_id.trim().length > 0
  ) {
    return message.from_task_id.trim();
  }
  if (typeof message.job_id === "string" && message.job_id.trim().length > 0) {
    return message.job_id.trim();
  }
  return undefined;
}

function extractSummary(message: TeamMailboxMessage | undefined): string {
  const candidates = [
    message?.return_payload,
    message?.preview,
    message?.result_file_path,
    message?.output_path,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().replace(/\s+/g, " ").slice(0, 1000);
    }
  }
  return "No preview available.";
}

function parseMailboxLine(line: string): ParsedMailboxLine {
  const trimmed = line.trim();
  if (!trimmed) {
    return { raw: line };
  }
  try {
    const parsed = JSON.parse(trimmed) as TeamMailboxMessage;
    return {
      raw: line,
      parsed,
      task_id: resolveTaskId(parsed),
    };
  } catch {
    return { raw: line };
  }
}

async function readMailboxLines(mailboxPath: string): Promise<ParsedMailboxLine[]> {
  try {
    const raw = await fs.readFile(mailboxPath, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => parseMailboxLine(line));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeMailboxLines(
  mailboxPath: string,
  lines: ParsedMailboxLine[],
): Promise<void> {
  if (lines.length === 0) {
    await fs.unlink(mailboxPath).catch((error) => {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code !== "ENOENT") {
        throw error;
      }
    });
    return;
  }

  await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
  await fs.writeFile(
    mailboxPath,
    `${lines.map((line) => line.raw.trim()).join("\n")}\n`,
    "utf-8",
  );
}

function parseTeamControlResult(value: unknown): TeamControlResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const accepted = record["accepted"];
  if (typeof accepted !== "boolean") {
    return null;
  }
  return {
    accepted,
    reason: typeof record["reason"] === "string" ? record["reason"] : undefined,
  };
}

async function callUnixSessionApi(
  socketPath: string,
  method: string,
  authToken?: string,
  params?: Record<string, unknown>,
): Promise<SessionApiEnvelope | null> {
  return await new Promise<SessionApiEnvelope | null>((resolve) => {
    const request = {
      id: `team-coordinator-${Date.now()}`,
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

    const finish = (value: SessionApiEnvelope | null) => {
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

    socket.on("data", (chunk: Buffer | string) => {
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
        finish(JSON.parse(line) as SessionApiEnvelope);
      } catch {
        finish(null);
      }
    });

    socket.on("error", () => finish(null));
    socket.on("end", () => finish(null));
    socket.on("close", () => finish(null));
  });
}

function parseFallbackAgentId(taskId: string, teamId: string): string | undefined {
  const prefix = `team-${teamId}-`;
  if (!taskId.startsWith(prefix)) {
    return undefined;
  }
  const remainder = taskId.slice(prefix.length);
  const lastHyphen = remainder.lastIndexOf("-");
  if (lastHyphen <= 0) {
    return undefined;
  }
  const maybeTimestamp = remainder.slice(lastHyphen + 1);
  if (!/^\d+$/.test(maybeTimestamp)) {
    return undefined;
  }
  const agentId = remainder.slice(0, lastHyphen);
  return agentId.length > 0 ? agentId : undefined;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function buildDelegationPrompt(
  team: TeamState,
  agentId: string,
  role: string,
  taskDescription: string,
): string {
  const manifestAgent = team.manifest.agents.find((entry) => entry.id === agentId);
  const objective =
    team.manifest.description?.trim() ||
    `Contribute your role-specific output for team "${team.name}".`;
  const sharedContext = (team.manifest.shared_context ?? [])
    .map((entry) => {
      if (entry.type === "file") {
        return `- shared file: ${entry.path} (read_only=${entry.read_only})`;
      }
      return `- shared variable: ${entry.name}=${entry.value}`;
    })
    .join("\n");

  const parts = [
    `You are persistent team agent "${agentId}" with role "${role}" in team "${team.team_id}".`,
    `Team objective: ${objective}`,
    `Assigned task: ${taskDescription}`,
  ];
  if (manifestAgent?.instructions && manifestAgent.instructions.trim().length > 0) {
    parts.push(`Agent instructions:\n${manifestAgent.instructions.trim()}`);
  }
  if (sharedContext.length > 0) {
    parts.push(`Shared context:\n${sharedContext}`);
  }
  parts.push(
    "Respond with concise, actionable output and mention any artifacts or files you produced.",
  );
  return parts.join("\n\n");
}

function isTerminalDelegation(status: TeamDelegationState["status"]): boolean {
  return status === "completed" || status === "failed";
}

function resolveResultChannelName(team: TeamState): string | undefined {
  if (team.channels["#general"]) {
    return "#general";
  }
  const names = Object.keys(team.channels);
  return names.length > 0 ? names[0] : undefined;
}

async function appendResultToChannel(
  baseDir: string,
  team: TeamState,
  coordination: TeamCoordinationState,
  nowIso: string,
  payload: {
    agentId: string;
    taskId: string;
    status: "success" | "error";
    summary: string;
    outputPath?: string;
    timestamp?: string;
  },
): Promise<boolean> {
  const channelName = resolveResultChannelName(team);
  if (!channelName) {
    return false;
  }
  const channel = team.channels[channelName];
  if (!channel) {
    return false;
  }

  const turnNumber = Math.max(0, channel.message_count) + 1;
  const timestamp = payload.timestamp ?? nowIso;
  const channelPath = path.isAbsolute(channel.path)
    ? channel.path
    : path.resolve(baseDir, channel.path);

  const parts = [
    `Delegation result from "${payload.agentId}" (${payload.status})`,
    payload.summary,
  ];
  if (payload.outputPath) {
    parts.push(`Output: ${payload.outputPath}`);
  }
  const text = parts.join("\n\n");

  const message = {
    channel: channelName,
    from_agent: "orchestrator",
    turn_number: turnNumber,
    timestamp,
    message_type: payload.status === "success" ? "result" : "clarification",
    content: {
      text,
    },
    metadata: {
      team_id: team.team_id,
      agent_id: payload.agentId,
      task_id: payload.taskId,
    },
  };

  await fs.mkdir(path.dirname(channelPath), { recursive: true });
  await fs.appendFile(channelPath, `${JSON.stringify(message)}\n`, "utf-8");

  team.channels = {
    ...team.channels,
    [channelName]: {
      ...channel,
      message_count: turnNumber,
      last_message_at: timestamp,
    },
  };

  coordination.turn_number = Math.max(coordination.turn_number, turnNumber);
  return true;
}

async function appendCoordinatorActionLog(
  baseDir: string,
  record: TeamCoordinatorActionRecord,
): Promise<void> {
  const actionLogPath = path.join(baseDir, TEAM_COORDINATOR_LOG_FILE);
  await fs.mkdir(path.dirname(actionLogPath), { recursive: true });
  await fs.appendFile(actionLogPath, `${JSON.stringify(record)}\n`, "utf-8");
}

async function ensureAgentSessionHealth(
  baseDir: string,
  team: TeamState,
  coordination: TeamCoordinationState,
): Promise<{
  changed: boolean;
  activeBoundAgents: number;
  restartAttempts: number;
  restartSuccesses: number;
}> {
  let changed = false;
  let activeBoundAgents = 0;
  let restartAttempts = 0;
  let restartSuccesses = 0;
  const nextAgents = { ...team.agents };
  const runningAgents = new Set(
    Object.values(coordination.delegations)
      .filter((delegation) => !isTerminalDelegation(delegation.status))
      .map((delegation) => delegation.agent_id),
  );

  for (const agent of Object.values(nextAgents)) {
    const manifestAgent = team.manifest.agents.find(
      (entry) => entry.id === agent.agent_id,
    );
    const resolvedRole = agent.role || manifestAgent?.role || "team-member";
    let sessionId =
      agent.session_id || getDefaultTeamAgentSessionId(team.team_id, agent.agent_id);
    let session = await getSession(sessionId);
    const hasLiveTeamAgentSession =
      Boolean(
        session &&
          session.mode === "team_agent" &&
          Number.isFinite(session.pid) &&
          isProcessAlive(session.pid),
      ) === true;

    if (!hasLiveTeamAgentSession) {
      restartAttempts += 1;
      let restartSessionId = sessionId;
      if (session && session.mode !== "team_agent") {
        restartSessionId = getDefaultTeamAgentSessionId(team.team_id, agent.agent_id);
        if (restartSessionId === sessionId) {
          restartSessionId = `${restartSessionId}-agent`;
        }
      }

      const started = await startTeamAgentDaemon({
        baseDir,
        sessionId: restartSessionId,
        teamId: team.team_id,
        agentId: agent.agent_id,
        role: resolvedRole,
        model: manifestAgent?.model,
        instructions: manifestAgent?.instructions,
      });
      if (started) {
        restartSuccesses += 1;
        sessionId = restartSessionId;
        session = await getSession(restartSessionId);
      } else {
        if (
          agent.status !== "failed" ||
          !agent.last_error?.includes("failed to restart team agent daemon")
        ) {
          nextAgents[agent.agent_id] = {
            ...agent,
            session_id: restartSessionId,
            status: "failed",
            last_error: `failed to restart team agent daemon for session "${restartSessionId}"`,
          };
          changed = true;
        }
        continue;
      }
    }

    if (!session) {
      if (agent.status !== "failed" || agent.last_error !== "bound session not found") {
        nextAgents[agent.agent_id] = {
          ...agent,
          session_id: sessionId,
          status: "failed",
          last_error: "bound session not found",
        };
        changed = true;
      }
      continue;
    }

    if (session.mode !== "team_agent") {
      const errorMessage = `bound session mode "${session.mode}" is not allowed for team agents`;
      if (agent.status !== "failed" || agent.last_error !== errorMessage) {
        nextAgents[agent.agent_id] = {
          ...agent,
          session_id: sessionId,
          status: "failed",
          last_error: errorMessage,
        };
        changed = true;
      }
      continue;
    }

    activeBoundAgents += 1;
    const desiredStatus = runningAgents.has(agent.agent_id) ? "working" : "idle";
    if (
      agent.status !== desiredStatus ||
      agent.last_error !== undefined ||
      agent.session_id !== sessionId
    ) {
      nextAgents[agent.agent_id] = {
        ...agent,
        session_id: sessionId,
        status: desiredStatus,
        last_error: undefined,
      };
      changed = true;
    }
  }

  if (changed) {
    team.agents = nextAgents;
  }

  return { changed, activeBoundAgents, restartAttempts, restartSuccesses };
}

async function delegatePlanningTask(
  baseDir: string,
  orchestratorSessionId: string,
  team: TeamState,
  coordination: TeamCoordinationState,
  agentId: string,
  nowIso: string,
): Promise<{ dispatched: boolean; taskId?: string; error?: string }> {
  const agent = team.agents[agentId];
  if (!agent?.session_id) {
    return { dispatched: false, error: "missing agent session_id" };
  }

  const session = await getSession(agent.session_id);
  if (!session || session.mode !== "team_agent") {
    return { dispatched: false, error: "agent session is unavailable" };
  }
  if (!session.api || session.api.transport !== "unix") {
    return { dispatched: false, error: "agent session API transport is unavailable" };
  }

  const taskDescription = team.manifest.description?.trim().length
    ? `${team.manifest.description?.trim()} (focus on role: ${agent.role})`
    : `Provide your role-based contribution for "${team.name}"`;
  const actionValue = buildDelegationPrompt(team, agentId, agent.role, taskDescription);
  const taskId = `team-${team.team_id}-${agentId}-${Date.now()}`;
  const agentSpec = team.manifest.agents.find((entry) => entry.id === agentId);
  const runtimeProfile: TaskRuntimeProfile = {
    ...(agentSpec?.model ? { model: { name: agentSpec.model } } : {}),
    run: { returnToSession: orchestratorSessionId },
  };

  const response = await callUnixSessionApi(
    session.api.address,
    "session.enqueue_task",
    session.api.auth_token,
    {
      task_id: taskId,
      action_type: "prompt",
      action_value: actionValue,
      description: `Auto-delegated planning task for ${team.team_id}/${agentId}`,
      source_session_id: orchestratorSessionId,
      return_to_session_id: orchestratorSessionId,
      runtime_profile: runtimeProfile,
    },
  );

  if (!response || response.ok !== true) {
    return {
      dispatched: false,
      error: `agent enqueue failed: ${response?.error ?? "api_unreachable"}`,
    };
  }
  const control = parseTeamControlResult(response.result);
  if (!control?.accepted) {
    return {
      dispatched: false,
      error: `agent rejected delegation: ${control?.reason ?? "rejected"}`,
    };
  }

  coordination.delegations[taskId] = {
    task_id: taskId,
    agent_id: agentId,
    delegated_at: nowIso,
    status: "running",
    task_description: taskDescription,
  };
  team.agents = {
    ...team.agents,
    [agentId]: {
      ...agent,
      status: "working",
      last_turn_at: nowIso,
      last_error: undefined,
    },
  };

  return { dispatched: true, taskId };
}

async function appendSynthesisSummaryToChannel(
  baseDir: string,
  team: TeamState,
  coordination: TeamCoordinationState,
  nowIso: string,
): Promise<boolean> {
  const completedDelegations = Object.values(coordination.delegations).filter(
    (delegation) => delegation.status === "completed",
  );
  if (completedDelegations.length === 0) {
    return false;
  }
  const summaryLines = completedDelegations.map((delegation) => {
    const summary = delegation.result_summary?.trim() || "No summary available.";
    const artifact = delegation.output_path ? ` output=${delegation.output_path}` : "";
    return `- ${delegation.agent_id}: ${summary}${artifact}`;
  });

  return await appendResultToChannel(baseDir, team, coordination, nowIso, {
    agentId: "team",
    taskId: `synthesis-${team.team_id}-${Date.now()}`,
    status: "success",
    summary: `Synthesis complete for team "${team.team_id}".\n${summaryLines.join("\n")}`,
    timestamp: nowIso,
  });
}

function setPhase(
  coordination: TeamCoordinationState,
  nowIso: string,
  nextPhase: TeamCoordinationState["phase"],
): boolean {
  if (coordination.phase === nextPhase) {
    return false;
  }
  coordination.phase = nextPhase;
  coordination.last_transition_at = nowIso;
  return true;
}

export async function runTeamCoordinatorPolicy(
  params: RunTeamCoordinatorPolicyParams,
): Promise<TeamCoordinatorResult> {
  const { baseDir, orchestratorSessionId } = params;
  const metrics: TeamCoordinatorMetrics = {
    teams_scanned: 0,
    teams_updated: 0,
    messages_consumed: 0,
    delegations_dispatched: 0,
    delegations_completed: 0,
    delegations_failed: 0,
    agent_restart_attempts: 0,
    agent_restart_successes: 0,
    phase_transitions: 0,
  };

  let lastAction: TeamCoordinatorActionRecord | undefined;
  const teams = await listTeamStates(baseDir, { statuses: ["active"], limit: 500 });
  if (teams.length === 0) {
    return { metrics };
  }

  const mailboxPath = getMailboxPath(baseDir, orchestratorSessionId);
  const mailbox = await readMailboxLines(mailboxPath);
  const consumedIndexes = new Set<number>();

  for (const listedTeam of teams) {
    metrics.teams_scanned += 1;
    const latestTeam = (await getTeamState(baseDir, listedTeam.team_id)) ?? listedTeam;
    const nowIso = new Date().toISOString();
    let changed = false;

    const nextTeam: TeamState = {
      ...latestTeam,
      agents: { ...latestTeam.agents },
      channels: { ...latestTeam.channels },
    };

    if (nextTeam.orchestrator_session_id !== orchestratorSessionId) {
      nextTeam.orchestrator_session_id = orchestratorSessionId;
      changed = true;
    }

    const coordination = normalizeCoordinationState(nextTeam, nowIso);
    if (!nextTeam.coordination) {
      nextTeam.coordination = coordination;
      changed = true;
    }

    const healthCheck = await ensureAgentSessionHealth(
      baseDir,
      nextTeam,
      coordination,
    );
    if (healthCheck.changed) {
      changed = true;
    }
    metrics.agent_restart_attempts += healthCheck.restartAttempts;
    metrics.agent_restart_successes += healthCheck.restartSuccesses;

    let phaseTransitionsForTeam = 0;
    const transitionPhase = (phase: TeamCoordinationState["phase"]) => {
      if (setPhase(coordination, nowIso, phase)) {
        phaseTransitionsForTeam += 1;
        changed = true;
      }
    };

    const waitingOn = new Set<string>();
    for (const delegation of Object.values(coordination.delegations)) {
      if (!isTerminalDelegation(delegation.status)) {
        waitingOn.add(delegation.agent_id);
      }
    }

    let teamConsumedMessages = 0;
    for (let index = 0; index < mailbox.length; index += 1) {
      if (consumedIndexes.has(index)) {
        continue;
      }
      const entry = mailbox[index];
      if (!entry?.task_id) {
        continue;
      }

      let delegation = coordination.delegations[entry.task_id];
      let agentId = delegation?.agent_id;
      if (!agentId) {
        const fallback = parseFallbackAgentId(entry.task_id, nextTeam.team_id);
        if (fallback && nextTeam.agents[fallback]) {
          agentId = fallback;
          delegation = {
            task_id: entry.task_id,
            agent_id: fallback,
            delegated_at: entry.parsed?.timestamp ?? nowIso,
            status: "running",
            task_description: "Recovered from mailbox result",
          };
          coordination.delegations[entry.task_id] = delegation;
          changed = true;
        }
      }

      if (!agentId || !delegation) {
        continue;
      }

      consumedIndexes.add(index);
      metrics.messages_consumed += 1;
      teamConsumedMessages += 1;
      const isSuccess = entry.parsed?.status === "success";
      const completedAt = entry.parsed?.timestamp ?? nowIso;
      const summary = extractSummary(entry.parsed);
      const outputPath =
        typeof entry.parsed?.output_path === "string" ? entry.parsed.output_path : undefined;
      const resultFilePath =
        typeof entry.parsed?.result_file_path === "string"
          ? entry.parsed.result_file_path
          : undefined;
      const artifactPath = outputPath ?? resultFilePath;

      coordination.delegations[entry.task_id] = {
        ...delegation,
        status: isSuccess ? "completed" : "failed",
        completed_at: completedAt,
        result_summary: summary,
        output_path: artifactPath,
        last_error: isSuccess ? undefined : summary,
      };

      const currentAgent = nextTeam.agents[agentId];
      if (currentAgent) {
        nextTeam.agents = {
          ...nextTeam.agents,
          [agentId]: {
            ...currentAgent,
            status: isSuccess ? "completed" : "failed",
            last_turn_at: completedAt,
            result_summary: summary,
            last_error: isSuccess ? undefined : summary,
          },
        };
      }

      waitingOn.delete(agentId);
      changed = true;
      if (isSuccess) {
        metrics.delegations_completed += 1;
      } else {
        metrics.delegations_failed += 1;
      }

      await appendResultToChannel(baseDir, nextTeam, coordination, nowIso, {
        agentId,
        taskId: entry.task_id,
        status: isSuccess ? "success" : "error",
        summary,
        outputPath: artifactPath,
        timestamp: completedAt,
      });
    }

    let activeDelegations = Object.values(coordination.delegations).filter(
      (delegation) => !isTerminalDelegation(delegation.status),
    );

    let delegatedPlanningTasks = 0;
    const plannerHint = params.plannerHints?.by_team_id[nextTeam.team_id];
    if (
      activeDelegations.length === 0 &&
      Object.keys(coordination.delegations).length === 0 &&
      (coordination.phase === "planning" ||
        coordination.phase === "idle" ||
        coordination.phase === "delegating")
    ) {
      if (plannerHint?.strategy === "hold") {
        transitionPhase("planning");
      } else {
      transitionPhase("delegating");
      const candidateAgents = Object.values(nextTeam.agents).filter(
        (agent) =>
          Boolean(agent.session_id) &&
          agent.status !== "failed" &&
          (agent.status === "idle" || agent.status === "pending"),
      );
      let filteredCandidates = candidateAgents;
      if (
        plannerHint?.strategy === "delegate_subset" &&
        plannerHint.target_agent_ids.length > 0
      ) {
        const allowed = new Set(plannerHint.target_agent_ids);
        filteredCandidates = filteredCandidates.filter((agent) =>
          allowed.has(agent.agent_id),
        );
      }
      if (plannerHint?.preferred_agent_order.length) {
        const orderIndex = new Map(
          plannerHint.preferred_agent_order.map((agentId, index) => [
            agentId,
            index,
          ]),
        );
        filteredCandidates = [...filteredCandidates].sort((left, right) => {
          const leftOrder = orderIndex.get(left.agent_id) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder =
            orderIndex.get(right.agent_id) ?? Number.MAX_SAFE_INTEGER;
          if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
          }
          return left.agent_id.localeCompare(right.agent_id);
        });
      }
      if (
        typeof plannerHint?.max_delegations === "number" &&
        Number.isFinite(plannerHint.max_delegations) &&
        plannerHint.max_delegations > 0
      ) {
        filteredCandidates = filteredCandidates.slice(
          0,
          Math.floor(plannerHint.max_delegations),
        );
      }

      for (const agent of filteredCandidates) {
        const outcome = await delegatePlanningTask(
          baseDir,
          orchestratorSessionId,
          nextTeam,
          coordination,
          agent.agent_id,
          nowIso,
        );
        if (outcome.dispatched) {
          delegatedPlanningTasks += 1;
          metrics.delegations_dispatched += 1;
          changed = true;
          waitingOn.add(agent.agent_id);
          continue;
        }
        if (outcome.error) {
          nextTeam.agents = {
            ...nextTeam.agents,
            [agent.agent_id]: {
              ...agent,
              status: "failed",
              last_error: outcome.error,
            },
          };
          changed = true;
        }
      }
      }
    }

    activeDelegations = Object.values(coordination.delegations).filter(
      (delegation) => !isTerminalDelegation(delegation.status),
    );
    for (const delegation of activeDelegations) {
      waitingOn.add(delegation.agent_id);
    }
    coordination.waiting_on_agent_ids = Array.from(waitingOn);

    if (activeDelegations.length > 0) {
      transitionPhase("waiting");
    } else if (teamConsumedMessages > 0) {
      transitionPhase("synthesizing");
    } else if (coordination.phase === "synthesizing") {
      const wroteSummary = await appendSynthesisSummaryToChannel(
        baseDir,
        nextTeam,
        coordination,
        nowIso,
      );
      if (wroteSummary) {
        changed = true;
      }
      transitionPhase("done");
      if (nextTeam.status !== "completed") {
        nextTeam.status = "completed";
        nextTeam.finished_at = nowIso;
        changed = true;
      }
    } else if (Object.keys(coordination.delegations).length === 0) {
      transitionPhase("planning");
    }

    metrics.phase_transitions += phaseTransitionsForTeam;

    coordination.last_updated_at = nowIso;
    nextTeam.coordination = coordination;

    if (!changed) {
      continue;
    }

    await upsertTeamState(baseDir, nextTeam.team_id, () => nextTeam);
    metrics.teams_updated += 1;

    const action: TeamCoordinatorActionRecord = {
      timestamp: nowIso,
      policy_id: "coordinate_team",
      team_id: nextTeam.team_id,
      phase: coordination.phase,
      outcome:
        teamConsumedMessages > 0
          ? "ingested_agent_results"
          : delegatedPlanningTasks > 0
            ? "delegated_planning_tasks"
            : healthCheck.restartSuccesses > 0
              ? "restarted_team_agents"
          : healthCheck.activeBoundAgents > 0
            ? "heartbeat_coordination_refresh"
            : "awaiting_agent_binding",
      consumed_messages: teamConsumedMessages,
    };
    lastAction = action;
    await appendCoordinatorActionLog(baseDir, action);
  }

  if (consumedIndexes.size > 0) {
    const remaining = mailbox.filter((_entry, index) => !consumedIndexes.has(index));
    await writeMailboxLines(mailboxPath, remaining);
  }

  return {
    metrics,
    last_action: lastAction,
  };
}
