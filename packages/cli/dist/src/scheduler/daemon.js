/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * LowCal Scheduler Daemon
 *
 * This daemon runs as a background process and:
 * 1. Wakes up every minute to check for due jobs
 * 2. Executes due jobs by spawning headless LowCal instances
 * 3. Manages job state and logs
 * 4. Handles cleanup and maintenance
 */
import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import * as process from "process";
import { fileURLToPath } from "url";
import { loadSettings } from "../config/settings.js";
import { startSessionRegistration, setSessionStatus, updateSessionDetails, } from "../session/sessionManager.js";
// Import from core package
import { loadStore, getDueJobs, markJobRunning, markJobCompleted, markJobFailed, saveExecutionLog, cleanupOldLogs, updateJob, calculateNextRun, DEFAULT_SCHEDULER_CONFIG, } from "@qwen-code/qwen-code-core";
// PID file for daemon management
const DAEMON_PID_FILE = path.join(process.cwd(), ".lowcal", "scheduler.pid");
const DAEMON_STATUS_FILE = path.join(process.cwd(), ".lowcal", "scheduler.status.json");
// Track active executions
const activeExecutions = new Map();
const zellijTabs = new Set();
const zellijPreparedTabs = new Set();
const EXECUTION_MODE_FALLBACK = "headless";
const EXECUTION_MODE_VALUES = new Set([
    "headless",
    "zellij_tab",
]);
let cachedDefaultExecutionMode = null;
function normalizeExecutionMode(value) {
    if (typeof value !== "string")
        return null;
    if (EXECUTION_MODE_VALUES.has(value)) {
        return value;
    }
    return null;
}
function getSchedulerCwd() {
    return process.env["LOWCAL_SCHEDULER_CWD"] || process.cwd();
}
function isRunningInZellij() {
    return Boolean(process.env["ZELLIJ_SESSION_NAME"] ||
        process.env["ZELLIJ_PANE_ID"] ||
        process.env["ZELLIJ"]);
}
async function getDefaultExecutionMode() {
    if (cachedDefaultExecutionMode)
        return cachedDefaultExecutionMode;
    try {
        const settings = loadSettings(process.cwd());
        if (settings.errors.length > 0) {
            console.warn("[Scheduler] Settings errors:", settings.errors.map((error) => error.message).join(", "));
        }
        const modeFromSettings = normalizeExecutionMode(settings.merged.scheduler?.executionMode);
        cachedDefaultExecutionMode = modeFromSettings ?? EXECUTION_MODE_FALLBACK;
        return cachedDefaultExecutionMode;
    }
    catch (error) {
        console.warn("[Scheduler] Failed to load scheduler settings, falling back to headless mode:", error instanceof Error ? error.message : String(error));
        cachedDefaultExecutionMode = EXECUTION_MODE_FALLBACK;
        return cachedDefaultExecutionMode;
    }
}
async function resolveExecutionMode(job) {
    const defaultMode = await getDefaultExecutionMode();
    const requestedMode = normalizeExecutionMode(job.execution_mode);
    const effectiveMode = requestedMode ?? defaultMode;
    if (effectiveMode === "zellij_tab" && !isRunningInZellij()) {
        console.warn(`[Scheduler] Job ${job.id} requested zellij_tab, but Zellij is not available. Falling back to headless.`);
        return "headless";
    }
    return effectiveMode;
}
/**
 * Save daemon status to file
 */
async function saveDaemonStatus(status) {
    await fs.mkdir(path.dirname(DAEMON_STATUS_FILE), { recursive: true });
    await fs.writeFile(DAEMON_STATUS_FILE, JSON.stringify(status, null, 2), "utf-8");
}
/**
 * Check if the daemon is already running
 */
export async function isDaemonRunning() {
    try {
        const pid = parseInt(await fs.readFile(DAEMON_PID_FILE, "utf-8"), 10);
        if (isNaN(pid))
            return false;
        // Check if process exists
        try {
            process.kill(pid, 0);
            return true;
        }
        catch {
            // Process doesn't exist, clean up stale PID file
            await fs.unlink(DAEMON_PID_FILE).catch(() => { });
            return false;
        }
    }
    catch {
        return false;
    }
}
/**
 * Get current daemon status
 */
export async function getDaemonStatus() {
    const running = await isDaemonRunning();
    const store = await loadStore();
    // Get upcoming jobs (next 5 minutes)
    const now = new Date();
    const upcomingJobs = store.jobs
        .filter((j) => j.enabled && j.next_run && new Date(j.next_run) > now)
        .sort((a, b) => new Date(a.next_run).getTime() - new Date(b.next_run).getTime())
        .slice(0, 10)
        .map((j) => j.id);
    // Read the status file to get last_tick
    let lastTick;
    if (running) {
        try {
            const statusData = await fs.readFile(DAEMON_STATUS_FILE, "utf-8");
            const savedStatus = JSON.parse(statusData);
            lastTick = savedStatus.last_tick;
        }
        catch {
            // Status file doesn't exist or is invalid
        }
    }
    const status = {
        running,
        pid: running
            ? parseInt(await fs.readFile(DAEMON_PID_FILE, "utf-8"), 10)
            : undefined,
        last_tick: lastTick,
        active_executions: activeExecutions.size,
        total_jobs: store.jobs.length,
        upcoming_jobs: upcomingJobs,
    };
    return status;
}
/**
 * Spawn a headless LowCal process to execute a job
 */
function spawnHeadlessJob(job) {
    return new Promise((resolve) => {
        const startedAt = new Date().toISOString();
        const schedulerCwd = getSchedulerCwd();
        const logPath = path.join(schedulerCwd, ".lowcal", "logs", `${job.id}-${Date.now()}.log`);
        // Ensure logs directory exists
        fs.mkdir(path.dirname(logPath), { recursive: true }).catch(() => { });
        // Find the CLI entry point
        const cliPath = path.join(schedulerCwd, "packages", "cli", "dist", "src", "scheduler", "headless.js");
        const child = spawn("node", [
            cliPath,
            "--prompt",
            job.prompt,
            "--job-id",
            job.id,
            "--output",
            logPath,
        ], {
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
            cwd: schedulerCwd,
            env: {
                ...process.env,
                LOWCAL_HEADLESS: "1",
                LOWCAL_JOB_ID: job.id,
            },
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (data) => {
            stdout += data.toString();
        });
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        // Set up timeout
        const timeoutMs = (job.timeout_minutes ??
            DEFAULT_SCHEDULER_CONFIG.default_timeout_minutes) *
            60 *
            1000;
        const timeoutId = setTimeout(() => {
            child.kill("SIGTERM");
        }, timeoutMs);
        child.on("close", async (code, signal) => {
            clearTimeout(timeoutId);
            const completedAt = new Date().toISOString();
            let status;
            let error = null;
            if (signal === "SIGTERM") {
                status = "timeout";
                error = `Job timed out after ${job.timeout_minutes ?? DEFAULT_SCHEDULER_CONFIG.default_timeout_minutes} minutes`;
            }
            else if (code !== 0) {
                status = "error";
                error = stderr || `Process exited with code ${code}`;
            }
            else {
                status = "success";
            }
            const result = {
                job_id: job.id,
                started_at: startedAt,
                completed_at: completedAt,
                status,
                output: stdout,
                error,
                exit_code: code ?? undefined,
            };
            // Save execution log
            await saveExecutionLog(result);
            resolve(result);
        });
        child.on("error", async (err) => {
            clearTimeout(timeoutId);
            const completedAt = new Date().toISOString();
            const result = {
                job_id: job.id,
                started_at: startedAt,
                completed_at: completedAt,
                status: "error",
                output: stdout,
                error: err.message,
            };
            await saveExecutionLog(result);
            resolve(result);
        });
    });
}
async function runZellijCommand(args) {
    await new Promise((resolve, reject) => {
        const child = spawn("zellij", args, {
            stdio: ["ignore", "ignore", "pipe"],
            env: process.env,
        });
        let stderr = "";
        child.stderr?.on("data", (data) => {
            stderr += data.toString();
        });
        child.on("error", (error) => {
            reject(error);
        });
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(stderr.trim() || `zellij command failed with exit code ${code}`));
            }
        });
    });
}
async function ensureZellijTab(tabName, cwd) {
    if (!zellijTabs.has(tabName)) {
        try {
            await runZellijCommand([
                "action",
                "new-tab",
                "--name",
                tabName,
                "--cwd",
                cwd,
            ]);
            zellijTabs.add(tabName);
        }
        catch {
            // If the tab already exists, fall through and try to focus it.
        }
    }
    try {
        await runZellijCommand(["action", "go-to-tab-name", tabName]);
        zellijTabs.add(tabName);
    }
    catch {
        // If we can't focus the tab, we'll still attempt to write to the current one.
    }
    if (!zellijPreparedTabs.has(tabName)) {
        try {
            await runZellijCommand(["action", "go-to-tab-name", tabName]);
            await runZellijCommand([
                "action",
                "write-chars",
                "export PS1=''; unset PROMPT_COMMAND; stty -echo\n",
            ]);
            zellijPreparedTabs.add(tabName);
        }
        catch {
            // Ignore preparation failures; it only affects prompt appearance.
        }
    }
}
function shellQuoteArg(value) {
    if (value.length === 0) {
        return "''";
    }
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}
async function waitForHeadlessLog(logPath, startedAt, timeoutMs, jobId) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            const data = await fs.readFile(logPath, "utf-8");
            const parsed = JSON.parse(data);
            if (parsed.status === "success") {
                return {
                    job_id: jobId,
                    started_at: startedAt,
                    completed_at: parsed.timestamp ?? new Date().toISOString(),
                    status: "success",
                    output: parsed.result ?? "",
                    error: null,
                };
            }
            if (parsed.status === "error") {
                return {
                    job_id: jobId,
                    started_at: startedAt,
                    completed_at: parsed.timestamp ?? new Date().toISOString(),
                    status: "error",
                    output: parsed.result ?? "",
                    error: parsed.error ?? parsed.stderr ?? "Unknown error",
                };
            }
        }
        catch {
            // Likely file not found yet or incomplete write. Keep polling.
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return {
        job_id: jobId,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        status: "timeout",
        output: "",
        error: `Job timed out after ${timeoutMs / 1000 / 60} minutes`,
    };
}
async function spawnZellijJob(job) {
    const startedAt = new Date().toISOString();
    const schedulerCwd = getSchedulerCwd();
    const logPath = path.join(schedulerCwd, ".lowcal", "logs", `${job.id}-${Date.now()}.log`);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const cliPath = path.join(schedulerCwd, "packages", "cli", "dist", "src", "scheduler", "headless.js");
    const cwd = schedulerCwd;
    const tabName = `job:${job.id}`;
    await ensureZellijTab(tabName, cwd);
    const commandArgs = [
        "env",
        `LOWCAL_HEADLESS=1`,
        `LOWCAL_JOB_ID=${job.id}`,
        `LOWCAL_HEADLESS_PRETTY=1`,
        "node",
        cliPath,
        "--prompt",
        job.prompt,
        "--job-id",
        job.id,
        "--output",
        logPath,
    ];
    const command = `export PS1=''; unset PROMPT_COMMAND; stty -echo; cd ${shellQuoteArg(cwd)} && ${commandArgs
        .map(shellQuoteArg)
        .join(" ")}; printf '\\n[scheduler idle]\\n'`;
    try {
        await runZellijCommand(["action", "go-to-tab-name", tabName]);
    }
    catch {
        // If focusing the tab fails, continue in the current one.
    }
    try {
        await runZellijCommand(["action", "write-chars", `${command}\n`]);
    }
    catch {
        await runZellijCommand(["action", "write", `${command}\n`]);
    }
    const timeoutMs = (job.timeout_minutes ?? DEFAULT_SCHEDULER_CONFIG.default_timeout_minutes) *
        60 *
        1000;
    return await waitForHeadlessLog(logPath, startedAt, timeoutMs, job.id);
}
async function spawnJob(job, executionMode) {
    if (executionMode === "zellij_tab") {
        try {
            return await spawnZellijJob(job);
        }
        catch (error) {
            console.warn(`[Scheduler] Failed to run job ${job.id} in Zellij; falling back to headless. Error:`, error instanceof Error ? error.message : String(error));
        }
    }
    return await spawnHeadlessJob(job);
}
/**
 * Execute a single job
 */
async function executeJob(job) {
    console.log(`[Scheduler] Executing job: ${job.id}`);
    try {
        // Mark job as running
        await markJobRunning(job.id);
        // Execute the job
        const executionMode = await resolveExecutionMode(job);
        const executionPromise = spawnJob(job, executionMode);
        activeExecutions.set(job.id, executionPromise);
        await updateSchedulerSessionState();
        const result = await executionPromise;
        activeExecutions.delete(job.id);
        await updateSchedulerSessionState();
        // Update job status based on result
        if (result.status === "success") {
            await markJobCompleted(job.id, result);
            console.log(`[Scheduler] Job ${job.id} completed successfully`);
        }
        else {
            await markJobFailed(job.id, result);
            console.log(`[Scheduler] Job ${job.id} failed: ${result.error}`);
        }
    }
    catch (error) {
        activeExecutions.delete(job.id);
        await updateSchedulerSessionState();
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Scheduler] Error executing job ${job.id}: ${errorMessage}`);
        // Create error result
        const result = {
            job_id: job.id,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            status: "error",
            output: "",
            error: errorMessage,
        };
        await markJobFailed(job.id, result);
        await saveExecutionLog(result);
    }
}
/**
 * Main tick function - checks for and executes due jobs
 */
async function tick() {
    const now = new Date();
    console.log(`[Scheduler] Tick at ${now.toISOString()}`);
    // Update daemon status
    const store = await loadStore();
    const upcomingJobs = store.jobs
        .filter((j) => j.enabled && j.next_run && new Date(j.next_run) > now)
        .sort((a, b) => new Date(a.next_run).getTime() - new Date(b.next_run).getTime())
        .slice(0, 10)
        .map((j) => j.id);
    await saveDaemonStatus({
        running: true,
        pid: process.pid,
        started_at: new Date().toISOString(),
        last_tick: now.toISOString(),
        active_executions: activeExecutions.size,
        total_jobs: store.jobs.length,
        upcoming_jobs: upcomingJobs,
    });
    await updateSchedulerSessionState();
    // Calculate next_run for jobs that don't have it
    for (const job of store.jobs) {
        if (job.enabled && !job.next_run) {
            const nextRun = calculateNextRun(job.schedule, now);
            if (nextRun) {
                console.log(`[Scheduler] Calculating next run for job ${job.id}: ${nextRun.toISOString()}`);
                await updateJob({
                    id: job.id,
                    next_run: nextRun.toISOString(),
                });
            }
        }
    }
    // Get due jobs
    const dueJobs = await getDueJobs(now);
    if (dueJobs.length === 0) {
        console.log("[Scheduler] No jobs due");
        return;
    }
    console.log(`[Scheduler] ${dueJobs.length} job(s) due`);
    // Check concurrent execution limit
    const availableSlots = DEFAULT_SCHEDULER_CONFIG.max_concurrent_jobs - activeExecutions.size;
    const jobsToExecute = dueJobs.slice(0, availableSlots);
    if (jobsToExecute.length < dueJobs.length) {
        console.log(`[Scheduler] Concurrent limit reached. Executing ${jobsToExecute.length}/${dueJobs.length} jobs`);
    }
    // Execute jobs (don't await - let them run concurrently)
    for (const job of jobsToExecute) {
        executeJob(job).catch((err) => {
            console.error(`[Scheduler] Unhandled error in job ${job.id}:`, err);
        });
    }
}
async function updateSchedulerSessionState() {
    await updateSessionDetails({ active_executions: activeExecutions.size });
    await setSessionStatus(activeExecutions.size > 0 ? "working" : "idle");
}
/**
 * Main daemon loop
 */
async function runDaemon() {
    console.log("[Scheduler] Daemon starting...");
    await startSessionRegistration({
        id: `scheduler-${process.pid}`,
        mode: "scheduler",
        status: "idle",
        details: { scheduler_cwd: getSchedulerCwd() },
        capabilities: {
            observe: true,
            control: true,
            interact: false,
        },
        cwd: getSchedulerCwd(),
    });
    // Write PID file
    await fs.mkdir(path.dirname(DAEMON_PID_FILE), { recursive: true });
    await fs.writeFile(DAEMON_PID_FILE, String(process.pid), "utf-8");
    // Initial tick
    await tick();
    // Schedule regular ticks (every minute, aligned to the top of the minute)
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => {
        tick();
        // Then every minute
        setInterval(tick, 60 * 1000);
    }, msUntilNextMinute);
    // Periodic cleanup (every hour)
    setInterval(async () => {
        console.log("[Scheduler] Running cleanup...");
        const deleted = await cleanupOldLogs();
        console.log(`[Scheduler] Cleaned up ${deleted} old log files`);
    }, 60 * 60 * 1000);
    console.log("[Scheduler] Daemon running. PID:", process.pid);
    // Keep process alive with a heartbeat interval
    // This is more reliable than stdin.resume() when stdio is ignored
    setInterval(() => {
        // Heartbeat - daemon is still alive
    }, 10000); // Every 10 seconds
}
/**
 * Stop the daemon
 */
export async function stopDaemon() {
    try {
        const pid = parseInt(await fs.readFile(DAEMON_PID_FILE, "utf-8"), 10);
        if (isNaN(pid))
            return false;
        try {
            process.kill(pid, "SIGTERM");
            // Wait a bit for graceful shutdown
            await new Promise((resolve) => setTimeout(resolve, 2000));
            // Check if still running
            try {
                process.kill(pid, 0);
                // Still running, force kill
                process.kill(pid, "SIGKILL");
            }
            catch {
                // Process is dead, good
            }
            // Clean up PID file
            await fs.unlink(DAEMON_PID_FILE).catch(() => { });
            return true;
        }
        catch {
            return false;
        }
    }
    catch {
        return false;
    }
}
/**
 * Start the daemon (if not already running)
 */
export async function startDaemon() {
    const running = await isDaemonRunning();
    if (running) {
        console.log("[Scheduler] Daemon is already running");
        return false;
    }
    // Spawn the daemon as a detached process
    const daemonPath = fileURLToPath(import.meta.url);
    const child = spawn("node", [daemonPath, "--daemon"], {
        detached: true,
        stdio: "ignore",
        env: {
            ...process.env,
            LOWCAL_SCHEDULER_CWD: process.cwd(),
        },
    });
    child.unref();
    // Wait a moment for the daemon to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return await isDaemonRunning();
}
/**
 * Pause a job by ID (via RPC call to daemon)
 */
export async function pauseJob(id) {
    try {
        const response = await fetch("http://localhost:3001/scheduler/pause", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        if (response.ok) {
            return true;
        }
    }
    catch {
        // Fall back below.
    }
    // Fallback: try to pause directly via job store
    const { pauseJob: corePauseJob } = await import("@qwen-code/qwen-code-core");
    try {
        await corePauseJob(id);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Resume a paused job by ID (via RPC call to daemon)
 */
export async function resumeJob(id) {
    try {
        const response = await fetch("http://localhost:3001/scheduler/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        if (response.ok) {
            return true;
        }
    }
    catch {
        // Fall back below.
    }
    // Fallback: try to resume directly via job store
    const { resumeJob: coreResumeJob } = await import("@qwen-code/qwen-code-core");
    try {
        await coreResumeJob(id);
        return true;
    }
    catch {
        return false;
    }
}
// Main entry point
const isMainModule = !!process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
    const args = process.argv.slice(2);
    if (args.includes("--daemon")) {
        // Run as daemon
        runDaemon().catch((err) => {
            console.error("[Scheduler] Daemon error:", err);
            process.exit(1);
        });
    }
    else if (args.includes("--status")) {
        // Print status
        getDaemonStatus().then((status) => {
            console.log(JSON.stringify(status, null, 2));
        });
    }
    else if (args.includes("--stop")) {
        // Stop daemon
        stopDaemon().then((success) => {
            if (success) {
                console.log("[Scheduler] Daemon stopped");
            }
            else {
                console.log("[Scheduler] Daemon was not running");
                process.exit(1);
            }
        });
    }
    else if (args.includes("--start")) {
        // Start daemon
        startDaemon().then((success) => {
            if (success) {
                console.log("[Scheduler] Daemon started");
            }
            else {
                console.log("[Scheduler] Failed to start daemon (may already be running)");
                process.exit(1);
            }
        });
    }
    else {
        console.log("Usage: node daemon.ts [--daemon|--start|--stop|--status]");
    }
}
//# sourceMappingURL=daemon.js.map