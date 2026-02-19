/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
const STORE_RELATIVE_PATH = path.join(".lowcal", "team-state.json");
const LOCK_RELATIVE_PATH = path.join(".lowcal", "team-state.lock");
const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 100;
function createEmptyStore() {
    return {
        version: "1.0",
        updated_at: new Date().toISOString(),
        teams: {},
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
    throw new Error("Timeout acquiring team state lock");
}
async function releaseLock(baseDir) {
    await fs.unlink(resolveLockPath(baseDir)).catch(() => { });
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
        return {
            version: "1.0",
            updated_at: typeof parsed.updated_at === "string"
                ? parsed.updated_at
                : new Date().toISOString(),
            teams: parsed.teams && typeof parsed.teams === "object"
                ? parsed.teams
                : {},
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
function toSortTs(team) {
    const value = team.started_at ?? team.created_at;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
export async function getTeamState(baseDir, teamId) {
    return await withStore(baseDir, false, async (store) => store.teams[teamId]);
}
export async function listTeamStates(baseDir, options = {}) {
    const statusSet = options.statuses ? new Set(options.statuses) : undefined;
    const records = await withStore(baseDir, false, async (store) => Object.values(store.teams));
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
export async function upsertTeamState(baseDir, teamId, updater) {
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
export async function removeTeamState(baseDir, teamId) {
    return await withStore(baseDir, true, async (store) => {
        if (!store.teams[teamId]) {
            return false;
        }
        delete store.teams[teamId];
        return true;
    });
}
//# sourceMappingURL=state-store.js.map