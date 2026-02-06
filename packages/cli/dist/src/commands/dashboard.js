/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { listSessions, pruneStaleSessions, } from "@qwen-code/qwen-code-core";
import { DEFAULT_SESSION_TTL_MS } from "../session/sessionManager.js";
import { isDaemonRunning, getDaemonStatus, startDaemon, stopDaemon, } from "../scheduler/daemon.js";
import { listJobs, getJob, deleteJob, resetJob, } from "@qwen-code/qwen-code-core";
import { loadSettings } from "../config/settings.js";
// Simple readline implementation for dashboard
async function readLine(prompt = "") {
    process.stdout.write(prompt);
    return new Promise((resolve) => {
        const chunks = [];
        process.stdin.on("data", (chunk) => {
            if (chunk.toString() === "\n") {
                resolve(Buffer.concat(chunks).toString().trim());
                process.stdin.removeAllListeners("data");
            }
            else {
                chunks.push(chunk);
            }
        });
    });
}
function getTtlMs(ttlSeconds) {
    if (!ttlSeconds || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        return DEFAULT_SESSION_TTL_MS;
    }
    return ttlSeconds * 1000;
}
function getIntervalMs(intervalSeconds) {
    if (!intervalSeconds ||
        !Number.isFinite(intervalSeconds) ||
        intervalSeconds <= 0) {
        return 2000;
    }
    return intervalSeconds * 1000;
}
function normalizeExecutionMode(value) {
    const EXECUTION_MODE_VALUES = new Set([
        "headless",
        "zellij_tab",
        "default",
    ]);
    if (typeof value !== "string")
        return null;
    if (EXECUTION_MODE_VALUES.has(value)) {
        return value;
    }
    return null;
}
function getDefaultExecutionMode() {
    const settings = loadSettings(process.cwd());
    const modeFromSettings = normalizeExecutionMode(settings.merged.scheduler?.executionMode);
    if (modeFromSettings === "default" || modeFromSettings === null) {
        return "headless";
    }
    return modeFromSettings;
}
function formatSession(session, ttlMs, now) {
    const lastSeen = Date.parse(session.last_seen);
    const ageMs = Number.isFinite(lastSeen) ? now - lastSeen : Number.NaN;
    const isStale = Number.isFinite(ageMs) && ageMs > ttlMs;
    const statusLabel = isStale ? "stale" : session.status;
    const statusColor = isStale
        ? "\x1b[31m"
        : session.status === "working"
            ? "\x1b[33m"
            : "\x1b[32m";
    const reset = "\x1b[0m";
    const details = session.details ?? {};
    const jobId = typeof details["job_id"] === "string" ? details["job_id"] : undefined;
    const activeExecutions = typeof details["active_executions"] === "number"
        ? details["active_executions"]
        : undefined;
    const parts = [
        `${statusColor}${statusLabel.toUpperCase()}${reset} ${session.id}`,
        `  mode: ${session.mode}`,
        `  pid: ${session.pid}`,
        `  cwd: ${session.cwd}`,
        `  started: ${new Date(session.started_at).toLocaleString()}`,
        `  last_seen: ${new Date(session.last_seen).toLocaleString()}`,
    ];
    if (jobId) {
        parts.push(`  job_id: ${jobId}`);
    }
    if (typeof activeExecutions === "number") {
        parts.push(`  active_executions: ${activeExecutions}`);
    }
    return parts.join("\n");
}
function formatJob(job, defaultMode) {
    const statusIcon = job.enabled ? "🟢" : "🔴";
    const statusText = job.status === "running" ? " (running)" : "";
    const effectiveMode = job.execution_mode ?? defaultMode;
    const modeLabel = job.execution_mode === undefined
        ? `${effectiveMode} (default)`
        : effectiveMode;
    let output = `${statusIcon} ${job.id}${statusText}\n`;
    output += `   Schedule: ${job.schedule}\n`;
    output += `   Next run: ${job.next_run
        ? new Date(job.next_run).toLocaleString()
        : "Not scheduled"}\n`;
    output += `   Last run: ${job.last_run
        ? new Date(job.last_run).toLocaleString()
        : "Never"}\n`;
    output += `   Runs: ${job.run_count} successful, ${job.error_count} failed\n`;
    output += `   Execution: ${modeLabel}\n`;
    if (job.description) {
        output += `   ${job.description}\n`;
    }
    return output;
}
async function renderDashboard(sessions, jobs, ttlMs, intervalMs) {
    const now = Date.now();
    const defaultMode = getDefaultExecutionMode();
    // Clear screen and move cursor to top
    process.stdout.write("\x1b[2J\x1b[H");
    // Header
    console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
    console.log("║                           LowCal Dashboard                                    ║");
    console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
    console.log();
    // Scheduler Status
    const daemonRunning = await isDaemonRunning();
    console.log("┌─ Scheduler Status ────────────────────────────────────────────────────────────┐");
    const daemonStatusText = daemonRunning ? "🟢 Running" : "🔴 Not running";
    console.log(`│ Daemon: ${daemonStatusText}${" ".repeat(60 - daemonStatusText.length)}│`);
    if (daemonRunning) {
        const status = await getDaemonStatus();
        const pidText = `PID: ${status.pid}`;
        console.log(`│ ${pidText}${" ".repeat(75 - pidText.length)}│`);
        const activeExecText = `Active executions: ${status.active_executions}`;
        console.log(`│ ${activeExecText}${" ".repeat(75 - activeExecText.length)}│`);
    }
    console.log("└───────────────────────────────────────────────────────────────────────────────┘");
    console.log();
    // Sessions Section
    const sessionsHeader = `┌─ Active Sessions (${sessions.length} total) ─────────────────────────────────────────────────────────┐`;
    console.log(sessionsHeader);
    if (sessions.length === 0) {
        console.log("│ No active sessions.                                                           │");
    }
    else {
        const sorted = [...sessions].sort((a, b) => {
            const aLast = Date.parse(a.last_seen);
            const bLast = Date.parse(b.last_seen);
            const aStale = Number.isFinite(aLast) && now - aLast > ttlMs;
            const bStale = Number.isFinite(bLast) && now - bLast > ttlMs;
            const aRank = aStale ? 2 : a.status === "working" ? 0 : 1;
            const bRank = bStale ? 2 : b.status === "working" ? 0 : 1;
            if (aRank !== bRank) {
                return aRank - bRank;
            }
            if (Number.isFinite(aLast) && Number.isFinite(bLast)) {
                return bLast - aLast;
            }
            return 0;
        });
        for (const session of sorted) {
            const formatted = formatSession(session, ttlMs, now);
            // Indent each line
            const indented = formatted.replace(/\n/g, "\n│ ");
            console.log(`│ ${indented} │`);
            console.log("├───────────────────────────────────────────────────────────────────────────────┤");
        }
    }
    console.log("└───────────────────────────────────────────────────────────────────────────────┘");
    console.log();
    // Jobs Section
    const jobsHeader = `┌─ Scheduled Jobs (${jobs.length} total) ─────────────────────────────────────────────────────────┐`;
    console.log(jobsHeader);
    if (jobs.length === 0) {
        console.log("│ No scheduled jobs.                                                            │");
    }
    else {
        for (const job of jobs) {
            const formatted = formatJob(job, defaultMode);
            // Indent each line
            const indented = formatted.replace(/\n/g, "\n│ ");
            console.log(`│ ${indented} │`);
            console.log("├───────────────────────────────────────────────────────────────────────────────┤");
        }
    }
    console.log("└───────────────────────────────────────────────────────────────────────────────┘");
    console.log();
    // Footer with helper info
    const intervalSec = Math.round(intervalMs / 1000);
    console.log(`LowCal Dashboard (refresh ${intervalSec}s) - press Ctrl+C to exit`);
    console.log();
    console.log("┌─ Keyboard Shortcuts ──────────────────────────────────────────────────────────┐");
    console.log("│ Sessions: [p]rune stale                                                     │");
    console.log("│ Scheduler: [s]tart | [S]top | [D]elete job <id> | [R]eset job <id>          │");
    console.log("└───────────────────────────────────────────────────────────────────────────────┘");
}
const dashboardCommand = {
    command: "dashboard",
    describe: "Show a live dashboard of sessions and scheduler status",
    builder: (yargs) => yargs
        .option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
    })
        .option("watch", {
        type: "boolean",
        description: "Keep the dashboard live (like top)",
        default: false,
    })
        .option("interval", {
        type: "number",
        description: "Refresh interval in seconds (default: 2)",
    }),
    handler: async (argv) => {
        const ttlMs = getTtlMs(argv.ttl);
        if (!argv.watch) {
            const [sessions, jobs] = await Promise.all([
                listSessions(),
                listJobs(),
            ]);
            const intervalMs = getIntervalMs(argv.interval);
            await renderDashboard(sessions, jobs, ttlMs, intervalMs);
            return;
        }
        const intervalMs = getIntervalMs(argv.interval);
        let intervalId;
        // State to track if we're in an interactive mode (waiting for job ID input)
        let isInteractiveMode = false;
        const render = async () => {
            // Only clear screen and re-render if not in interactive mode
            if (!isInteractiveMode) {
                const [sessions, jobs] = await Promise.all([
                    listSessions(),
                    listJobs(),
                ]);
                await renderDashboard(sessions, jobs, ttlMs, intervalMs);
            }
        };
        await render();
        intervalId = setInterval(render, intervalMs);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on("data", async (data) => {
                const key = data.toString("utf-8");
                // Ctrl+C to exit
                if (key === "\u0003") {
                    clearInterval(intervalId);
                    process.exit(0);
                }
                // Skip if in interactive mode (waiting for job ID input)
                if (isInteractiveMode) {
                    return;
                }
                // Prune stale sessions
                if (key.toLowerCase() === "p") {
                    console.log("\nPruning stale sessions...");
                    const removed = await pruneStaleSessions(ttlMs);
                    if (removed.length === 0) {
                        console.log("No stale sessions to remove.");
                    }
                    else {
                        console.log(`Removed ${removed.length} stale session(s):`);
                        for (const session of removed) {
                            console.log(`- ${session.id}`);
                        }
                    }
                    await render();
                }
                // Start daemon (lowercase 's')
                if (key.toLowerCase() === "s") {
                    const running = await isDaemonRunning();
                    if (running) {
                        console.log("\nScheduler daemon is already running.");
                        const status = await getDaemonStatus();
                        console.log(`  PID: ${status.pid}`);
                        console.log(`  Jobs: ${status.total_jobs} scheduled`);
                    }
                    else {
                        console.log("\nStarting scheduler daemon...");
                        const started = await startDaemon();
                        if (started) {
                            console.log("✓ Scheduler daemon started successfully");
                        }
                        else {
                            console.log("✗ Failed to start scheduler daemon");
                        }
                    }
                    await render();
                }
                // Stop daemon (uppercase 'S')
                if (key === "S") {
                    const running = await isDaemonRunning();
                    if (!running) {
                        console.log("\nScheduler daemon is not running.");
                    }
                    else {
                        console.log("\nStopping scheduler daemon...");
                        const stopped = await stopDaemon();
                        if (stopped) {
                            console.log("✓ Scheduler daemon stopped");
                        }
                        else {
                            console.log("✗ Failed to stop scheduler daemon");
                        }
                    }
                    await render();
                }
                // Delete job (uppercase 'D')
                if (key === "D") {
                    isInteractiveMode = true;
                    process.stdout.write("\n\x1b[2J\x1b[HEnter Job ID to delete: ");
                    const jobId = await readLine();
                    if (jobId) {
                        const job = await getJob(jobId);
                        if (!job) {
                            console.error(`Job "${jobId}" not found`);
                        }
                        else {
                            await deleteJob(jobId);
                            console.log(`✓ Job "${jobId}" deleted successfully`);
                        }
                    }
                    isInteractiveMode = false;
                    console.log("\nPress any key to return...");
                }
                // Reset job (uppercase 'R')
                if (key === "R") {
                    isInteractiveMode = true;
                    process.stdout.write("\n\x1b[2J\x1b[HEnter Job ID to reset: ");
                    const jobId = await readLine();
                    if (jobId) {
                        const job = await getJob(jobId);
                        if (!job) {
                            console.error(`Job "${jobId}" not found`);
                        }
                        else {
                            await resetJob(jobId);
                            console.log(`✓ Job "${jobId}" reset and re-enabled`);
                        }
                    }
                    isInteractiveMode = false;
                    console.log("\nPress any key to return...");
                }
            });
        }
        // Keep the process alive by keeping stdin open
        process.stdin.on("end", () => {
            clearInterval(intervalId);
            process.exit(0);
        });
    },
};
export { dashboardCommand };
//# sourceMappingURL=dashboard.js.map