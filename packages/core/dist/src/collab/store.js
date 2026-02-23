/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
export const COLLAB_MAX_TEXT_CHARS = 600;
export const COLLAB_MAX_REFS = 8;
export const COLLAB_MAX_TYPE_CHARS = 48;
export const COLLAB_MAX_SESSION_ID_CHARS = 160;
export const COLLAB_MAX_TTL_SECONDS = 60 * 60 * 24 * 7;
export const COLLAB_NOTIFY_MODES = [
    "passive",
    "wake_view",
    "wake_prompt",
];
const DEFAULT_READ_LIMIT = 20;
const MAX_READ_LIMIT = 200;
const COLLAB_NOTIFY_MODE_SET = new Set(COLLAB_NOTIFY_MODES);
const LOCK_BACKOFF_MS = [80, 200, 450];
const LOCK_LEASE_MS = 10_000;
export const collabEvents = new EventEmitter();
export function getCollabPaths(baseDir) {
    const collabDir = path.join(baseDir, ".lowcal", "collab");
    return {
        collabDir,
        messagesPath: path.join(collabDir, "messages.jsonl"),
        metaPath: path.join(collabDir, "meta.json"),
        lockPath: path.join(collabDir, "messages.lock"),
        notifyPath: path.join(collabDir, "notify.json"),
    };
}
function normalizeSessionId(value, fieldName) {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(`${fieldName} cannot be empty.`);
    }
    if (normalized.length > COLLAB_MAX_SESSION_ID_CHARS) {
        throw new Error(`${fieldName} exceeds ${COLLAB_MAX_SESSION_ID_CHARS} characters.`);
    }
    return normalized;
}
function normalizeType(type) {
    const normalized = (type ?? "note").trim();
    if (!normalized) {
        return "note";
    }
    if (normalized.length > COLLAB_MAX_TYPE_CHARS) {
        throw new Error(`type exceeds ${COLLAB_MAX_TYPE_CHARS} characters.`);
    }
    return normalized;
}
function normalizeText(text) {
    const normalized = text.trim();
    if (!normalized) {
        throw new Error("text cannot be empty.");
    }
    if (normalized.length > COLLAB_MAX_TEXT_CHARS) {
        throw new Error(`text exceeds ${COLLAB_MAX_TEXT_CHARS} characters. Write larger content to a file and reference it with refs.`);
    }
    return normalized;
}
function normalizeRefs(refs) {
    if (!refs || refs.length === 0) {
        return undefined;
    }
    const normalized = Array.from(new Set(refs.map((entry) => entry.trim()).filter((entry) => entry.length > 0)));
    if (normalized.length > COLLAB_MAX_REFS) {
        throw new Error(`refs cannot exceed ${COLLAB_MAX_REFS} entries.`);
    }
    return normalized.length > 0 ? normalized : undefined;
}
function normalizeTtlSeconds(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!Number.isFinite(value)) {
        throw new Error("ttl_seconds must be a finite number.");
    }
    const normalized = Math.floor(value);
    if (normalized < 1) {
        throw new Error("ttl_seconds must be >= 1.");
    }
    if (normalized > COLLAB_MAX_TTL_SECONDS) {
        throw new Error(`ttl_seconds cannot exceed ${COLLAB_MAX_TTL_SECONDS} seconds.`);
    }
    return normalized;
}
function normalizeNotify(value) {
    if (value === undefined) {
        return "passive";
    }
    if (typeof value !== "string") {
        throw new Error(`notify must be one of: ${COLLAB_NOTIFY_MODES.join(", ")}.`);
    }
    const normalized = value.trim();
    if (!COLLAB_NOTIFY_MODE_SET.has(normalized)) {
        throw new Error(`notify must be one of: ${COLLAB_NOTIFY_MODES.join(", ")}.`);
    }
    return normalized;
}
async function delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
function parseJsonLine(line) {
    try {
        return JSON.parse(line);
    }
    catch {
        return undefined;
    }
}
async function readLockFile(lockPath) {
    try {
        const raw = await fs.readFile(lockPath, "utf-8");
        return parseJsonLine(raw.trim()) ?? null;
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code === "ENOENT") {
            return null;
        }
        return null;
    }
}
function isExpired(lock, nowMs) {
    const expiresMs = Date.parse(lock.expires_at);
    if (!Number.isFinite(expiresMs)) {
        return true;
    }
    return expiresMs <= nowMs;
}
async function tryRemoveExpiredLock(lockPath, nowMs) {
    const current = await readLockFile(lockPath);
    if (!current || !isExpired(current, nowMs)) {
        return false;
    }
    await fs.unlink(lockPath).catch(() => { });
    return true;
}
async function writeLockFile(lockPath, lockData) {
    const fd = await fs.open(lockPath, "wx");
    try {
        await fd.writeFile(`${JSON.stringify(lockData)}\n`, "utf-8");
        await fd.sync();
    }
    finally {
        await fd.close();
    }
}
async function acquireCollabLock(lockPath) {
    for (let attempt = 0; attempt < LOCK_BACKOFF_MS.length; attempt += 1) {
        const now = Date.now();
        const lockData = {
            owner: `${process.pid}:${randomUUID().slice(0, 8)}`,
            acquired_at: new Date(now).toISOString(),
            expires_at: new Date(now + LOCK_LEASE_MS).toISOString(),
        };
        try {
            await writeLockFile(lockPath, lockData);
            return;
        }
        catch (error) {
            const nodeError = error;
            if (nodeError?.code !== "EEXIST") {
                throw error;
            }
            const removedExpiredLock = await tryRemoveExpiredLock(lockPath, now);
            if (removedExpiredLock) {
                attempt -= 1;
                continue;
            }
            if (attempt >= LOCK_BACKOFF_MS.length - 1) {
                const existingLock = await readLockFile(lockPath);
                const owner = existingLock?.owner ?? "unknown";
                const acquiredAt = existingLock?.acquired_at ?? "unknown";
                throw new Error(`Unable to acquire collab lock after ${LOCK_BACKOFF_MS.length} attempts (owner=${owner}, acquired_at=${acquiredAt}).`);
            }
            const jitter = Math.floor(Math.random() * 40);
            await delay(LOCK_BACKOFF_MS[attempt] + jitter);
        }
    }
}
async function releaseCollabLock(lockPath) {
    await fs.unlink(lockPath).catch(() => { });
}
function parseMessageLines(raw) {
    return raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => parseJsonLine(line))
        .filter((message) => message !== undefined);
}
async function readMessagesFile(messagesPath) {
    try {
        const raw = await fs.readFile(messagesPath, "utf-8");
        return parseMessageLines(raw);
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}
async function readMeta(metaPath) {
    try {
        const raw = await fs.readFile(metaPath, "utf-8");
        const parsed = parseJsonLine(raw.trim());
        return parsed ?? {};
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code === "ENOENT") {
            return {};
        }
        return {};
    }
}
async function getNextSequence(messagesPath, metaPath) {
    const meta = await readMeta(metaPath);
    if (typeof meta.last_seq === "number" && Number.isFinite(meta.last_seq)) {
        return Math.max(1, Math.floor(meta.last_seq) + 1);
    }
    const messages = await readMessagesFile(messagesPath);
    const maxSeq = messages.reduce((max, message) => {
        if (!Number.isFinite(message.seq)) {
            return max;
        }
        return Math.max(max, Math.floor(message.seq));
    }, 0);
    return maxSeq + 1;
}
async function appendWithSync(filePath, line) {
    const fd = await fs.open(filePath, "a");
    try {
        await fd.appendFile(line, "utf-8");
        await fd.sync();
    }
    finally {
        await fd.close();
    }
}
function isMessageExpired(message, nowMs) {
    if (typeof message.ttl_seconds !== "number") {
        return false;
    }
    const timestampMs = Date.parse(message.timestamp);
    if (!Number.isFinite(timestampMs)) {
        return false;
    }
    return timestampMs + message.ttl_seconds * 1000 <= nowMs;
}
function normalizeLimit(value) {
    if (value === undefined || !Number.isFinite(value)) {
        return DEFAULT_READ_LIMIT;
    }
    const normalized = Math.floor(value);
    if (normalized < 1) {
        return 1;
    }
    return Math.min(MAX_READ_LIMIT, normalized);
}
export async function postCollabMessage(input) {
    const fromSessionId = normalizeSessionId(input.fromSessionId, "from_session_id");
    const toSessionId = input.toSessionId
        ? normalizeSessionId(input.toSessionId, "to_session_id")
        : undefined;
    const type = normalizeType(input.type);
    const text = normalizeText(input.text);
    const refs = normalizeRefs(input.refs);
    const inReplyTo = input.inReplyTo && input.inReplyTo.trim().length > 0
        ? input.inReplyTo.trim()
        : undefined;
    const ttlSeconds = normalizeTtlSeconds(input.ttlSeconds);
    const notify = normalizeNotify(input.notify);
    const paths = getCollabPaths(input.baseDir);
    await fs.mkdir(paths.collabDir, { recursive: true });
    await acquireCollabLock(paths.lockPath);
    try {
        const seq = await getNextSequence(paths.messagesPath, paths.metaPath);
        const timestamp = new Date().toISOString();
        const message = {
            message_id: `${seq}-${randomUUID().slice(0, 8)}`,
            seq,
            timestamp,
            from_session_id: fromSessionId,
            to_session_id: toSessionId,
            type,
            text,
            refs,
            in_reply_to: inReplyTo,
            ttl_seconds: ttlSeconds,
            notify,
            source: input.source,
        };
        await appendWithSync(paths.messagesPath, `${JSON.stringify(message)}\n`);
        const meta = {
            last_seq: seq,
            updated_at: timestamp,
        };
        await fs.writeFile(paths.metaPath, `${JSON.stringify(meta)}\n`, "utf-8");
        await fs.writeFile(paths.notifyPath, `${JSON.stringify({
            updated_at: timestamp,
            last_seq: seq,
            message_id: message.message_id,
        })}\n`, "utf-8");
        collabEvents.emit("updated", {
            seq,
            messageId: message.message_id,
            timestamp,
        });
        return {
            message,
            notifyPath: paths.notifyPath,
        };
    }
    finally {
        await releaseCollabLock(paths.lockPath);
    }
}
export async function readCollabMessages(baseDir, options = {}) {
    const paths = getCollabPaths(baseDir);
    const limit = normalizeLimit(options.limit);
    const sinceSeq = typeof options.sinceSeq === "number" && Number.isFinite(options.sinceSeq)
        ? Math.max(0, Math.floor(options.sinceSeq))
        : 0;
    const targetSessionId = options.sessionId && options.sessionId.trim().length > 0
        ? options.sessionId.trim()
        : undefined;
    const nowMs = Date.now();
    const all = await readMessagesFile(paths.messagesPath);
    const filtered = all
        .filter((message) => {
        if (!Number.isFinite(message.seq) || message.seq <= sinceSeq) {
            return false;
        }
        if (!options.includeExpired && isMessageExpired(message, nowMs)) {
            return false;
        }
        if (!targetSessionId) {
            return true;
        }
        if (!message.to_session_id || message.to_session_id === "all") {
            return true;
        }
        return message.to_session_id === targetSessionId;
    })
        .sort((a, b) => a.seq - b.seq);
    if (filtered.length <= limit) {
        return filtered;
    }
    return filtered.slice(filtered.length - limit);
}
//# sourceMappingURL=store.js.map