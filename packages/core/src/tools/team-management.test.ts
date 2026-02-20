/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Config, SessionRecord } from "../index.js";
import { getTeamState, upsertTeamState } from "../team/state-store.js";
import {
  TeamManagementTool,
  type TeamManagementParams,
} from "./team-management.js";

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn<(sessionId: string) => Promise<SessionRecord | null>>(),
}));

vi.mock("../sessions/session-store.js", () => ({
  getSession: hoisted.getSessionMock,
}));

describe("team-management tool", () => {
  let tempRootDir = "";
  let tool: TeamManagementTool;

  async function run(params: TeamManagementParams): Promise<string> {
    const invocation = tool.build(params);
    if (typeof invocation === "string") {
      throw new Error(invocation);
    }
    const result = await invocation.execute(new AbortController().signal);
    return String(result.llmContent ?? "");
  }

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-management-"));

    hoisted.getSessionMock.mockReset();
    hoisted.getSessionMock.mockImplementation(async (sessionId: string) => {
      if (sessionId !== "orch-1") {
        return null;
      }
      return {
        id: "orch-1",
        pid: process.pid,
        mode: "orchestrator",
        cwd: tempRootDir,
        started_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        status: "idle",
      };
    });

    const mockConfig = {
      getTargetDir: () => tempRootDir,
      getSessionId: () => "orch-1",
    } as unknown as Config;
    tool = new TeamManagementTool(mockConfig);

    await upsertTeamState(tempRootDir, "team-alpha", (_current, nowIso) => ({
      team_id: "team-alpha",
      name: "Team Alpha",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: "team-alpha",
        name: "Team Alpha",
        agents: [{ id: "agent-a", role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orch-runtime",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "idle",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: ".lowcal/team-channels/team-alpha-general.jsonl",
        },
      },
    }));
  });

  afterEach(async () => {
    if (tempRootDir) {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it("lists teams", async () => {
    const output = await run({ action: "list_teams" });
    expect(output).toContain("team-alpha");
  });

  it("posts and reads shared channel messages", async () => {
    const postOutput = await run({
      action: "post_to_channel",
      team_id: "team-alpha",
      channel_name: "#general",
      content: "Delegating next research step.",
    });
    expect(postOutput).toContain("Posted turn");

    const readOutput = await run({
      action: "read_channel",
      team_id: "team-alpha",
      channel_name: "#general",
      after_turn: 0,
      limit: 10,
    });
    expect(readOutput).toContain("Delegating next research step.");

    const team = await getTeamState(tempRootDir, "team-alpha");
    expect(team?.channels["#general"]?.message_count).toBe(1);
  });

  it("rejects delegate_task when agent has no bound session", async () => {
    const output = await run({
      action: "delegate_task",
      team_id: "team-alpha",
      agent_id: "agent-a",
      task_description: "Analyze the source set and summarize key findings.",
    });
    expect(output).toContain("no bound session_id");
  });

  it("respects restricted channel membership when reading participant inbox", async () => {
    await upsertTeamState(tempRootDir, "team-alpha", (_current, nowIso) => ({
      team_id: "team-alpha",
      name: "Team Alpha",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: "team-alpha",
        name: "Team Alpha",
        agents: [
          { id: "agent-a", role: "researcher" },
          { id: "agent-b", role: "coder" },
        ],
        channels: [
          {
            name: "#private",
            history: "shared",
            visibility: "restricted",
            members: ["agent-a", "orchestrator"],
          },
        ],
      },
      orchestrator_session_id: "orch-runtime",
      agents: {
        "agent-a": {
          agent_id: "agent-a",
          role: "researcher",
          status: "idle",
        },
        "agent-b": {
          agent_id: "agent-b",
          role: "coder",
          status: "idle",
        },
      },
      channels: {
        "#private": {
          channel_name: "#private",
          message_count: 0,
          path: ".lowcal/team-channels/team-alpha-private.jsonl",
        },
      },
    }));

    const postOutput = await run({
      action: "post_message",
      team_id: "team-alpha",
      channel_name: "#private",
      from_agent: "agent-a",
      content: "Private researcher update.",
    });
    expect(postOutput).toContain("Posted turn");

    const readAllowed = await run({
      action: "read_messages",
      team_id: "team-alpha",
      participant: "agent-a",
      limit: 10,
    });
    expect(readAllowed).toContain("Private researcher update.");

    const readDenied = await run({
      action: "read_messages",
      team_id: "team-alpha",
      participant: "agent-b",
      limit: 10,
    });
    expect(readDenied).toContain("No channel messages found");
  });
});
