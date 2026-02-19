/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import type { TeamState, TeamStateStore, TeamStatus } from "./types.js";

export interface ListTeamStatesOptions {
  statuses?: TeamStatus[];
  limit?: number;
}

const STORE_RELATIVE_PATH = path.join(".lowcal", "team-state.json");
const LOCK_RELATIVE_PATH = path.join(".lowcal", "team-state.lock");
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 100;

function createEmptyStore(): TeamStateStore {
  return {
    version: "1.0",
    updated_at: new Date().toISOString(),
    teams: {},
  };
}

function resolveStorePath(baseDir: string): string {
  return path.join(baseDir, STORE_RELATIVE_PATH);
}

function resolveLockPath(baseDir: string): string {
  return path.join(baseDir, LOCK_RELATIVE_PATH);
}

async function ensureDirectories(baseDir: string): Promise<void> {
  await fs.mkdir(path.join(baseDir, ".lowcal"), { recursive: true });
}

async function acquireLock(baseDir: string, timeoutMs = LOCK_TIMEOUT_MS): Promise<void> {
  await ensureDirectories(baseDir);
  const lockPath = resolveLockPath(baseDir);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const fd = await fs.open(lockPath, "wx");
      await fd.writeFile(String(process.pid), "utf-8");
      await fd.close();
      return;
    } catch {
      try {
        const pidRaw = await fs.readFile(lockPath, "utf-8");
        const pid = Number.parseInt(pidRaw.trim(), 10);
        if (!Number.isFinite(pid)) {
          await fs.unlink(lockPath).catch(() => {});
          continue;
        }
        try {
          process.kill(pid, 0);
        } catch {
          await fs.unlink(lockPath).catch(() => {});
          continue;
        }
      } catch {
        // Ignore and retry.
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  throw new Error("Timeout acquiring team state lock");
}

async function releaseLock(baseDir: string): Promise<void> {
  await fs.unlink(resolveLockPath(baseDir)).catch(() => {});
}

async function loadStoreUnlocked(baseDir: string): Promise<TeamStateStore> {
  await ensureDirectories(baseDir);
  const storePath = resolveStorePath(baseDir);
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TeamStateStore>;
    if (!parsed || typeof parsed !== "object") {
      return createEmptyStore();
    }
    return {
      version: "1.0",
      updated_at:
        typeof parsed.updated_at === "string"
          ? parsed.updated_at
          : new Date().toISOString(),
      teams:
        parsed.teams && typeof parsed.teams === "object"
          ? (parsed.teams as Record<string, TeamState>)
          : {},
    };
  } catch {
    return createEmptyStore();
  }
}

async function saveStoreUnlocked(baseDir: string, store: TeamStateStore): Promise<void> {
  const storePath = resolveStorePath(baseDir);
  const tempPath = `${storePath}.tmp-${process.pid}-${Date.now()}`;
  store.updated_at = new Date().toISOString();
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8");
  await fs.rename(tempPath, storePath);
}

async function withStore<T>(
  baseDir: string,
  mutate: boolean,
  fn: (store: TeamStateStore) => Promise<T>,
): Promise<T> {
  await acquireLock(baseDir);
  try {
    const store = await loadStoreUnlocked(baseDir);
    const result = await fn(store);
    if (mutate) {
      await saveStoreUnlocked(baseDir, store);
    }
    return result;
  } finally {
    await releaseLock(baseDir);
  }
}

function toSortTs(team: TeamState): number {
  const value = team.started_at ?? team.created_at;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getTeamState(
  baseDir: string,
  teamId: string,
): Promise<TeamState | undefined> {
  return await withStore(baseDir, false, async (store) => store.teams[teamId]);
}

export async function listTeamStates(
  baseDir: string,
  options: ListTeamStatesOptions = {},
): Promise<TeamState[]> {
  const statusSet = options.statuses ? new Set(options.statuses) : undefined;

  const records = await withStore(baseDir, false, async (store) =>
    Object.values(store.teams),
  );

  const filtered = records.filter((record) => {
    if (!statusSet) {
      return true;
    }
    return statusSet.has(record.status);
  });

  filtered.sort((a, b) => toSortTs(b) - toSortTs(a));

  const { limit } = options;
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return filtered.slice(0, Math.floor(limit));
  }

  return filtered;
}

export async function upsertTeamState(
  baseDir: string,
  teamId: string,
  updater: (current: TeamState | undefined, nowIso: string) => TeamState,
): Promise<TeamState> {
  return await withStore(baseDir, true, async (store) => {
    const nowIso = new Date().toISOString();
    const current = store.teams[teamId];
    const updated = updater(current, nowIso);
    store.teams[teamId] = {
      ...updated,
      team_id: teamId,
    };
    return store.teams[teamId];
  });
}

export async function removeTeamState(
  baseDir: string,
  teamId: string,
): Promise<boolean> {
  return await withStore(baseDir, true, async (store) => {
    if (!store.teams[teamId]) {
      return false;
    }
    delete store.teams[teamId];
    return true;
  });
}

