/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { terminalSessionService } from "@qwen-code/qwen-code-core";
import { CommandKind, } from "./types.js";
function formatSessionList() {
    const sessions = terminalSessionService.list();
    if (sessions.length === 0) {
        return "No interactive terminal sessions are open.";
    }
    return sessions
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
function resolveSessionId(explicitId) {
    if (explicitId) {
        return explicitId;
    }
    const runningSessions = terminalSessionService
        .list()
        .filter((session) => session.running);
    if (runningSessions.length === 1) {
        return runningSessions[0].id;
    }
    if (runningSessions.length === 0) {
        return message("error", "No running interactive terminal sessions.");
    }
    return message("error", `Multiple terminal sessions are running. Use /terminal close <session_id>, /terminal attach <session_id>, or /terminal close all.\n\n${formatSessionList()}`);
}
export const terminalCommand = {
    name: "terminal",
    altNames: ["term"],
    description: "list or attach to LowCal interactive terminal sessions",
    kind: CommandKind.BUILT_IN,
    completion: async (_context, partialArg) => {
        const tokens = partialArg.trim().split(/\s+/).filter(Boolean);
        if (tokens.length <= 1 && "attach".startsWith(tokens[0] ?? "")) {
            return ["attach", "close", "list"];
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
        return ["attach", "close", "list"].filter((cmd) => cmd.startsWith(firstToken) || cmd.includes(filter));
    },
    action: async (context, args) => {
        const tokens = args.trim().split(/\s+/).filter(Boolean);
        const subcommand = tokens[0] ?? "list";
        if (subcommand === "list" || subcommand === "ls") {
            return message("info", formatSessionList());
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
        if (subcommand !== "attach") {
            return message("error", "Usage: /terminal list | /terminal attach [session_id] | /terminal close [session_id] | /terminal close all");
        }
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
    },
};
//# sourceMappingURL=terminalCommand.js.map