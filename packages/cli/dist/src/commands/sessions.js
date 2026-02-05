/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { listSessions, getSession, pruneStaleSessions, } from "@qwen-code/qwen-code-core";
import { DEFAULT_SESSION_TTL_MS } from "../session/sessionManager.js";
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
function renderSessions(sessions, ttlMs) {
    const now = Date.now();
    if (sessions.length === 0) {
        console.log("No sessions found.");
        return;
    }
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
        console.log(formatSession(session, ttlMs, now));
        console.log();
    }
}
function formatSession(session, ttlMs, now) {
    const lastSeen = Date.parse(session.last_seen);
    const ageMs = Number.isFinite(lastSeen) ? now - lastSeen : Number.NaN;
    const isStale = Number.isFinite(ageMs) && ageMs > ttlMs;
    const statusLabel = isStale ? "stale" : session.status;
    const statusColor = isStale ? "\x1b[31m" : session.status === "working" ? "\x1b[33m" : "\x1b[32m";
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
const listCommand = {
    command: "list",
    describe: "List active sessions",
    builder: (yargs) => yargs
        .option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
    })
        .option("watch", {
        type: "boolean",
        description: "Keep the list live (like top)",
        default: false,
    })
        .option("interval", {
        type: "number",
        description: "Refresh interval in seconds (default: 2)",
    }),
    handler: async (argv) => {
        const ttlMs = getTtlMs(argv.ttl);
        if (!argv.watch) {
            const sessions = await listSessions();
            renderSessions(sessions, ttlMs);
            return;
        }
        const intervalMs = getIntervalMs(argv.interval);
        const render = async () => {
            const sessions = await listSessions();
            process.stdout.write("\x1b[2J\x1b[H");
            console.log(`LowCal Sessions (refresh ${Math.round(intervalMs / 1000)}s) - press Ctrl+C to exit`);
            console.log();
            renderSessions(sessions, ttlMs);
        };
        await render();
        setInterval(render, intervalMs);
    },
};
const getCommand = {
    command: "get <id>",
    describe: "Show details for a single session",
    handler: async (argv) => {
        const id = argv.id;
        if (!id) {
            console.error("Session id is required.");
            process.exit(1);
        }
        const session = await getSession(id);
        if (!session) {
            console.log(`Session not found: ${id}`);
            process.exit(1);
        }
        console.log(JSON.stringify(session, null, 2));
    },
};
const pruneCommand = {
    command: "prune",
    describe: "Remove stale sessions",
    builder: (yargs) => yargs.option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
    }),
    handler: async (argv) => {
        const ttlMs = getTtlMs(argv.ttl);
        const removed = await pruneStaleSessions(ttlMs);
        if (removed.length === 0) {
            console.log("No stale sessions removed.");
            return;
        }
        console.log(`Removed ${removed.length} stale session(s):`);
        for (const session of removed) {
            console.log(`- ${session.id}`);
        }
    },
};
export const sessionsCommand = {
    command: "sessions",
    describe: "Manage LowCal sessions",
    builder: (yargs) => yargs
        .command(listCommand)
        .command(getCommand)
        .command(pruneCommand)
        .option("ttl", {
        type: "number",
        description: "Stale threshold in seconds (default: 180)",
    })
        .option("watch", {
        type: "boolean",
        description: "Keep the list live (like top)",
        default: false,
    })
        .option("interval", {
        type: "number",
        description: "Refresh interval in seconds (default: 2)",
    })
        .version(false),
    handler: async (argv) => {
        const ttlMs = getTtlMs(argv.ttl);
        if (!argv.watch) {
            const sessions = await listSessions();
            renderSessions(sessions, ttlMs);
            return;
        }
        const intervalMs = getIntervalMs(argv.interval);
        const render = async () => {
            const sessions = await listSessions();
            process.stdout.write("\x1b[2J\x1b[H");
            console.log(`LowCal Sessions (refresh ${Math.round(intervalMs / 1000)}s) - press Ctrl+C to exit`);
            console.log();
            renderSessions(sessions, ttlMs);
        };
        await render();
        setInterval(render, intervalMs);
    },
};
//# sourceMappingURL=sessions.js.map