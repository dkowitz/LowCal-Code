/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { Storage } from "../config/storage.js";
import type { SessionRecord, SessionStore, SessionStatus } from "./types.js";

const SESSIONS_FILE = path.join(Storage.getGlobalGeminiDir(), "sessions.json");
const LOCK_FILE = path.join(Storage.getGlobalGeminiDir(), "sessions.lock");

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(Storage.getGlobalGeminiDir(), { recursive: true });
}

function createEmptyStore(): SessionStore {
  return {
    version: "1.0",
    sessions: [],
    last_modified: new Date().toISOString(),
  };
}

async function acquireLock(timeoutMs: number = 5000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const fd = await fs.open(LOCK_FILE, "wx");
      await fd.write(String(process.pid));
      await fd.close();
      return;
    } catch {
      try {
        const pid = parseInt(await fs.readFile(LOCK_FILE, "utf-8"), 10);
        try {
          process.kill(pid, 0);
        } catch {
          await fs.unlink(LOCK_FILE).catch(() => {});
          continue;
        }
      } catch {
        // Ignore lock read errors and retry.
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error("Timeout acquiring lock on session store");
}

async function releaseLock(): Promise<void> {
  await fs.unlink(LOCK_FILE).catch(() => {});
}

async function loadStore(): Promise<SessionStore> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(SESSIONS_FILE, "utf-8");
    const store = JSON.parse(data) as SessionStore;
    if (!store.sessions || !Array.isArray(store.sessions)) {
      return createEmptyStore();
    }
    return store;
  } catch {
    return createEmptyStore();
  }
}

async function saveStore(store: SessionStore): Promise<void> {
  await ensureDirectories();
  store.last_modified = new Date().toISOString();
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

async function withStore<T>(
  fn: (store: SessionStore) => Promise<T>,
): Promise<T> {
  await acquireLock();
  try {
    const store = await loadStore();
    const result = await fn(store);
    await saveStore(store);
    return result;
  } finally {
    await releaseLock();
  }
}

async function withStoreReadOnly<T>(
  fn: (store: SessionStore) => Promise<T>,
): Promise<T> {
  await acquireLock();
  try {
    const store = await loadStore();
    return await fn(store);
  } finally {
    await releaseLock();
  }
}

export async function registerSession(session: SessionRecord): Promise<void> {
  await withStore(async (store) => {
    const existingIndex = store.sessions.findIndex((s) => s.id === session.id);
    if (existingIndex >= 0) {
      store.sessions[existingIndex] = session;
    } else {
      store.sessions.push(session);
    }
  });
}

export async function getSession(
  sessionId: string,
): Promise<SessionRecord | null> {
  return await withStoreReadOnly(async (store) => {
    return store.sessions.find((s) => s.id === sessionId) ?? null;
  });
}

export async function updateSession(
  sessionId: string,
  patch: Partial<SessionRecord>,
): Promise<SessionRecord | null> {
  return await withStore(async (store) => {
    const index = store.sessions.findIndex((s) => s.id === sessionId);
    if (index < 0) {
      return null;
    }
    const existing = store.sessions[index];
    const updated: SessionRecord = {
      ...existing,
      ...patch,
      last_seen: new Date().toISOString(),
    };
    store.sessions[index] = updated;
    return updated;
  });
}

export async function heartbeatSession(
  sessionId: string,
  status?: SessionStatus,
): Promise<SessionRecord | null> {
  return await updateSession(sessionId, status ? { status } : {});
}

export async function removeSession(sessionId: string): Promise<boolean> {
  return await withStore(async (store) => {
    const before = store.sessions.length;
    store.sessions = store.sessions.filter((s) => s.id !== sessionId);
    return store.sessions.length !== before;
  });
}

/**
 * Kill a session by terminating its process
 */
export async function killSession(sessionId: string): Promise<boolean> {
  return await withStore(async (store) => {
    const index = store.sessions.findIndex((s) => s.id === sessionId);
    if (index < 0) {
      return false;
    }
    
    const session = store.sessions[index];
    try {
      // Terminate the process
      process.kill(session.pid, "SIGTERM");
      
      // Remove from store after killing
      store.sessions.splice(index, 1);
      return true;
    } catch {
      // If process doesn't exist or other error, just remove from store
      store.sessions.splice(index, 1);
      return false;
    }
  });
}

export async function listSessions(): Promise<SessionRecord[]> {
  return await withStoreReadOnly(async (store) => store.sessions.slice());
}

export async function pruneStaleSessions(
  ttlMs: number,
): Promise<SessionRecord[]> {
  const now = Date.now();
  return await withStore(async (store) => {
    const stale: SessionRecord[] = [];
    const keep: SessionRecord[] = [];
    for (const session of store.sessions) {
      const lastSeen = Date.parse(session.last_seen);
      if (Number.isFinite(lastSeen) && now - lastSeen > ttlMs) {
        stale.push(session);
      } else {
        keep.push(session);
      }
    }
    store.sessions = keep;
    return stale;
  });
}
