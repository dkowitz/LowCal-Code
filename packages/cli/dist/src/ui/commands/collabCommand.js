/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { COLLAB_NOTIFY_MODES, enqueueCollabWakeForMessage, postCollabMessage, readCollabMessages, } from "@qwen-code/qwen-code-core";
import { CommandKind, } from "./types.js";
function usageError(content) {
    return {
        type: "message",
        messageType: "error",
        content,
    };
}
function tokenizeArgs(input) {
    const tokens = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;
    while ((match = regex.exec(input)) !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
    }
    return tokens;
}
function formatMessage(message) {
    const timestamp = new Date(message.timestamp).toLocaleString();
    const target = message.to_session_id ?? "all";
    const preview = message.text.trim().replace(/\s+/g, " ");
    const refs = message.refs && message.refs.length > 0
        ? `\n    refs: ${message.refs.join(", ")}`
        : "";
    return `[${message.seq}] ${message.type} ${message.from_session_id} -> ${target} at ${timestamp}\n    ${preview}${refs}`;
}
function parseViewOptions(tokens) {
    const options = {};
    let index = 0;
    while (index < tokens.length) {
        const token = tokens[index];
        if (token === "--all") {
            options.includeAllTargets = true;
            index += 1;
            continue;
        }
        if (token === "--since") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --since";
            }
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return "--since must be a non-negative integer.";
            }
            options.sinceSeq = parsed;
            index += 2;
            continue;
        }
        if (token === "--limit") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --limit";
            }
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed < 1) {
                return "--limit must be a positive integer.";
            }
            options.limit = parsed;
            index += 2;
            continue;
        }
        return `Unknown option: ${token}`;
    }
    return options;
}
function parsePostOptions(tokens) {
    if (tokens.length === 0) {
        return "Usage: /collab post <message> [--to <session|all>] [--ref <path>] [--type <label>] [--reply <message_id>] [--ttl <seconds>] [--notify <passive|wake_view|wake_prompt>]";
    }
    const messageParts = [];
    let index = 0;
    while (index < tokens.length && !tokens[index].startsWith("--")) {
        messageParts.push(tokens[index]);
        index += 1;
    }
    const text = messageParts.join(" ").trim();
    if (!text) {
        return "Message text is required. Example: /collab post \"Need review\" --ref src/file.ts";
    }
    const refs = [];
    const options = { text };
    while (index < tokens.length) {
        const token = tokens[index];
        if (token === "--to") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --to";
            }
            options.toSessionId = value.trim();
            index += 2;
            continue;
        }
        if (token === "--ref") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --ref";
            }
            refs.push(value.trim());
            index += 2;
            continue;
        }
        if (token === "--type") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --type";
            }
            options.type = value.trim();
            index += 2;
            continue;
        }
        if (token === "--reply") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --reply";
            }
            options.inReplyTo = value.trim();
            index += 2;
            continue;
        }
        if (token === "--ttl") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --ttl";
            }
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed) || parsed < 1) {
                return "--ttl must be a positive integer.";
            }
            options.ttlSeconds = parsed;
            index += 2;
            continue;
        }
        if (token === "--notify") {
            const value = tokens[index + 1];
            if (!value) {
                return "Missing value for --notify";
            }
            const notify = value.trim();
            if (!COLLAB_NOTIFY_MODES.includes(notify)) {
                return `--notify must be one of: ${COLLAB_NOTIFY_MODES.join(", ")}.`;
            }
            options.notify = notify;
            index += 2;
            continue;
        }
        return `Unknown option: ${token}`;
    }
    if (options.notify && options.notify !== "passive") {
        if (!options.toSessionId || options.toSessionId === "all") {
            return "--notify wake_view/wake_prompt requires --to <session>.";
        }
    }
    if (refs.length > 0) {
        options.refs = refs;
    }
    return options;
}
function formatViewOutput(sessionId, messages, includeAllTargets) {
    const lines = [];
    lines.push(includeAllTargets
        ? "Collab board messages (all targets)"
        : `Collab board messages for session "${sessionId}"`);
    lines.push("");
    if (messages.length === 0) {
        lines.push("- none");
    }
    else {
        for (const message of messages) {
            lines.push(formatMessage(message));
        }
    }
    lines.push("");
    lines.push("Use /collab post \"<short message>\" [--to <session|all>] [--ref <path>] [--notify <passive|wake_view|wake_prompt>] to send a message.");
    return lines.join("\n");
}
export const collabCommand = {
    name: "collab",
    description: "view and post workspace collaboration board messages",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const config = context.services.config;
        if (!config) {
            return usageError("Collab board is unavailable: missing active configuration.");
        }
        const sessionId = config.getSessionId();
        const baseDir = config.getTargetDir();
        const tokens = tokenizeArgs(args.trim());
        const subcommand = (tokens[0] ?? "view").toLowerCase();
        const rest = tokens.slice(1);
        if (subcommand === "view" || subcommand === "list") {
            const parsed = parseViewOptions(rest);
            if (typeof parsed === "string") {
                return usageError(`${parsed}\nUsage: /collab view [--since <seq>] [--limit <n>] [--all]`);
            }
            const messages = await readCollabMessages(baseDir, {
                sessionId: parsed.includeAllTargets ? undefined : sessionId,
                sinceSeq: parsed.sinceSeq,
                limit: parsed.limit,
            });
            return {
                type: "message",
                messageType: "info",
                content: formatViewOutput(sessionId, messages, parsed.includeAllTargets ?? false),
            };
        }
        if (subcommand === "post") {
            const parsed = parsePostOptions(rest);
            if (typeof parsed === "string") {
                return usageError(parsed);
            }
            const result = await postCollabMessage({
                baseDir,
                fromSessionId: sessionId,
                toSessionId: parsed.toSessionId,
                type: parsed.type,
                text: parsed.text,
                refs: parsed.refs,
                inReplyTo: parsed.inReplyTo,
                ttlSeconds: parsed.ttlSeconds,
                notify: parsed.notify,
                source: "slash_command",
            });
            const message = result.message;
            const wakeResult = message.notify && message.notify !== "passive"
                ? await enqueueCollabWakeForMessage({ message })
                : null;
            const refsText = message.refs && message.refs.length > 0
                ? `\nRefs:\n- ${message.refs.join("\n- ")}`
                : "";
            const wakeText = wakeResult
                ? wakeResult.enqueued
                    ? `\nWake: queued ${wakeResult.actionType} wake for ${wakeResult.targetSessionId}.`
                    : `\nWake: not queued (${wakeResult.reason ?? "unknown_reason"}).`
                : "";
            return {
                type: "message",
                messageType: "info",
                content: [
                    `Posted collab message [${message.seq}] (${message.message_id}).`,
                    `To: ${message.to_session_id ?? "all"}`,
                    `Type: ${message.type}`,
                    `Notify: ${message.notify ?? "passive"}`,
                    "",
                    message.text,
                    refsText,
                    wakeText,
                ].join("\n"),
            };
        }
        return usageError("Unknown subcommand. Use /collab view [--since <seq>] [--limit <n>] [--all] or /collab post \"<message>\" [--to <session|all>] [--ref <path>] [--notify <passive|wake_view|wake_prompt>].");
    },
};
//# sourceMappingURL=collabCommand.js.map