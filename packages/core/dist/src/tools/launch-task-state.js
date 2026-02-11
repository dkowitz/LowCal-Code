/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
const STORE_RELATIVE_PATH = path.join(".lowcal", "launch-task-state.json");
const LOCK_RELATIVE_PATH = path.join(".lowcal", "launch-task-state.lock");
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 100;
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_TERMINAL_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
function parseIsoTime(value) {
    if (!value) {
        return undefined;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function isPositiveFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function createEmptyStore() {
    const now = new Date().toISOString();
    return {
        version: "1.0",
        updated_at: now,
        tasks: {},
    };
}
function resolveStorePath(baseDir) {
    return path.join(baseDir, STORE_RELATIVE_PATH);
}
function resolveLockPath(baseDir) {
    return path.join(baseDir, LOCK_RELATIVE_PATH);
}
async function ensureDirectories(baseDir) {
    await fs.mkdir(path.join(baseDir, ".lowcal"), { recursive: true });
}
async function acquireLock(baseDir, timeoutMs = LOCK_TIMEOUT_MS) {
    await ensureDirectories(baseDir);
    const lockPath = resolveLockPath(baseDir);
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const fd = await fs.open(lockPath, "wx");
            await fd.writeFile(String(process.pid), "utf-8");
            await fd.close();
            return;
        }
        catch {
            try {
                const pidRaw = await fs.readFile(lockPath, "utf-8");
                const pid = Number.parseInt(pidRaw.trim(), 10);
                if (!Number.isFinite(pid)) {
                    await fs.unlink(lockPath).catch(() => { });
                    continue;
                }
                try {
                    process.kill(pid, 0);
                }
                catch {
                    await fs.unlink(lockPath).catch(() => { });
                    continue;
                }
            }
            catch {
                // Ignore and retry.
            }
            await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
        }
    }
    throw new Error("Timeout acquiring launch task state lock");
}
async function releaseLock(baseDir) {
    const lockPath = resolveLockPath(baseDir);
    await fs.unlink(lockPath).catch(() => { });
}
async function loadStoreUnlocked(baseDir) {
    await ensureDirectories(baseDir);
    const storePath = resolveStorePath(baseDir);
    try {
        const raw = await fs.readFile(storePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return createEmptyStore();
        }
        const tasks = parsed.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {};
        return {
            version: "1.0",
            updated_at: typeof parsed.updated_at === "string"
                ? parsed.updated_at
                : new Date().toISOString(),
            tasks: tasks,
        };
    }
    catch {
        return createEmptyStore();
    }
}
async function saveStoreUnlocked(baseDir, store) {
    const storePath = resolveStorePath(baseDir);
    const tempPath = `${storePath}.tmp-${process.pid}-${Date.now()}`;
    store.updated_at = new Date().toISOString();
    await fs.writeFile(tempPath, JSON.stringify(store, null, 2), "utf-8");
    await fs.rename(tempPath, storePath);
}
async function withStore(baseDir, mutate, fn) {
    await acquireLock(baseDir);
    try {
        const store = await loadStoreUnlocked(baseDir);
        const result = await fn(store);
        if (mutate) {
            await saveStoreUnlocked(baseDir, store);
        }
        return result;
    }
    finally {
        await releaseLock(baseDir);
    }
}
export function isLaunchTaskTerminal(status) {
    return status === "completed" || status === "failed" || status === "cancelled";
}
export async function getLaunchTaskState(baseDir, taskId) {
    return await withStore(baseDir, false, async (store) => store.tasks[taskId]);
}
export async function listLaunchTaskStates(baseDir, options = {}) {
    const { parentSessionId, statuses, limit } = options;
    const statusSet = statuses ? new Set(statuses) : undefined;
    const records = await withStore(baseDir, false, async (store) => Object.values(store.tasks));
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
        const aTs = Date.parse(a.last_heartbeat ?? a.finished_at ?? a.started_at ?? a.created_at);
        const bTs = Date.parse(b.last_heartbeat ?? b.finished_at ?? b.started_at ?? b.created_at);
        return bTs - aTs;
    });
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
        return filtered.slice(0, Math.floor(limit));
    }
    return filtered;
}
export async function findActiveLaunchTaskByDedupeKey(baseDir, dedupeKey, parentSessionId) {
    const records = await listLaunchTaskStates(baseDir, {
        parentSessionId,
        statuses: ["queued", "running"],
    });
    return records.find((record) => record.dedupe_key === dedupeKey);
}
export async function upsertLaunchTaskState(baseDir, taskId, updater) {
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
export async function reconcileLaunchTaskState(baseDir, options = {}) {
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
        const staleTaskIds = [];
        const prunedTaskIds = [];
        for (const [taskId, record] of Object.entries(store.tasks)) {
            const isActive = record.status === "queued" || record.status === "running";
            if (isActive) {
                const heartbeatMs = parseIsoTime(record.last_heartbeat ?? record.started_at ?? record.created_at);
                const ageMs = typeof heartbeatMs === "number" ? Math.max(0, nowMs - heartbeatMs) : undefined;
                const pidRunning = typeof record.pid === "number" ? isProcessAlive(record.pid) : undefined;
                const staleByHeartbeat = typeof ageMs === "number" && ageMs > staleAfterMs && pidRunning !== true;
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
            const terminalMs = parseIsoTime(record.finished_at ??
                record.last_heartbeat ??
                record.started_at ??
                record.created_at);
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
//# sourceMappingURL=launch-task-state.js.map