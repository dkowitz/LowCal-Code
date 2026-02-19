/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getSession, } from "@qwen-code/qwen-code-core";
import { setSessionControlHandlers, setSessionStatus, startSessionRegistration, stopSessionRegistration, updateSessionDetails, } from "../session/sessionManager.js";
const TEAM_AGENT_DIR = path.join(".lowcal", "team-agents");
const TEAM_AGENT_LOG_DIR = path.join(TEAM_AGENT_DIR, "logs");
const HEADLESS_RELATIVE_PATH = path.join("..", "scheduler", "headless.js");
const ENV_TASK_RUNTIME_B64 = "LOWCAL_TASK_RUNTIME_B64";
const ENV_DISABLE_LAUNCH_TASK = "LOWCAL_DISABLE_LAUNCH_TASK";
function sanitizeId(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function resolvePidPath(baseDir, sessionId) {
    return path.join(baseDir, TEAM_AGENT_DIR, `${sanitizeId(sessionId)}.pid`);
}
function resolveStatusPath(baseDir, sessionId) {
    return path.join(baseDir, TEAM_AGENT_DIR, `${sanitizeId(sessionId)}.status.json`);
}
function parseArgs(argv) {
    const parsed = { daemon: false };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        switch (token) {
            case "--daemon":
                parsed.daemon = true;
                break;
            case "--base-dir":
                parsed.baseDir = argv[index + 1];
                index += 1;
                break;
            case "--session-id":
                parsed.sessionId = argv[index + 1];
                index += 1;
                break;
            case "--team-id":
                parsed.teamId = argv[index + 1];
                index += 1;
                break;
            case "--agent-id":
                parsed.agentId = argv[index + 1];
                index += 1;
                break;
            case "--role":
                parsed.role = argv[index + 1];
                index += 1;
                break;
            case "--model":
                parsed.model = argv[index + 1];
                index += 1;
                break;
            case "--instructions-b64": {
                const encoded = argv[index + 1];
                index += 1;
                if (encoded && encoded.trim().length > 0) {
                    try {
                        parsed.instructions = Buffer.from(encoded, "base64").toString("utf-8");
                    }
                    catch {
                        parsed.instructions = undefined;
                    }
                }
                break;
            }
            default:
                break;
        }
    }
    return parsed;
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
async function writeRuntimeFile(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, value, "utf-8");
}
async function writePidFile(baseDir, sessionId) {
    await writeRuntimeFile(resolvePidPath(baseDir, sessionId), String(process.pid));
}
async function removeRuntimeFiles(baseDir, sessionId) {
    await fs.unlink(resolvePidPath(baseDir, sessionId)).catch(() => { });
    await fs.unlink(resolveStatusPath(baseDir, sessionId)).catch(() => { });
}
async function isTeamAgentRunning(baseDir, sessionId) {
    const pidPath = resolvePidPath(baseDir, sessionId);
    try {
        const pidRaw = await fs.readFile(pidPath, "utf-8");
        const pid = Number.parseInt(pidRaw.trim(), 10);
        if (Number.isFinite(pid) && isProcessAlive(pid)) {
            return true;
        }
        await fs.unlink(pidPath).catch(() => { });
    }
    catch {
        // ignore
    }
    const session = await getSession(sessionId);
    return Boolean(session && session.mode === "team_agent");
}
async function persistStatus(baseDir, sessionId, status) {
    const statusPath = resolveStatusPath(baseDir, sessionId);
    await writeRuntimeFile(statusPath, JSON.stringify(status, null, 2));
}
function resolveHeadlessPath() {
    return fileURLToPath(new URL(HEADLESS_RELATIVE_PATH, import.meta.url));
}
async function appendMailboxFallbackMessage(baseDir, payload, errorMessage, sessionId) {
    if (!payload.return_to_session_id) {
        return;
    }
    const mailboxPath = path.join(baseDir, ".lowcal", "session-messages", `${payload.return_to_session_id}.jsonl`);
    const message = {
        to_session_id: payload.return_to_session_id,
        from_session_id: sessionId,
        from_task_id: payload.task_id,
        job_id: payload.task_id,
        status: "error",
        timestamp: new Date().toISOString(),
        prompt_preview: payload.action_value.trim().slice(0, 400),
        preview: errorMessage.slice(0, 1200),
        output_path: "",
        return_payload: errorMessage.slice(0, 1200),
    };
    await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
    await fs.appendFile(mailboxPath, `${JSON.stringify(message)}\n`, "utf-8");
}
function buildRuntimeProfile(payload) {
    return payload.runtime_profile ?? {
        run: { returnToSession: payload.return_to_session_id },
    };
}
async function runTeamAgentDaemon(options) {
    const { baseDir, sessionId, teamId, agentId, role, model, instructions } = options;
    const startedAt = new Date().toISOString();
    const taskQueue = [];
    let activeTask;
    let activeChild;
    let shuttingDown = false;
    const updateStatus = async () => {
        const nowIso = new Date().toISOString();
        await updateSessionDetails({
            team_id: teamId,
            agent_id: agentId,
            role,
            model,
            phase: activeTask ? "working" : "idle",
            queue_depth: taskQueue.length,
            active_task_id: activeTask?.task_id,
            instructions: instructions ? instructions.slice(0, 2000) : undefined,
        });
        await setSessionStatus(activeTask ? "working" : "idle");
        await persistStatus(baseDir, sessionId, {
            running: true,
            pid: process.pid,
            session_id: sessionId,
            team_id: teamId,
            agent_id: agentId,
            role,
            model,
            queue_depth: taskQueue.length,
            active_task_id: activeTask?.task_id,
            started_at: startedAt,
            updated_at: nowIso,
        });
    };
    const runTask = async (payload) => {
        activeTask = payload;
        await updateStatus();
        const runtimeProfile = buildRuntimeProfile(payload);
        const headlessPath = resolveHeadlessPath();
        const logPath = path.join(baseDir, TEAM_AGENT_LOG_DIR, `${sanitizeId(sessionId)}-${sanitizeId(payload.task_id)}-${Date.now()}.json`);
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        const encodedRuntime = Buffer.from(JSON.stringify({
            ...runtimeProfile,
            ...(model ? { model: { ...(runtimeProfile.model ?? {}), name: model } } : {}),
        })).toString("base64");
        await new Promise((resolve) => {
            const child = spawn("node", [
                headlessPath,
                "--prompt",
                payload.action_value,
                "--job-id",
                payload.task_id,
                "--output",
                logPath,
            ], {
                stdio: "ignore",
                cwd: baseDir,
                env: {
                    ...process.env,
                    LOWCAL_HEADLESS: "1",
                    LOWCAL_JOB_ID: payload.task_id,
                    LOWCAL_RETURN_TO_SESSION_ID: payload.return_to_session_id,
                    LOWCAL_RETURN_FROM_TASK_ID: payload.task_id,
                    LOWCAL_RETURN_MAILBOX_PATH: payload.return_to_session_id
                        ? path.join(baseDir, ".lowcal", "session-messages", `${payload.return_to_session_id}.jsonl`)
                        : undefined,
                    [ENV_TASK_RUNTIME_B64]: encodedRuntime,
                    [ENV_DISABLE_LAUNCH_TASK]: "1",
                },
            });
            activeChild = child;
            child.on("close", async () => {
                activeChild = undefined;
                resolve();
            });
            child.on("error", async (error) => {
                const message = error instanceof Error ? error.message : String(error);
                await appendMailboxFallbackMessage(baseDir, payload, `Team agent spawn failed: ${message}`, sessionId);
                activeChild = undefined;
                resolve();
            });
        });
    };
    const drainQueue = async () => {
        if (shuttingDown || activeTask || taskQueue.length === 0) {
            return;
        }
        const next = taskQueue.shift();
        if (!next) {
            return;
        }
        try {
            await runTask(next);
        }
        finally {
            activeTask = undefined;
            await updateStatus();
            if (taskQueue.length > 0) {
                void drainQueue();
            }
        }
    };
    const enqueueTask = async (payload) => {
        if (typeof payload.task_id !== "string" ||
            payload.task_id.trim().length === 0 ||
            typeof payload.action_value !== "string" ||
            payload.action_value.trim().length === 0) {
            return {
                accepted: false,
                reason: "invalid_task_payload",
            };
        }
        if (payload.action_type !== "prompt" &&
            payload.action_type !== "slash_command") {
            return {
                accepted: false,
                reason: `unsupported_action_type:${payload.action_type}`,
            };
        }
        taskQueue.push(payload);
        await updateStatus();
        if (!activeTask) {
            void drainQueue();
        }
        return { accepted: true };
    };
    setSessionControlHandlers({
        enqueueTask,
        cancelTurn: async () => {
            if (!activeChild || !activeTask) {
                return { accepted: false, reason: "no_active_task" };
            }
            try {
                activeChild.kill("SIGTERM");
                taskQueue.unshift(activeTask);
                return { accepted: true };
            }
            catch (error) {
                return {
                    accepted: false,
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
        },
        restartTurn: async () => {
            if (!activeTask) {
                return { accepted: false, reason: "no_active_task" };
            }
            taskQueue.unshift(activeTask);
            if (activeChild) {
                activeChild.kill("SIGTERM");
            }
            return { accepted: true };
        },
        resume: async () => ({ accepted: true }),
        requestSelfRepair: async () => ({ accepted: true }),
    });
    await startSessionRegistration({
        id: sessionId,
        mode: "team_agent",
        status: "idle",
        details: {
            team_id: teamId,
            agent_id: agentId,
            role,
            model,
            instructions: instructions ? instructions.slice(0, 2000) : undefined,
            phase: "idle",
            queue_depth: 0,
        },
        capabilities: {
            observe: true,
            control: true,
            interact: false,
        },
        cwd: baseDir,
    });
    await writePidFile(baseDir, sessionId);
    await updateStatus();
    const statusTimer = setInterval(() => {
        void updateStatus();
    }, 10000);
    statusTimer.unref();
    const shutdown = async () => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        clearInterval(statusTimer);
        if (activeChild) {
            try {
                activeChild.kill("SIGTERM");
            }
            catch {
                // ignore
            }
        }
        setSessionControlHandlers({});
        await stopSessionRegistration();
        await removeRuntimeFiles(baseDir, sessionId);
    };
    process.on("SIGTERM", () => {
        void shutdown().finally(() => process.exit(0));
    });
    process.on("SIGINT", () => {
        void shutdown().finally(() => process.exit(0));
    });
    process.on("exit", () => {
        void shutdown();
    });
}
export async function startTeamAgentDaemon(options) {
    if (await isTeamAgentRunning(options.baseDir, options.sessionId)) {
        return true;
    }
    const daemonPath = fileURLToPath(import.meta.url);
    const instructionsB64 = options.instructions
        ? Buffer.from(options.instructions, "utf-8").toString("base64")
        : undefined;
    const args = [
        daemonPath,
        "--daemon",
        "--base-dir",
        options.baseDir,
        "--session-id",
        options.sessionId,
        "--team-id",
        options.teamId,
        "--agent-id",
        options.agentId,
        "--role",
        options.role,
    ];
    if (options.model) {
        args.push("--model", options.model);
    }
    if (instructionsB64) {
        args.push("--instructions-b64", instructionsB64);
    }
    const child = spawn("node", args, {
        detached: true,
        stdio: "ignore",
        env: process.env,
        cwd: options.baseDir,
    });
    child.unref();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return await isTeamAgentRunning(options.baseDir, options.sessionId);
}
export async function stopTeamAgentDaemon(baseDir, sessionId) {
    let stopped = false;
    const pidPath = resolvePidPath(baseDir, sessionId);
    try {
        const pidRaw = await fs.readFile(pidPath, "utf-8");
        const pid = Number.parseInt(pidRaw.trim(), 10);
        if (Number.isFinite(pid)) {
            try {
                process.kill(pid, "SIGTERM");
                stopped = true;
            }
            catch {
                // ignore
            }
        }
    }
    catch {
        // ignore
    }
    const session = await getSession(sessionId);
    if (session && session.mode === "team_agent") {
        try {
            process.kill(session.pid, "SIGTERM");
            stopped = true;
        }
        catch {
            // ignore
        }
    }
    await removeRuntimeFiles(baseDir, sessionId);
    return stopped;
}
export function getDefaultTeamAgentSessionId(teamId, agentId) {
    return `team-agent-${sanitizeId(teamId)}-${sanitizeId(agentId)}`;
}
const isMainModule = !!process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
    const args = parseArgs(process.argv.slice(2));
    if (args.daemon) {
        if (!args.baseDir ||
            !args.sessionId ||
            !args.teamId ||
            !args.agentId ||
            !args.role) {
            console.error("Usage: node agent-daemon.js --daemon --base-dir <dir> --session-id <id> --team-id <id> --agent-id <id> --role <role> [--model <model>] [--instructions-b64 <base64>]");
            process.exit(1);
        }
        runTeamAgentDaemon({
            baseDir: args.baseDir,
            sessionId: args.sessionId,
            teamId: args.teamId,
            agentId: args.agentId,
            role: args.role,
            model: args.model,
            instructions: args.instructions,
        }).catch((error) => {
            console.error("[TeamAgent] daemon failed:", error);
            process.exit(1);
        });
    }
    else {
        console.log("Usage: node agent-daemon.js --daemon <options>");
    }
}
//# sourceMappingURL=agent-daemon.js.map