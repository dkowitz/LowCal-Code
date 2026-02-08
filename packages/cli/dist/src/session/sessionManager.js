/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as path from "node:path";
import process from "node:process";
import { clearSessionHealth, getSessionContextSummary, getSessionHealthView, getSessionRecentHistory, getSessionStatusView, registerSession, updateSession, heartbeatSession, removeSession, getSession, setSessionHealth, Storage, } from "@qwen-code/qwen-code-core";
export const DEFAULT_SESSION_HEARTBEAT_MS = 60 * 1000;
export const DEFAULT_SESSION_TTL_MS = 3 * 60 * 1000;
let registeredSessionId = null;
let heartbeatTimer = null;
let exitHandlersRegistered = false;
let sessionApiServer = null;
let sessionApiSocketPath = null;
let sessionApiAuthToken = null;
let sessionControlHandlers = {};
function requiresAuthToken(method) {
    switch (method) {
        case "session.get_status":
        case "session.get_health":
        case "session.get_context_summary":
        case "session.get_recent_history":
        case "session.cancel_turn":
        case "session.restart_turn":
        case "session.pause":
        case "session.resume":
        case "session.set_model":
        case "session.set_approval_mode":
        case "session.shutdown":
        case "session.request_self_repair":
            return true;
        default:
            return false;
    }
}
function makeActionResult(result) {
    return {
        accepted: result.accepted,
        reason: result.reason,
        action_id: result.action_id ?? `action-${Date.now()}`,
    };
}
function normalizeControlHandlerResult(value) {
    if (typeof value === "boolean") {
        return {
            accepted: value,
            reason: value ? undefined : "handler_rejected",
        };
    }
    if (value &&
        typeof value === "object" &&
        typeof value.accepted === "boolean") {
        return {
            accepted: value.accepted,
            reason: value.reason,
        };
    }
    return {
        accepted: false,
        reason: "invalid_handler_result",
    };
}
async function invokeControlHandler(handler, ...args) {
    if (!handler) {
        return makeUnsupportedControlResult();
    }
    try {
        const result = normalizeControlHandlerResult(await handler(...args));
        return makeActionResult(result);
    }
    catch (error) {
        return makeActionResult({
            accepted: false,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
}
export function setSessionControlHandlers(handlers) {
    sessionControlHandlers = { ...handlers };
}
function getSocketPath(sessionId) {
    if (process.platform === "win32") {
        const hash = crypto
            .createHash("sha256")
            .update(sessionId)
            .digest("hex")
            .slice(0, 16);
        return `\\\\.\\pipe\\lowcal-session-${hash}`;
    }
    const baseDir = path.join(Storage.getGlobalGeminiDir(), "session-api");
    const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = safe.length > 72
        ? `session-${crypto
            .createHash("sha256")
            .update(sessionId)
            .digest("hex")
            .slice(0, 16)}.sock`
        : `${safe}.sock`;
    return path.join(baseDir, fileName);
}
async function stopSessionApiServer() {
    if (!sessionApiServer) {
        return;
    }
    const server = sessionApiServer;
    const socketPath = sessionApiSocketPath;
    await new Promise((resolve) => {
        server.close(() => resolve());
    }).catch(() => { });
    if (socketPath && process.platform !== "win32") {
        await fs.unlink(socketPath).catch(() => { });
    }
    sessionApiServer = null;
    sessionApiSocketPath = null;
    sessionApiAuthToken = null;
}
function makeUnsupportedControlResult() {
    return {
        accepted: false,
        reason: "unsupported_in_v1",
        action_id: `action-${Date.now()}`,
    };
}
async function handleSessionApiRequest(request) {
    const id = request.id;
    if (!request.method) {
        return { id, ok: false, error: "missing method" };
    }
    if (sessionApiAuthToken &&
        requiresAuthToken(request.method) &&
        request.auth_token !== sessionApiAuthToken) {
        return { id, ok: false, error: "unauthorized" };
    }
    if (!registeredSessionId) {
        return { id, ok: false, error: "session is not registered" };
    }
    try {
        switch (request.method) {
            case "session.get_status":
                return {
                    id,
                    ok: true,
                    result: await getSessionStatusView(registeredSessionId),
                };
            case "session.get_health":
                return {
                    id,
                    ok: true,
                    result: await getSessionHealthView(registeredSessionId),
                };
            case "session.get_context_summary":
                return {
                    id,
                    ok: true,
                    result: await getSessionContextSummary(registeredSessionId),
                };
            case "session.get_recent_history": {
                const maxItemsRaw = request.params?.["max_items"];
                const maxCharsRaw = request.params?.["max_chars"];
                const max_items = typeof maxItemsRaw === "number" ? Math.floor(maxItemsRaw) : undefined;
                const max_chars = typeof maxCharsRaw === "number" ? Math.floor(maxCharsRaw) : undefined;
                return {
                    id,
                    ok: true,
                    result: await getSessionRecentHistory(registeredSessionId, {
                        max_items,
                        max_chars,
                    }),
                };
            }
            case "session.resume":
                if (!sessionControlHandlers.resume) {
                    try {
                        process.kill(process.pid, "SIGCONT");
                        return {
                            id,
                            ok: true,
                            result: makeActionResult({ accepted: true }),
                        };
                    }
                    catch (error) {
                        return {
                            id,
                            ok: true,
                            result: makeActionResult({
                                accepted: false,
                                reason: error instanceof Error ? error.message : String(error),
                            }),
                        };
                    }
                }
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.resume),
                };
            case "session.shutdown":
                setTimeout(() => {
                    process.kill(process.pid, "SIGTERM");
                }, 10);
                return {
                    id,
                    ok: true,
                    result: {
                        accepted: true,
                        action_id: `action-${Date.now()}`,
                    },
                };
            case "session.cancel_turn":
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.cancelTurn),
                };
            case "session.restart_turn":
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.restartTurn),
                };
            case "session.pause":
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.pause),
                };
            case "session.set_model": {
                const model = request.params?.["model"];
                if (typeof model !== "string" || model.trim().length === 0) {
                    return {
                        id,
                        ok: true,
                        result: makeActionResult({
                            accepted: false,
                            reason: "invalid_model",
                        }),
                    };
                }
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.setModel, model),
                };
            }
            case "session.set_approval_mode": {
                const mode = request.params?.["mode"];
                if (typeof mode !== "string" || mode.trim().length === 0) {
                    return {
                        id,
                        ok: true,
                        result: makeActionResult({
                            accepted: false,
                            reason: "invalid_approval_mode",
                        }),
                    };
                }
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.setApprovalMode, mode),
                };
            }
            case "session.request_self_repair":
                return {
                    id,
                    ok: true,
                    result: await invokeControlHandler(sessionControlHandlers.requestSelfRepair, request.params),
                };
            default:
                return {
                    id,
                    ok: false,
                    error: `unsupported method: ${request.method}`,
                };
        }
    }
    catch (error) {
        return {
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
async function startSessionApiServer(sessionId, capabilities) {
    if (!(capabilities.observe || capabilities.control || capabilities.interact)) {
        return undefined;
    }
    await stopSessionApiServer();
    const socketPath = getSocketPath(sessionId);
    const authToken = crypto.randomBytes(24).toString("hex");
    if (process.platform !== "win32") {
        await fs.mkdir(path.dirname(socketPath), { recursive: true });
        await fs.unlink(socketPath).catch(() => { });
    }
    const server = net.createServer((socket) => {
        socket.setEncoding("utf8");
        let buffer = "";
        let requestQueue = Promise.resolve();
        socket.on("data", (chunk) => {
            buffer += chunk;
            let newlineIndex = buffer.indexOf("\n");
            while (newlineIndex >= 0) {
                const rawLine = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                newlineIndex = buffer.indexOf("\n");
                if (!rawLine) {
                    continue;
                }
                requestQueue = requestQueue
                    .then(async () => {
                    let request;
                    try {
                        request = JSON.parse(rawLine);
                    }
                    catch {
                        const response = {
                            ok: false,
                            error: "invalid json request",
                        };
                        socket.write(`${JSON.stringify(response)}\n`);
                        return;
                    }
                    const response = await handleSessionApiRequest(request);
                    socket.write(`${JSON.stringify(response)}\n`);
                })
                    .catch(() => { });
            }
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, () => {
            server.off("error", reject);
            resolve();
        });
    });
    sessionApiServer = server;
    sessionApiSocketPath = socketPath;
    sessionApiAuthToken = authToken;
    return {
        transport: process.platform === "win32" ? "tcp" : "unix",
        address: socketPath,
        version: "v1",
        auth_token: authToken,
    };
}
function registerExitHandlers() {
    if (exitHandlersRegistered)
        return;
    exitHandlersRegistered = true;
    const cleanup = async () => {
        if (!registeredSessionId)
            return;
        await stopSessionApiServer();
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
        await stopSessionApiServer();
        await removeSession(registeredSessionId);
    }
    registeredSessionId = options.id;
    const capabilities = options.capabilities ?? {
        observe: true,
        control: false,
        interact: false,
    };
    let endpoint = options.api;
    if (!endpoint) {
        try {
            endpoint = await startSessionApiServer(options.id, capabilities);
        }
        catch {
            endpoint = undefined;
        }
    }
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
        capabilities,
        api: endpoint,
        health: {
            state: options.health?.state ?? "ok",
            reason: options.health?.reason,
            confidence: options.health?.confidence ?? 1,
            first_seen: now,
            last_seen: now,
            evidence: options.health?.evidence,
            remediation: options.health?.remediation,
        },
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
    await stopSessionApiServer();
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
export async function setRegisteredSessionHealth(input) {
    if (!registeredSessionId)
        return;
    await setSessionHealth(registeredSessionId, input);
}
export async function clearRegisteredSessionHealth() {
    if (!registeredSessionId)
        return;
    await clearSessionHealth(registeredSessionId);
}
export function getRegisteredSessionId() {
    return registeredSessionId;
}
//# sourceMappingURL=sessionManager.js.map