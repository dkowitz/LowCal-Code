/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  getLaunchTaskState,
  reconcileLaunchTaskState,
  upsertLaunchTaskState,
} from "./launch-task-state.js";

describe("launch-task-state maintenance", () => {
  let tempRootDir = "";

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "launch-task-state-"));
  });

  afterEach(async () => {
    if (tempRootDir) {
      await fs.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it("marks stale running tasks as failed", async () => {
    const oldIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await upsertLaunchTaskState(tempRootDir, "task-stale", () => ({
      task_id: "task-stale",
      status: "running",
      created_at: oldIso,
      started_at: oldIso,
      last_heartbeat: oldIso,
    }));

    const result = await reconcileLaunchTaskState(tempRootDir, {
      staleAfterMs: 30_000,
      terminalRetentionMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.staleMarked).toBe(1);
    expect(result.staleTaskIds).toContain("task-stale");

    const state = await getLaunchTaskState(tempRootDir, "task-stale");
    expect(state?.status).toBe("failed");
    expect(state?.last_error).toContain("no heartbeat");
    expect(state?.finished_at).toBeTruthy();
  });

  it("does not stale-mark active tasks with a live pid", async () => {
    const oldIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await upsertLaunchTaskState(tempRootDir, "task-live-pid", () => ({
      task_id: "task-live-pid",
      status: "running",
      created_at: oldIso,
      started_at: oldIso,
      last_heartbeat: oldIso,
      pid: process.pid,
    }));

    const result = await reconcileLaunchTaskState(tempRootDir, {
      staleAfterMs: 30_000,
      terminalRetentionMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.staleMarked).toBe(0);

    const state = await getLaunchTaskState(tempRootDir, "task-live-pid");
    expect(state?.status).toBe("running");
  });

  it("prunes old terminal tasks beyond retention", async () => {
    const oldIso = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    await upsertLaunchTaskState(tempRootDir, "task-old-completed", () => ({
      task_id: "task-old-completed",
      status: "completed",
      created_at: oldIso,
      finished_at: oldIso,
      last_heartbeat: oldIso,
    }));

    const result = await reconcileLaunchTaskState(tempRootDir, {
      staleAfterMs: 60_000,
      terminalRetentionMs: 7 * 24 * 60 * 60 * 1000,
    });

    expect(result.pruned).toBe(1);
    expect(result.prunedTaskIds).toContain("task-old-completed");

    const state = await getLaunchTaskState(tempRootDir, "task-old-completed");
    expect(state).toBeUndefined();
  });
});
