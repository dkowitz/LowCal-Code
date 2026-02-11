/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import type { JobExecutionMode } from "../scheduler/types.js";

export type LaunchTaskLifecycleStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface LaunchTaskResultRef {
  mailbox_path?: string;
  output_path?: string;
  child_session_id?: string;
  message_timestamp?: string;
}

export interface LaunchTaskStateRecord {
  task_id: string;
  status: LaunchTaskLifecycleStatus;
  created_at: string;
  started_at?: string;
  last_heartbeat?: string;
  finished_at?: string;
  prompt_preview?: string;
  parent_session_id?: string;
  source_session_id?: string;
  dedupe_key?: string;
  execution_mode_requested?: JobExecutionMode;
  execution_mode_actual?: JobExecutionMode;
  pid?: number;
  tab_name?: string;
  result_ref?: LaunchTaskResultRef;
  last_error?: string;
}

interface LaunchTaskStore {
  version: "1.0";
  updated_at: string;
  tasks: Record<string, LaunchTaskStateRecord>;
}

interface ListLaunchTaskStatesOptions {
  parentSessionId?: string;
  statuses?: LaunchTaskLifecycleStatus[];
  limit?: number;
}

export interface LaunchTaskMaintenanceOptions {
  staleAfterMs?: number;
  terminalRetentionMs?: number;
}

export interface LaunchTaskMaintenanceResult {
  staleMarked: number;
  staleTaskIds: string[];
  pruned: number;
  prunedTaskIds: string[];
}

const STORE_RELATIVE_PATH = path.join(".lowcal", "launch-task-state.json");
const LOCK_RELATIVE_PATH = path.join(".lowcal", "launch-task-state.lock");
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 100;
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_TERMINAL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function parseIsoTime(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createEmptyStore(): LaunchTaskStore {
  const now = new Date().toISOString();
  return {
    version: "1.0",
    updated_at: now,
    tasks: {},
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

  throw new Error("Timeout acquiring launch task state lock");
}

async function releaseLock(baseDir: string): Promise<void> {
  const lockPath = resolveLockPath(baseDir);
  await fs.unlink(lockPath).catch(() => {});
}

async function loadStoreUnlocked(baseDir: string): Promise<LaunchTaskStore> {
  await ensureDirectories(baseDir);
  const storePath = resolveStorePath(baseDir);
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LaunchTaskStore>;
    if (!parsed || typeof parsed !== "object") {
      return createEmptyStore();
    }
    const tasks =
      parsed.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {};
    return {
      version: "1.0",
      updated_at:
        typeof parsed.updated_at === "string"
          ? parsed.updated_at
          : new Date().toISOString(),
      tasks: tasks as Record<string, LaunchTaskStateRecord>,
    };
  } catch {
    return createEmptyStore();
  }
}

async function saveStoreUnlocked(baseDir: string, store: LaunchTaskStore): Promise<void> {
  const storePath = resolveStorePath(baseDir);
  const tempPath = `${storePath}.tmp-${process.pid}-${Date.now()}`;
  store.updated_at = new Date().toISOString();
  await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8");
  await fs.rename(tempPath, storePath);
}

async function withStore<T>(
  baseDir: string,
  mutate: boolean,
  fn: (store: LaunchTaskStore) => Promise<T>,
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

export function isLaunchTaskTerminal(status: LaunchTaskLifecycleStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export async function getLaunchTaskState(
  baseDir: string,
  taskId: string,
): Promise<LaunchTaskStateRecord | undefined> {
  return await withStore(baseDir, false, async (store) => store.tasks[taskId]);
}

export async function listLaunchTaskStates(
  baseDir: string,
  options: ListLaunchTaskStatesOptions = {},
): Promise<LaunchTaskStateRecord[]> {
  const { parentSessionId, statuses, limit } = options;
  const statusSet = statuses ? new Set(statuses) : undefined;

  const records = await withStore(baseDir, false, async (store) =>
    Object.values(store.tasks),
  );

  const filtered = records.filter((record) => {
    if (parentSessionId && record.parent_session_id !== parentSessionId) {
      return false;
    }
    if (statusSet && !statusSet.has(record.status)) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aTs = Date.parse(
      a.last_heartbeat ?? a.finished_at ?? a.started_at ?? a.created_at,
    );
    const bTs = Date.parse(
      b.last_heartbeat ?? b.finished_at ?? b.started_at ?? b.created_at,
    );
    return bTs - aTs;
  });

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return filtered.slice(0, Math.floor(limit));
  }

  return filtered;
}

export async function findActiveLaunchTaskByDedupeKey(
  baseDir: string,
  dedupeKey: string,
  parentSessionId?: string,
): Promise<LaunchTaskStateRecord | undefined> {
  const records = await listLaunchTaskStates(baseDir, {
    parentSessionId,
    statuses: ["queued", "running"],
  });
  return records.find((record) => record.dedupe_key === dedupeKey);
}

export async function upsertLaunchTaskState(
  baseDir: string,
  taskId: string,
  updater: (
    current: LaunchTaskStateRecord | undefined,
    nowIso: string,
  ) => LaunchTaskStateRecord,
): Promise<LaunchTaskStateRecord> {
  return await withStore(baseDir, true, async (store) => {
    const nowIso = new Date().toISOString();
    const current = store.tasks[taskId];
    const updated = updater(current, nowIso);
    store.tasks[taskId] = {
      ...updated,
      task_id: taskId,
    };
    return store.tasks[taskId];
  });
}

export async function reconcileLaunchTaskState(
  baseDir: string,
  options: LaunchTaskMaintenanceOptions = {},
): Promise<LaunchTaskMaintenanceResult> {
  const staleAfterMs = isPositiveFiniteNumber(options.staleAfterMs)
    ? options.staleAfterMs
    : DEFAULT_STALE_AFTER_MS;
  const terminalRetentionMs = isPositiveFiniteNumber(options.terminalRetentionMs)
    ? options.terminalRetentionMs
    : DEFAULT_TERMINAL_RETENTION_MS;

  return await withStore(baseDir, true, async (store) => {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    let staleMarked = 0;
    let pruned = 0;
    const staleTaskIds: string[] = [];
    const prunedTaskIds: string[] = [];

    for (const [taskId, record] of Object.entries(store.tasks)) {
      const isActive = record.status === "queued" || record.status === "running";
      if (isActive) {
        const heartbeatMs = parseIsoTime(
          record.last_heartbeat ?? record.started_at ?? record.created_at,
        );
        const ageMs =
          typeof heartbeatMs === "number" ? Math.max(0, nowMs - heartbeatMs) : undefined;
        const pidRunning =
          typeof record.pid === "number" ? isProcessAlive(record.pid) : undefined;

        const staleByHeartbeat =
          typeof ageMs === "number" && ageMs > staleAfterMs && pidRunning !== true;
        const staleByDeadPid = pidRunning === false;

        if (staleByHeartbeat || staleByDeadPid) {
          staleMarked += 1;
          staleTaskIds.push(taskId);
          const staleReason = staleByDeadPid
            ? "Marked failed by launch task maintenance: process is no longer running."
            : `Marked failed by launch task maintenance: no heartbeat for ${Math.floor((ageMs ?? 0) / 1000)}s.`;
          store.tasks[taskId] = {
            ...record,
            status: "failed",
            finished_at: nowIso,
            last_heartbeat: nowIso,
            last_error: staleReason,
          };
        }
      }
    }

    for (const [taskId, record] of Object.entries(store.tasks)) {
      if (!isLaunchTaskTerminal(record.status)) {
        continue;
      }
      const terminalMs = parseIsoTime(
        record.finished_at ??
          record.last_heartbeat ??
          record.started_at ??
          record.created_at,
      );
      if (typeof terminalMs !== "number") {
        continue;
      }
      if (nowMs - terminalMs > terminalRetentionMs) {
        delete store.tasks[taskId];
        pruned += 1;
        prunedTaskIds.push(taskId);
      }
    }

    return {
      staleMarked,
      staleTaskIds,
      pruned,
      prunedTaskIds,
    };
  });
}
