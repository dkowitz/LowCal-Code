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
//# sourceMappingURL=launch-task-state.js.map