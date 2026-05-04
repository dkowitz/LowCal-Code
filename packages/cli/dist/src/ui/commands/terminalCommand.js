/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { terminalSessionService } from "@qwen-code/qwen-code-core";
import path from "node:path";
import process from "node:process";
import { CommandKind, } from "./types.js";
function formatSessionList() {
    const sessions = terminalSessionService.list();
    if (sessions.length === 0) {
        return "No interactive terminal sessions are open.";
    }
    // Sort by session number descending so newest appears first
    const sorted = [...sessions].sort((a, b) => {
        const numA = parseInt(a.id.replace("term_", ""), 10);
        const numB = parseInt(b.id.replace("term_", ""), 10);
        return numB - numA;
    });
    return sorted
        .map((session) => [
        `${session.id} (${session.running ? "running" : "exited"})`,
        `  name: ${session.name}`,
        `  backend: ${session.backend}`,
        `  active: ${session.lastLine || "(empty)"}`,
        session.attachCommand ? `  attach: ${session.attachCommand}` : "",
    ]
        .filter(Boolean)
        .join("\n"))
        .join("\n\n");
}
function message(messageType, content) {
    return {
        type: "message",
        messageType,
        content,
    };
}
/**
 * Returns the newest running session ID, or null if none are running.
 */
function findNewestRunningSession() {
    const runningSessions = terminalSessionService
        .list()
        .filter((session) => session.running);
    if (runningSessions.length === 0) {
        return null;
    }
    // Sort by session number descending to get newest first
    const sorted = runningSessions.sort((a, b) => {
        const numA = parseInt(a.id.replace("term_", ""), 10);
        const numB = parseInt(b.id.replace("term_", ""), 10);
        return numB - numA;
    });
    return sorted[0].id;
}
function resolveSessionId(explicitId) {
    if (explicitId) {
        return explicitId;
    }
    const resolved = findNewestRunningSession();
    if (resolved === null) {
        return message("error", "No running interactive terminal sessions.");
    }
    return resolved;
}
/**
 * Helper: attach to a session, handling TTY checks and cleanup.
 */
async function doAttach(context, sessionId) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return message("error", "Attaching to a terminal session requires an interactive TTY.");
    }
    await terminalSessionService.attachInteractive(sessionId, {
        input: process.stdin,
        output: process.stdout,
    });
    context.ui.refreshStatic();
    return message("info", `Detached from terminal session ${sessionId}.`);
}
/**
 * Helper: start a new session and immediately attach to it.
 */
async function doStartAndAttach(context, cwd) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return message("error", "Starting and attaching to a terminal session requires an interactive TTY.");
    }
    try {
        const snapshot = await terminalSessionService.open({ cwd });
        // Single-session enforcement already killed any ghost sessions.
        // Now attach immediately so the user is in the terminal.
        await doAttach(context, snapshot.id);
        return message("info", `Attached to new terminal session ${snapshot.id}.`);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return message("error", `Failed to start and attach to terminal: ${msg}`);
    }
}
export const terminalCommand = {
    name: "terminal",
    altNames: ["term"],
    description: "list, attach to, start, or close LowCal interactive terminal sessions",
    kind: CommandKind.BUILT_IN,
    completion: async (_context, partialArg) => {
        const tokens = partialArg.trim().split(/\s+/).filter(Boolean);
        if (tokens.length <= 1 && "attach".startsWith(tokens[0] ?? "")) {
            return ["attach", "close", "list", "start"];
        }
        // If we're completing session IDs for attach/close, filter by the last token
        const firstToken = tokens[0]?.toLowerCase() ?? "";
        if (firstToken === "attach" || firstToken === "close") {
            const filter = tokens[tokens.length - 1]?.toLowerCase() ?? "";
            return terminalSessionService
                .list()
                .map((session) => session.id)
                .filter((id) => id.toLowerCase().includes(filter));
        }
        // If completing the first token, suggest subcommands
        const filter = tokens[tokens.length - 1]?.toLowerCase() ?? "";
        return ["attach", "close", "list", "start"].filter((cmd) => cmd.startsWith(firstToken) || cmd.includes(filter));
    },
    action: async (context, args) => {
        const tokens = args.trim().split(/\s+/).filter(Boolean);
        const subcommand = tokens[0] ?? "";
        // Bare /terminal with no args — default behavior
        if (!subcommand || subcommand === "") {
            const runningSession = findNewestRunningSession();
            if (runningSession) {
                // Attach to the newest running session
                return await doAttach(context, runningSession);
            }
            // No running sessions — start a new one and attach immediately
            return await doStartAndAttach(context, process.cwd());
        }
        if (subcommand === "list" || subcommand === "ls") {
            return message("info", formatSessionList());
        }
        if (subcommand === "start") {
            // /terminal start [directory] — start a new session in the given directory and attach immediately
            const dirArg = tokens[1];
            let cwd;
            if (dirArg) {
                cwd = path.resolve(process.cwd(), dirArg);
            }
            else {
                cwd = process.cwd();
            }
            return await doStartAndAttach(context, cwd);
        }
        if (subcommand === "close") {
            // /terminal close all - close every session
            if (tokens[1] === "all") {
                const results = await terminalSessionService.closeAll();
                if (results.length === 0) {
                    return message("info", "No interactive terminal sessions to close.");
                }
                const closedNames = results.map((s) => `${s.id} (${s.name})`).join(", ");
                return message("info", `Closed ${results.length} terminal session${results.length > 1 ? "s" : ""}: ${closedNames}`);
            }
            // /terminal close <session_id> - close a specific session (auto-select if only one running)
            const resolved = resolveSessionId(tokens[1]);
            if (typeof resolved !== "string") {
                return resolved;
            }
            try {
                await terminalSessionService.close(resolved);
                context.ui.refreshStatic();
                return message("info", `Closed terminal session ${resolved}.`);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return message("error", msg);
            }
        }
        if (subcommand === "attach") {
            const resolved = resolveSessionId(tokens[1]);
            if (typeof resolved !== "string") {
                return resolved;
            }
            if (!process.stdin.isTTY || !process.stdout.isTTY) {
                return message("error", "Attaching to a terminal session requires an interactive TTY.");
            }
            await terminalSessionService.attachInteractive(resolved, {
                input: process.stdin,
                output: process.stdout,
            });
            context.ui.refreshStatic();
            return message("info", `Detached from terminal session ${resolved}.`);
        }
        return message("error", "Usage: /terminal [attach|close|list|start] | /terminal start <directory> | /terminal attach [session_id] | /terminal close [session_id] | /terminal close all\n\nBare /terminal attaches to the newest running session or starts a new one if none exist.");
    },
};
//# sourceMappingURL=terminalCommand.js.map