/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { Storage } from "../config/storage.js";
const SESSIONS_FILE = path.join(Storage.getGlobalGeminiDir(), "sessions.json");
const LOCK_FILE = path.join(Storage.getGlobalGeminiDir(), "sessions.lock");
async function ensureDirectories() {
    await fs.mkdir(Storage.getGlobalGeminiDir(), { recursive: true });
}
function createEmptyStore() {
    return {
        version: "1.0",
        sessions: [],
        last_modified: new Date().toISOString(),
    };
}
async function acquireLock(timeoutMs = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const fd = await fs.open(LOCK_FILE, "wx");
            await fd.write(String(process.pid));
            await fd.close();
            return;
        }
        catch {
            try {
                const pid = parseInt(await fs.readFile(LOCK_FILE, "utf-8"), 10);
                try {
                    process.kill(pid, 0);
                }
                catch {
                    await fs.unlink(LOCK_FILE).catch(() => { });
                    continue;
                }
            }
            catch {
                // Ignore lock read errors and retry.
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw new Error("Timeout acquiring lock on session store");
}
async function releaseLock() {
    await fs.unlink(LOCK_FILE).catch(() => { });
}
async function loadStore() {
    await ensureDirectories();
    try {
        const data = await fs.readFile(SESSIONS_FILE, "utf-8");
        const store = JSON.parse(data);
        if (!store.sessions || !Array.isArray(store.sessions)) {
            return createEmptyStore();
        }
        return store;
    }
    catch {
        return createEmptyStore();
    }
}
async function saveStore(store) {
    await ensureDirectories();
    store.last_modified = new Date().toISOString();
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2), "utf-8");
}
async function withStore(fn) {
    await acquireLock();
    try {
        const store = await loadStore();
        const result = await fn(store);
        await saveStore(store);
        return result;
    }
    finally {
        await releaseLock();
    }
}
async function withStoreReadOnly(fn) {
    await acquireLock();
    try {
        const store = await loadStore();
        return await fn(store);
    }
    finally {
        await releaseLock();
    }
}
export async function registerSession(session) {
    await withStore(async (store) => {
        const existingIndex = store.sessions.findIndex((s) => s.id === session.id);
        if (existingIndex >= 0) {
            store.sessions[existingIndex] = session;
        }
        else {
            store.sessions.push(session);
        }
    });
}
export async function getSession(sessionId) {
    return await withStoreReadOnly(async (store) => {
        return store.sessions.find((s) => s.id === sessionId) ?? null;
    });
}
export async function updateSession(sessionId, patch) {
    return await withStore(async (store) => {
        const index = store.sessions.findIndex((s) => s.id === sessionId);
        if (index < 0) {
            return null;
        }
        const existing = store.sessions[index];
        const updated = {
            ...existing,
            ...patch,
            last_seen: new Date().toISOString(),
        };
        store.sessions[index] = updated;
        return updated;
    });
}
export async function heartbeatSession(sessionId, status) {
    return await updateSession(sessionId, status ? { status } : {});
}
export async function removeSession(sessionId) {
    return await withStore(async (store) => {
        const before = store.sessions.length;
        store.sessions = store.sessions.filter((s) => s.id !== sessionId);
        return store.sessions.length !== before;
    });
}
export async function listSessions() {
    return await withStoreReadOnly(async (store) => store.sessions.slice());
}
export async function pruneStaleSessions(ttlMs) {
    const now = Date.now();
    return await withStore(async (store) => {
        const stale = [];
        const keep = [];
        for (const session of store.sessions) {
            const lastSeen = Date.parse(session.last_seen);
            if (Number.isFinite(lastSeen) && now - lastSeen > ttlMs) {
                stale.push(session);
            }
            else {
                keep.push(session);
            }
        }
        store.sessions = keep;
        return stale;
    });
}
//# sourceMappingURL=session-store.js.map