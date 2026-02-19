/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { upsertTeamState } from "@qwen-code/qwen-code-core";
import {
  resolvePlannerSettings,
  runTeamPlanner,
  saveOrchestratorPlannerConfig,
  setOrchestratorDecisionModeConfig,
} from "./team-planner.js";

vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  return await importOriginal<typeof import("@qwen-code/qwen-code-core")>();
});

const ENV_DECISION_MODE = "LOWCAL_ORCHESTRATOR_DECISION_MODE";
const ENV_ASSISTED_PLAN_FILE = "LOWCAL_ORCHESTRATOR_ASSISTED_PLAN_FILE";
const ENV_ASSISTED_USE_MODEL = "LOWCAL_ORCHESTRATOR_ASSISTED_USE_MODEL";

describe("team-planner policy", () => {
  let tempRootDir = "";
  let originalDecisionModeEnv: string | undefined;
  let originalPlanFileEnv: string | undefined;
  let originalUseModelEnv: string | undefined;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-planner-"));
    originalDecisionModeEnv = process.env[ENV_DECISION_MODE];
    originalPlanFileEnv = process.env[ENV_ASSISTED_PLAN_FILE];
    originalUseModelEnv = process.env[ENV_ASSISTED_USE_MODEL];
    delete process.env[ENV_DECISION_MODE];
    delete process.env[ENV_ASSISTED_PLAN_FILE];
    process.env[ENV_ASSISTED_USE_MODEL] = "0";
  });

  afterEach(async () => {
    if (typeof originalDecisionModeEnv === "string") {
      process.env[ENV_DECISION_MODE] = originalDecisionModeEnv;
    } else {
      delete process.env[ENV_DECISION_MODE];
    }
    if (typeof originalPlanFileEnv === "string") {
      process.env[ENV_ASSISTED_PLAN_FILE] = originalPlanFileEnv;
    } else {
      delete process.env[ENV_ASSISTED_PLAN_FILE];
    }
    if (typeof originalUseModelEnv === "string") {
      process.env[ENV_ASSISTED_USE_MODEL] = originalUseModelEnv;
    } else {
      delete process.env[ENV_ASSISTED_USE_MODEL];
    }
    if (tempRootDir) {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  async function seedActiveTeam(teamId = "team-a", agentId = "agent-a") {
    await upsertTeamState(tempRootDir, teamId, (_current, nowIso) => ({
      team_id: teamId,
      name: "Team A",
      status: "active",
      created_at: nowIso,
      started_at: nowIso,
      manifest: {
        version: "1.0",
        id: teamId,
        name: "Team A",
        description: "Produce an initial research brief.",
        agents: [{ id: agentId, role: "researcher", startup: "immediate" }],
        channels: [{ name: "#general", history: "shared" }],
      },
      orchestrator_session_id: "orchestrator-pending",
      agents: {
        [agentId]: {
          agent_id: agentId,
          role: "researcher",
          session_id: `session-${agentId}`,
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
  }

  it("returns disabled hints in deterministic mode", async () => {
    await seedActiveTeam();
    const result = await runTeamPlanner({
      baseDir: tempRootDir,
      decisionMode: "deterministic",
    });

    expect(result.source).toBe("disabled");
    expect(result.hints.by_team_id).toEqual({});
    expect(result.snapshot.teams).toHaveLength(1);
  });

  it("builds heuristic delegation hints in assisted mode", async () => {
    await seedActiveTeam();
    const result = await runTeamPlanner({
      baseDir: tempRootDir,
      decisionMode: "assisted",
    });

    expect(result.source).toBe("heuristic");
    expect(result.summary).toContain("heuristic assisted plan");
    const hint = result.hints.by_team_id["team-a"];
    expect(hint).toBeDefined();
    expect(hint?.strategy).toBe("delegate_subset");
    expect(hint?.target_agent_ids).toContain("agent-a");
  });

  it("uses a valid assisted plan file when provided", async () => {
    await seedActiveTeam();
    const planPath = path.join(tempRootDir, "assisted-plan.json");
    await fs.writeFile(
      planPath,
      JSON.stringify(
        {
          schema_version: "1.0",
          summary: "Use hold strategy for this cycle.",
          confidence: 0.9,
          decisions: [
            {
              team_id: "team-a",
              strategy: "hold",
              rationale: "Waiting for additional context.",
            },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await runTeamPlanner({
      baseDir: tempRootDir,
      decisionMode: "assisted",
      assistedPlanFile: planPath,
    });

    expect(result.source).toBe("file");
    expect(result.summary).toBe("Use hold strategy for this cycle.");
    expect(result.hints.by_team_id["team-a"]?.strategy).toBe("hold");
  });

  it("falls back to heuristic plan when file plan is invalid", async () => {
    await seedActiveTeam();
    const planPath = path.join(tempRootDir, "assisted-plan-invalid.json");
    await fs.writeFile(planPath, JSON.stringify({ invalid: true }), "utf-8");

    const result = await runTeamPlanner({
      baseDir: tempRootDir,
      decisionMode: "assisted",
      assistedPlanFile: planPath,
    });

    expect(result.source).toBe("heuristic");
    expect(result.fallback_reason).toContain("file_plan_invalid");
    expect(result.hints.by_team_id["team-a"]).toBeDefined();
  });

  it("resolves planner settings from config and env with env precedence", async () => {
    await saveOrchestratorPlannerConfig(tempRootDir, {
      decision_mode: "assisted",
      assisted_plan_file: ".lowcal/plan.json",
    });

    let settings = await resolvePlannerSettings(tempRootDir);
    expect(settings.decisionMode).toBe("assisted");
    expect(settings.decisionModeSource).toBe("config");
    expect(settings.assistedPlanFile).toBe(
      path.join(tempRootDir, ".lowcal", "plan.json"),
    );

    await setOrchestratorDecisionModeConfig(tempRootDir, "deterministic");
    settings = await resolvePlannerSettings(tempRootDir);
    expect(settings.decisionMode).toBe("deterministic");
    expect(settings.decisionModeSource).toBe("config");

    process.env[ENV_DECISION_MODE] = "assisted";
    settings = await resolvePlannerSettings(tempRootDir);
    expect(settings.decisionMode).toBe("assisted");
    expect(settings.decisionModeSource).toBe("env");
  });
});
