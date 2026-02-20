/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import type { CommandContext } from "./types.js";
import { teamCommand } from "./teamCommand.js";
import type {
  SessionRecord,
  TeamManifest,
  TeamState,
} from "@qwen-code/qwen-code-core";

const hoisted = vi.hoisted(() => ({
  teams: new Map<string, TeamState>(),
  sessions: new Map<string, SessionRecord>(),
  launchValidateMock: vi.fn(),
  loadTeamManifestFromFileMock: vi.fn<(filePath: string) => Promise<TeamManifest>>(),
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
  stopTeamAgentDaemonMock: vi.fn<(baseDir: string, sessionId: string) => Promise<boolean>>(),
  isOrchestratorRunningMock: vi.fn<() => Promise<boolean>>(),
  startOrchestratorMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@qwen-code/qwen-code-core", () => ({
  LaunchTaskTool: class {
    validateBuildAndExecute = hoisted.launchValidateMock;
  },
  getSession: vi.fn(async (sessionId: string) => hoisted.sessions.get(sessionId) ?? null),
  listSessions: vi.fn(async () => Array.from(hoisted.sessions.values())),
  getTeamState: vi.fn(async (_baseDir: string, teamId: string) =>
    hoisted.teams.get(teamId),
  ),
  listTeamStates: vi.fn(async () => Array.from(hoisted.teams.values())),
  removeTeamState: vi.fn(async (_baseDir: string, teamId: string) =>
    hoisted.teams.delete(teamId),
  ),
  upsertTeamState: vi.fn(
    async (
      _baseDir: string,
      teamId: string,
      updater: (current: TeamState | undefined, nowIso: string) => TeamState,
    ) => {
      const nowIso = new Date().toISOString();
      const next = updater(hoisted.teams.get(teamId), nowIso);
      hoisted.teams.set(teamId, next);
      return next;
    },
  ),
}));

vi.mock("../../team/manifest-loader.js", () => ({
  TeamManifestError: class TeamManifestError extends Error {},
  loadTeamManifestFromFile: hoisted.loadTeamManifestFromFileMock,
}));

vi.mock("../../team/agent-daemon.js", () => ({
  getDefaultTeamAgentSessionId: (teamId: string, agentId: string) =>
    `team-agent-${teamId}-${agentId}`,
  startTeamAgentDaemon: hoisted.startTeamAgentDaemonMock,
  stopTeamAgentDaemon: hoisted.stopTeamAgentDaemonMock,
}));

vi.mock("../../orchestrator/daemon.js", () => ({
  isOrchestratorRunning: hoisted.isOrchestratorRunningMock,
  startOrchestrator: hoisted.startOrchestratorMock,
}));

describe("teamCommand", () => {
  let tempDir = "";
  let context: CommandContext;

  beforeEach(async () => {
    hoisted.teams.clear();
    hoisted.sessions.clear();
    hoisted.launchValidateMock.mockReset();
    hoisted.loadTeamManifestFromFileMock.mockReset();
    hoisted.startTeamAgentDaemonMock.mockReset();
    hoisted.stopTeamAgentDaemonMock.mockReset();
    hoisted.isOrchestratorRunningMock.mockReset();
    hoisted.startOrchestratorMock.mockReset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-command-"));

    hoisted.startTeamAgentDaemonMock.mockImplementation(
      async (options: { sessionId: string }) => {
        hoisted.sessions.set(options.sessionId, {
          id: options.sessionId,
          pid: 55555,
          mode: "team_agent",
          cwd: tempDir,
          started_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          status: "idle",
        });
        return true;
      },
    );
    hoisted.stopTeamAgentDaemonMock.mockResolvedValue(true);
    hoisted.isOrchestratorRunningMock.mockResolvedValue(true);
    hoisted.startOrchestratorMock.mockResolvedValue(true);
    hoisted.launchValidateMock.mockResolvedValue({
      llmContent: "ok",
      returnDisplay: "ok",
    });

    hoisted.sessions.set("session-worker-1", {
      id: "session-worker-1",
      pid: 12345,
      mode: "team_agent",
      cwd: tempDir,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: "idle",
    });
    hoisted.sessions.set("orchestrator-live", {
      id: "orchestrator-live",
      pid: process.pid,
      mode: "orchestrator",
      cwd: tempDir,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: "idle",
    });

    context = createMockCommandContext({
      services: {
        config: {
          getTargetDir: () => tempDir,
        } as any,
      },
    });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("creates a team from manifest", async () => {
    hoisted.loadTeamManifestFromFileMock.mockResolvedValue({
      version: "1.0",
      id: "research-team",
      name: "Research Team",
      agents: [{ id: "researcher-alpha", role: "researcher" }],
      channels: [{ name: "#general", history: "shared" }],
    });

    const result = await teamCommand.action!(context, "create --file team.yaml");

    expect(result).toEqual(
      expect.objectContaining({
        type: "message",
        messageType: "info",
      }),
    );
    expect((result as any).content).toContain('Team "research-team" created');
    expect((result as any).content).toContain("Provisioned team_agent sessions: 1/1.");
    expect(hoisted.teams.get("research-team")?.agents["researcher-alpha"]?.session_id).toBe(
      "team-agent-research-team-researcher-alpha",
    );
  });

  it("creates a team from inline wizard arguments", async () => {
    const result = await teamCommand.action!(
      context,
      'create --id inline-team --name "Inline Team" --agent-tasks "researcher-a,implementer-b" --channels "#general,#planning" --description "wizard created"',
    );

    expect(result).toEqual(
      expect.objectContaining({
        type: "message",
        messageType: "info",
      }),
    );
    expect((result as any).content).toContain('Team "inline-team" created');
    expect((result as any).content).toContain("inline wizard");
    expect(hoisted.teams.get("inline-team")?.manifest.description).toBe(
      "wizard created",
    );
    expect(hoisted.teams.get("inline-team")?.manifest.agents[0]?.role).toBe(
      "researcher-a",
    );
    expect(hoisted.teams.get("inline-team")?.agents["researcher-a"]?.session_id).toBe(
      "team-agent-inline-team-researcher-a",
    );
  });

  it("opens the team dialog when called without args", async () => {
    const result = await teamCommand.action!(context, "");
    expect(result).toEqual({
      type: "dialog",
      dialog: "team",
    });
  });

  it("returns CLI-only hint for runtime monitor", async () => {
    const result = await teamCommand.action!(context, "runtime");
    expect(result).toEqual({
      type: "message",
      messageType: "info",
      content:
        'Team Runtime Console is CLI-only. Run "lowcal team-monitor" (or "qwen team-runtime") in a separate terminal.',
    });
  });

  it("lists teams", async () => {
    hoisted.teams.set("team-a", {
      team_id: "team-a",
      name: "Team A",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-a",
        name: "Team A",
        agents: [{ id: "agent-a", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "pending",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-a-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(context, "list");
    expect((result as any).content).toContain("Teams (1):");
    expect((result as any).content).toContain("team-a (active)");
  });

  it("returns usage error for missing status team id", async () => {
    const result = await teamCommand.action!(context, "status");
    expect(result).toEqual({
      type: "message",
      messageType: "error",
      content: "Usage: /team status <team_id>",
    });
  });

  it("runs a selected team and starts orchestrator if needed", async () => {
    hoisted.isOrchestratorRunningMock.mockResolvedValue(false);
    const schedulerEnvBefore = process.env["LOWCAL_SCHEDULER_CWD"];
    hoisted.launchValidateMock.mockImplementation(async () => {
      expect(process.env["LOWCAL_SCHEDULER_CWD"]).toBe(tempDir);
      return {
        llmContent: "ok",
        returnDisplay: "ok",
      };
    });
    hoisted.teams.set("team-run", {
      team_id: "team-run",
      name: "Team Run",
      status: "completed",
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-run",
        name: "Team Run",
        agents: [{ id: "agent-a", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "completed",
          session_id: "team-agent-team-run-agent-a",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-run-general.jsonl",
        },
      },
      coordination: {
        phase: "done",
        turn_number: 4,
        waiting_on_agent_ids: [],
        last_transition_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        delegations: {
          old: {
            task_id: "old",
            agent_id: "agent-a",
            delegated_at: new Date().toISOString(),
            status: "completed",
            task_description: "done",
          },
        },
      },
    });

    const result = await teamCommand.action!(context, "run team-run");
    expect((result as any).content).toContain('Team "team-run" run initiated.');
    expect((result as any).content).toContain("Orchestrator daemon started.");
    expect((result as any).content).toContain(
      "Launched immediate-start team-member tasks: 1/1.",
    );
    expect(hoisted.startOrchestratorMock).toHaveBeenCalledTimes(1);
    expect(hoisted.launchValidateMock).toHaveBeenCalledTimes(1);
    expect(hoisted.launchValidateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        template_id: "agent-a",
      }),
      expect.anything(),
    );
    expect(hoisted.teams.get("team-run")?.status).toBe("active");
    expect(hoisted.teams.get("team-run")?.coordination?.phase).toBe("waiting");
    expect(
      Object.keys(hoisted.teams.get("team-run")?.coordination?.delegations ?? {})
        .length,
    ).toBe(1);
    expect(process.env["LOWCAL_SCHEDULER_CWD"]).toBe(schedulerEnvBefore);
  });

  it("respects idle startup mode on run", async () => {
    hoisted.teams.set("team-idle", {
      team_id: "team-idle",
      name: "Team Idle",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-idle",
        name: "Team Idle",
        agents: [{ id: "agent-idle", role: "researcher", startup: "idle" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-idle": {
          agent_id: "agent-idle",
          role: "researcher",
          status: "idle",
          session_id: "team-agent-team-idle-agent-idle",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-idle-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(context, "run team-idle");
    expect((result as any).content).toContain(
      "Launched immediate-start team-member tasks: 0/0.",
    );
    expect(hoisted.launchValidateMock).not.toHaveBeenCalled();
  });

  it("updates team manifest from inline args", async () => {
    hoisted.teams.set("team-updated", {
      team_id: "team-updated",
      name: "Team Updated",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-updated",
        name: "Team Updated",
        agents: [{ id: "agent-1", role: "agent-1" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-1": {
          agent_id: "agent-1",
          role: "agent-1",
          status: "idle",
          session_id: "team-agent-team-updated-agent-1",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-updated-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(
      context,
      'update team-updated --name "Edited Team" --agent-tasks "agent-1,agent-2" --agent-task-modes "agent-1:idle,agent-2:immediate" --channels "#general,#planning"',
    );

    expect((result as any).content).toContain('Team "team-updated" updated.');
    expect(hoisted.teams.get("team-updated")?.name).toBe("Edited Team");
    expect(hoisted.teams.get("team-updated")?.manifest.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "agent-1", startup: "idle" }),
        expect.objectContaining({ id: "agent-2", startup: "immediate" }),
      ]),
    );
    expect(hoisted.teams.get("team-updated")?.channels["#planning"]).toBeDefined();
  });

  it("accepts a team prompt and resets coordination", async () => {
    hoisted.teams.set("team-prompt", {
      team_id: "team-prompt",
      name: "Team Prompt",
      status: "completed",
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-prompt",
        name: "Team Prompt",
        agents: [{ id: "agent-a", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "completed",
          session_id: "team-agent-team-prompt-agent-a",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-prompt-general.jsonl",
        },
      },
      coordination: {
        phase: "done",
        turn_number: 2,
        waiting_on_agent_ids: [],
        last_transition_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        delegations: {},
      },
    });

    const result = await teamCommand.action!(
      context,
      'prompt team-prompt "Replan and delegate issue triage."',
    );

    expect((result as any).content).toContain(
      'Prompt accepted for team "team-prompt".',
    );
    expect(hoisted.teams.get("team-prompt")?.coordination?.phase).toBe("planning");
    expect(hoisted.teams.get("team-prompt")?.manifest.description).toBe(
      "Replan and delegate issue triage.",
    );
  });

  it("posts DM messages and auto-creates DM channels", async () => {
    hoisted.teams.set("team-msg", {
      team_id: "team-msg",
      name: "Team Msg",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-msg",
        name: "Team Msg",
        agents: [{ id: "agent-a", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "idle",
          session_id: "team-agent-team-msg-agent-a",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-msg-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(
      context,
      'dm team-msg --from user --to agent-a --content "Can you summarize findings?"',
    );
    expect((result as any).content).toContain('Posted message to team "team-msg".');
    expect((result as any).content).toContain("Channel: @dm:agent-a|user (direct)");

    const dmChannel = hoisted.teams.get("team-msg")?.channels["@dm:agent-a|user"];
    expect(dmChannel).toBeDefined();
    expect(dmChannel?.message_count).toBe(1);

    const dmPath = path.join(tempDir, dmChannel!.path);
    const dmRaw = await fs.readFile(dmPath, "utf-8");
    expect(dmRaw).toContain('"from_agent":"user"');
    expect(dmRaw).toContain('"to_agent":"agent-a"');
    expect(dmRaw).toContain('"visibility":"direct"');
  });

  it("reads participant communications across public and DM channels", async () => {
    hoisted.teams.set("team-read", {
      team_id: "team-read",
      name: "Team Read",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-read",
        name: "Team Read",
        agents: [{ id: "agent-a", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "idle",
          session_id: "team-agent-team-read-agent-a",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-read-general.jsonl",
        },
      },
    });

    await teamCommand.action!(
      context,
      'message team-read --from user --content "Public kickoff update"',
    );
    await teamCommand.action!(
      context,
      'dm team-read --from orchestrator --to agent-a --content "Please prioritize bug triage"',
    );

    const readResult = await teamCommand.action!(
      context,
      "read team-read --participant agent-a --limit 20",
    );
    expect((readResult as any).content).toContain("Read 2 message(s) across 2 channel(s)");
    expect((readResult as any).content).toContain("Public kickoff update");
    expect((readResult as any).content).toContain("Please prioritize bug triage");
  });

  it("binds an agent session with add-agent", async () => {
    hoisted.teams.set("team-c", {
      team_id: "team-c",
      name: "Team C",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-c",
        name: "Team C",
        agents: [{ id: "agent-c", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-c": {
          agent_id: "agent-c",
          role: "researcher",
          status: "pending",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-c-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(
      context,
      "add-agent team-c --agent-id agent-c --session-id session-worker-1",
    );
    expect((result as any).content).toContain('Bound agent "agent-c" to session "session-worker-1"');
    expect(hoisted.teams.get("team-c")?.agents["agent-c"]?.session_id).toBe(
      "session-worker-1",
    );
  });

  it("spawns and binds when add-agent omits --session-id", async () => {
    hoisted.teams.set("team-e", {
      team_id: "team-e",
      name: "Team E",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-e",
        name: "Team E",
        agents: [{ id: "agent-e", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {},
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-e-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(
      context,
      "add-agent team-e --agent-id agent-e",
    );

    expect((result as any).content).toContain(
      'Bound agent "agent-e" to session "team-agent-team-e-agent-e"',
    );
    expect(hoisted.startTeamAgentDaemonMock).toHaveBeenCalled();
    expect(hoisted.teams.get("team-e")?.agents["agent-e"]?.session_id).toBe(
      "team-agent-team-e-agent-e",
    );
  });

  it("removes an agent with remove-agent", async () => {
    hoisted.teams.set("team-d", {
      team_id: "team-d",
      name: "Team D",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-d",
        name: "Team D",
        agents: [{ id: "agent-d", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-d": {
          agent_id: "agent-d",
          role: "researcher",
          status: "idle",
          session_id: "session-worker-1",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-d-general.jsonl",
        },
      },
    });

    const result = await teamCommand.action!(context, "remove-agent team-d agent-d");
    expect((result as any).content).toContain('Removed agent "agent-d"');
    expect(hoisted.teams.get("team-d")?.agents["agent-d"]).toBeUndefined();
  });

  it("dissolves a team", async () => {
    hoisted.teams.set("team-b", {
      team_id: "team-b",
      name: "Team B",
      status: "active",
      created_at: new Date().toISOString(),
      manifest: {
        version: "1.0",
        id: "team-b",
        name: "Team B",
        agents: [{ id: "agent-b", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        "agent-b": {
          agent_id: "agent-b",
          role: "researcher",
          status: "idle",
          session_id: "session-worker-1",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-b-general.jsonl",
        },
      },
    });

    await fs.mkdir(path.join(tempDir, ".lowcal", "team-channels"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(tempDir, ".lowcal", "team-channels", "team-b-general.jsonl"),
      "",
      "utf-8",
    );

    const result = await teamCommand.action!(context, "dissolve team-b");
    expect((result as any).content).toContain('Team "team-b" dissolved');
    expect(hoisted.teams.has("team-b")).toBe(false);
    expect(hoisted.stopTeamAgentDaemonMock).toHaveBeenCalledWith(
      tempDir,
      "session-worker-1",
    );
  });
});
