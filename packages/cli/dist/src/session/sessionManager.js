/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { registerSession, updateSession, heartbeatSession, removeSession, getSession, } from "@qwen-code/qwen-code-core";
export const DEFAULT_SESSION_HEARTBEAT_MS = 60 * 1000;
export const DEFAULT_SESSION_TTL_MS = 3 * 60 * 1000;
let registeredSessionId = null;
let heartbeatTimer = null;
let exitHandlersRegistered = false;
function registerExitHandlers() {
    if (exitHandlersRegistered)
        return;
    exitHandlersRegistered = true;
    const cleanup = async () => {
        if (!registeredSessionId)
            return;
        await removeSession(registeredSessionId);
    };
    process.on("exit", () => {
        void cleanup();
    });
    process.on("SIGINT", () => {
        void cleanup().finally(() => process.exit(0));
    });
    process.on("SIGTERM", () => {
        void cleanup().finally(() => process.exit(0));
    });
}
export async function startSessionRegistration(options) {
    if (registeredSessionId && registeredSessionId !== options.id) {
        await removeSession(registeredSessionId);
    }
    registeredSessionId = options.id;
    const now = new Date().toISOString();
    const session = {
        id: options.id,
        pid: options.pid ?? process.pid,
        mode: options.mode,
        cwd: options.cwd ?? process.cwd(),
        started_at: now,
        last_seen: now,
        status: options.status ?? "idle",
        details: options.details,
    };
    await registerSession(session);
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
    }
    const interval = options.heartbeatIntervalMs ?? DEFAULT_SESSION_HEARTBEAT_MS;
    heartbeatTimer = setInterval(() => {
        if (!registeredSessionId)
            return;
        void heartbeatSession(registeredSessionId);
    }, interval);
    heartbeatTimer.unref?.();
    registerExitHandlers();
}
export async function stopSessionRegistration() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    if (registeredSessionId) {
        await removeSession(registeredSessionId);
    }
    registeredSessionId = null;
}
export async function setSessionStatus(status, details) {
    if (!registeredSessionId)
        return;
    const patch = { status };
    if (details) {
        patch.details = details;
    }
    await updateSession(registeredSessionId, patch);
}
export async function updateSessionDetails(details) {
    if (!registeredSessionId)
        return;
    const current = await getSession(registeredSessionId);
    const mergedDetails = {
        ...(current?.details ?? {}),
        ...details,
    };
    await updateSession(registeredSessionId, { details: mergedDetails });
}
export function getRegisteredSessionId() {
    return registeredSessionId;
}
//# sourceMappingURL=sessionManager.js.map