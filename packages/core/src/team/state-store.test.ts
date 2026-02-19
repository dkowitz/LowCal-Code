/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  getTeamState,
  listTeamStates,
  removeTeamState,
  upsertTeamState,
} from "./state-store.js";
import type { TeamState } from "./types.js";

describe("team state store", () => {
  let tempRootDir = "";

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-state-"));
  });

  afterEach(async () => {
    if (tempRootDir) {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  function makeTeamState(id: string, nowIso: string): TeamState {
    return {
      team_id: id,
      name: `Team ${id}`,
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id,
        name: `Team ${id}`,
        agents: [{ id: `${id}-agent`, role: "researcher" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-1",
      agents: {
        [`${id}-agent`]: {
          agent_id: `${id}-agent`,
          session_id: `${id}-session`,
          role: "researcher",
          status: "idle",
        },
      },
      channels: {
        "#general": {
          channel_name: "#general",
          message_count: 0,
          path: `.lowcal/team-channels/${id}-general.jsonl`,
        },
      },
    };
  }

  it("upserts and reads team state", async () => {
    await upsertTeamState(tempRootDir, "team-a", (_current, nowIso) =>
      makeTeamState("team-a", nowIso),
    );

    const state = await getTeamState(tempRootDir, "team-a");
    expect(state).toBeDefined();
    expect(state?.team_id).toBe("team-a");
    expect(state?.status).toBe("active");
  });

  it("lists and filters team states", async () => {
    await upsertTeamState(tempRootDir, "team-old", (_current, nowIso) =>
      makeTeamState("team-old", nowIso),
    );
    await upsertTeamState(tempRootDir, "team-new", (_current, nowIso) =>
      makeTeamState("team-new", nowIso),
    );
    await upsertTeamState(tempRootDir, "team-failed", (_current, nowIso) => {
      const base = makeTeamState("team-failed", nowIso);
      return {
        ...base,
        status: "failed",
      };
    });

    const active = await listTeamStates(tempRootDir, { statuses: ["active"] });
    expect(active.map((record) => record.team_id)).toContain("team-old");
    expect(active.map((record) => record.team_id)).toContain("team-new");
    expect(active.map((record) => record.team_id)).not.toContain("team-failed");
  });

  it("removes team state", async () => {
    await upsertTeamState(tempRootDir, "team-delete", (_current, nowIso) =>
      makeTeamState("team-delete", nowIso),
    );

    const removed = await removeTeamState(tempRootDir, "team-delete");
    expect(removed).toBe(true);

    const state = await getTeamState(tempRootDir, "team-delete");
    expect(state).toBeUndefined();
  });
});

