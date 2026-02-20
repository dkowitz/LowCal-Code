/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
  getTeamState,
  upsertTeamState,
  type SessionRecord,
} from "@qwen-code/qwen-code-core";
import { runTeamCoordinatorPolicy } from "./team-coordinator.js";

const hoisted = vi.hoisted(() => ({
  sessions: new Map<string, SessionRecord>(),
  getSessionMock: vi.fn<(sessionId: string) => Promise<SessionRecord | null>>(),
  startTeamAgentDaemonMock: vi.fn<
    (options: {
      baseDir: string;
      sessionId: string;
      teamId: string;
      agentId: string;
      role: string;
      model?: string;
      instructions?: string;
    }) => Promise<boolean>
  >(),
}));

vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qwen-code/qwen-code-core")>();
  return {
    ...actual,
    getSession: hoisted.getSessionMock,
  };
});

vi.mock("../../team/agent-daemon.js", () => ({
  getDefaultTeamAgentSessionId: (teamId: string, agentId: string) =>
    `team-agent-${teamId}-${agentId}`,
  startTeamAgentDaemon: hoisted.startTeamAgentDaemonMock,
}));

describe("team-coordinator policy", () => {
  let tempRootDir = "";

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-coordinator-"));
    hoisted.sessions.clear();
    hoisted.getSessionMock.mockReset();
    hoisted.startTeamAgentDaemonMock.mockReset();
    hoisted.getSessionMock.mockImplementation(async (sessionId: string) => {
      return hoisted.sessions.get(sessionId) ?? null;
    });
    hoisted.startTeamAgentDaemonMock.mockResolvedValue(false);
  });

  afterEach(async () => {
    if (tempRootDir) {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  async function createSession(
    session: Pick<SessionRecord, "id" | "mode">,
  ): Promise<void> {
    hoisted.sessions.set(session.id, {
      id: session.id,
      pid: process.pid,
      mode: session.mode,
      cwd: tempRootDir,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: "idle",
    });
  }

  it("consumes delegated task mailbox results and updates team state", async () => {
    const teamId = "team-alpha";
    const agentId = "agent-a";
    const taskId = `team-${teamId}-${agentId}-123`;
    await createSession({ id: "agent-session-a", mode: "team_agent" });

    await upsertTeamState(tempRootDir, teamId, (_current, nowIso) => ({
      team_id: teamId,
      name: "Team Alpha",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: teamId,
        name: "Team Alpha",
        agents: [{ id: agentId, role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        [agentId]: {
          agent_id: agentId,
          session_id: "agent-session-a",
          role: "researcher",
          status: "working",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: `.lowcal/team-channels/${teamId}-general.jsonl`,
        },
      },
      coordination: {
        phase: "waiting",
        turn_number: 1,
        waiting_on_agent_ids: [agentId],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {
          [taskId]: {
            task_id: taskId,
            agent_id: agentId,
            delegated_at: nowIso,
            status: "running",
            task_description: "Collect sources",
          },
        },
      },
    }));

    const mailboxPath = path.join(
      tempRootDir,
      ".lowcal",
      "session-messages",
      "orch-1.jsonl",
    );
    await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
    await fs.writeFile(
      mailboxPath,
      `${JSON.stringify({
        from_task_id: taskId,
        status: "success",
        timestamp: new Date().toISOString(),
        preview: "Found 8 relevant sources and summarized them.",
      })}\n`,
      "utf-8",
    );

    const result = await runTeamCoordinatorPolicy({
      baseDir: tempRootDir,
      orchestratorSessionId: "orch-1",
    });

    expect(result.metrics.messages_consumed).toBe(1);
    expect(result.metrics.delegations_completed).toBe(1);

    const updated = await getTeamState(tempRootDir, teamId);
    expect(updated?.orchestrator_session_id).toBe("orch-1");
    expect(updated?.agents[agentId]?.status).toBe("completed");
    expect(updated?.coordination?.delegations[taskId]?.status).toBe("completed");
    expect(updated?.coordination?.phase).toBe("synthesizing");
    expect(updated?.channels["#general"]?.message_count).toBe(1);

    const channelPath = path.join(
      tempRootDir,
      ".lowcal",
      "team-channels",
      `${teamId}-general.jsonl`,
    );
    const channelContent = await fs.readFile(channelPath, "utf-8");
    expect(channelContent).toContain("Delegation result from");

    await expect(fs.readFile(mailboxPath, "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("proactively delegates from planning phase to idle agents", async () => {
    const teamId = "team-auto";
    const agentId = "agent-auto";
    const socketPath = path.join(tempRootDir, "agent-auto.sock");
    const server = net.createServer((socket) => {
      socket.on("data", () => {
        socket.write(
          `${JSON.stringify({
            ok: true,
            result: { accepted: true, action_id: "action-auto-1" },
          })}\n`,
        );
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => resolve());
    });

    hoisted.sessions.set("agent-session-auto", {
      id: "agent-session-auto",
      pid: process.pid,
      mode: "team_agent",
      cwd: tempRootDir,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: "idle",
      api: {
        transport: "unix",
        address: socketPath,
        version: "v1",
      },
    });

    await upsertTeamState(tempRootDir, teamId, (_current, nowIso) => ({
      team_id: teamId,
      name: "Team Auto",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: teamId,
        name: "Team Auto",
        description: "Generate initial analysis artifacts.",
        agents: [{ id: agentId, role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        [agentId]: {
          agent_id: agentId,
          session_id: "agent-session-auto",
          role: "researcher",
          status: "idle",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: `.lowcal/team-channels/${teamId}-general.jsonl`,
        },
      },
      coordination: {
        phase: "planning",
        turn_number: 0,
        waiting_on_agent_ids: [],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {},
      },
    }));

    const result = await runTeamCoordinatorPolicy({
      baseDir: tempRootDir,
      orchestratorSessionId: "orch-auto",
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(result.metrics.delegations_dispatched).toBe(1);
    const updated = await getTeamState(tempRootDir, teamId);
    expect(updated?.coordination?.phase).toBe("waiting");
    expect(updated?.agents[agentId]?.status).toBe("working");
    expect(Object.keys(updated?.coordination?.delegations ?? {})).toHaveLength(1);
  });

  it("restarts missing agent sessions and rebinds persistent team_agent", async () => {
    const teamId = "team-beta";
    const agentId = "agent-b";
    hoisted.startTeamAgentDaemonMock.mockImplementation(async (options) => {
      hoisted.sessions.set(options.sessionId, {
        id: options.sessionId,
        pid: process.pid,
        mode: "team_agent",
        cwd: tempRootDir,
        started_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        status: "idle",
      });
      return true;
    });

    await upsertTeamState(tempRootDir, teamId, (_current, nowIso) => ({
      team_id: teamId,
      name: "Team Beta",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: teamId,
        name: "Team Beta",
        agents: [{ id: agentId, role: "analyst" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        [agentId]: {
          agent_id: agentId,
          role: "analyst",
          status: "pending",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: `.lowcal/team-channels/${teamId}-general.jsonl`,
        },
      },
      coordination: {
        phase: "done",
        turn_number: 1,
        waiting_on_agent_ids: [],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {
          [`team-${teamId}-${agentId}-seed`]: {
            task_id: `team-${teamId}-${agentId}-seed`,
            agent_id: agentId,
            delegated_at: nowIso,
            completed_at: nowIso,
            status: "completed",
            task_description: "seed",
            result_summary: "seed",
          },
        },
      },
    }));

    await runTeamCoordinatorPolicy({
      baseDir: tempRootDir,
      orchestratorSessionId: "orch-2",
    });

    const updated = await getTeamState(tempRootDir, teamId);
    expect(hoisted.startTeamAgentDaemonMock).toHaveBeenCalled();
    expect(updated?.agents[agentId]?.session_id).toBe("team-agent-team-beta-agent-b");
    expect(updated?.agents[agentId]?.status).toBe("idle");
    expect(updated?.agents[agentId]?.last_error).toBeUndefined();
  });

  it("delegates only immediate-start agents in deterministic fallback mode", async () => {
    const teamId = "team-startup";
    const immediateAgent = "agent-now";
    const idleAgent = "agent-later";
    const socketNow = path.join(tempRootDir, "agent-now.sock");
    const socketLater = path.join(tempRootDir, "agent-later.sock");
    const accepted = JSON.stringify({
      ok: true,
      result: { accepted: true, action_id: "action-startup" },
    });
    const serverNow = net.createServer((socket) => {
      socket.on("data", () => socket.write(`${accepted}\n`));
    });
    const serverLater = net.createServer((socket) => {
      socket.on("data", () => socket.write(`${accepted}\n`));
    });
    await new Promise<void>((resolve, reject) => {
      serverNow.once("error", reject);
      serverNow.listen(socketNow, () => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      serverLater.once("error", reject);
      serverLater.listen(socketLater, () => resolve());
    });

    hoisted.sessions.set("agent-session-now", {
      id: "agent-session-now",
      pid: process.pid,
      mode: "team_agent",
      cwd: tempRootDir,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: "idle",
      api: {
        transport: "unix",
        address: socketNow,
        version: "v1",
      },
    });
    hoisted.sessions.set("agent-session-later", {
      id: "agent-session-later",
      pid: process.pid,
      mode: "team_agent",
      cwd: tempRootDir,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: "idle",
      api: {
        transport: "unix",
        address: socketLater,
        version: "v1",
      },
    });

    await upsertTeamState(tempRootDir, teamId, (_current, nowIso) => ({
      team_id: teamId,
      name: "Team Startup",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: teamId,
        name: "Team Startup",
        description: "Produce the first draft.",
        agents: [
          { id: immediateAgent, role: "researcher", startup: "immediate" },
          { id: idleAgent, role: "coder", startup: "idle" },
        ],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        [immediateAgent]: {
          agent_id: immediateAgent,
          session_id: "agent-session-now",
          role: "researcher",
          status: "idle",
        },
        [idleAgent]: {
          agent_id: idleAgent,
          session_id: "agent-session-later",
          role: "coder",
          status: "idle",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: `.lowcal/team-channels/${teamId}-general.jsonl`,
        },
      },
      coordination: {
        phase: "planning",
        turn_number: 0,
        waiting_on_agent_ids: [],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {},
      },
    }));

    const result = await runTeamCoordinatorPolicy({
      baseDir: tempRootDir,
      orchestratorSessionId: "orch-startup",
    });

    await new Promise<void>((resolve) => serverNow.close(() => resolve()));
    await new Promise<void>((resolve) => serverLater.close(() => resolve()));

    expect(result.metrics.delegations_dispatched).toBe(1);
    const updated = await getTeamState(tempRootDir, teamId);
    const delegations = Object.values(updated?.coordination?.delegations ?? {});
    expect(delegations).toHaveLength(1);
    expect(delegations[0]?.agent_id).toBe(immediateAgent);
  });

  it("fails long-running delegations when timeout_minutes is exceeded", async () => {
    const teamId = "team-timeout";
    const agentId = "agent-timeout";
    const pastIso = new Date(Date.now() - 20 * 60_000).toISOString();
    await createSession({ id: "agent-session-timeout", mode: "team_agent" });

    await upsertTeamState(tempRootDir, teamId, (_current, nowIso) => ({
      team_id: teamId,
      name: "Team Timeout",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: teamId,
        name: "Team Timeout",
        agents: [{ id: agentId, role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
        execution: {
          timeout_minutes: 1,
        },
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        [agentId]: {
          agent_id: agentId,
          session_id: "agent-session-timeout",
          role: "researcher",
          status: "working",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: `.lowcal/team-channels/${teamId}-general.jsonl`,
        },
      },
      coordination: {
        phase: "waiting",
        turn_number: 1,
        waiting_on_agent_ids: [agentId],
        last_transition_at: nowIso,
        last_updated_at: nowIso,
        delegations: {
          [`team-${teamId}-${agentId}-long`]: {
            task_id: `team-${teamId}-${agentId}-long`,
            agent_id: agentId,
            delegated_at: pastIso,
            status: "running",
            task_description: "Long running task",
          },
        },
      },
    }));

    const result = await runTeamCoordinatorPolicy({
      baseDir: tempRootDir,
      orchestratorSessionId: "orch-timeout",
    });

    expect(result.metrics.delegations_failed).toBe(1);
    const updated = await getTeamState(tempRootDir, teamId);
    const delegation = Object.values(updated?.coordination?.delegations ?? {})[0];
    expect(delegation?.status).toBe("failed");
    expect(delegation?.result_summary).toContain("timed out");
  });
});
