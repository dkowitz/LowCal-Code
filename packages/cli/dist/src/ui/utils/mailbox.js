/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
export function getMailboxPath(baseDir, sessionId) {
    return path.join(baseDir, ".lowcal", "session-messages", `${sessionId}.jsonl`);
}
export async function readMailboxMessages(mailboxPath) {
    try {
        const raw = await fs.readFile(mailboxPath, "utf-8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line) => {
            try {
                const parsed = JSON.parse(line);
                return parsed;
            }
            catch {
                return null;
            }
        })
            .filter((message) => message !== null);
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}
export async function clearMailboxMessages(mailboxPath) {
    try {
        await fs.unlink(mailboxPath);
    }
    catch (error) {
        const nodeError = error;
        if (nodeError?.code !== "ENOENT") {
            throw error;
        }
    }
}
export function toMessageTimestampMs(message) {
    if (!message.timestamp) {
        return 0;
    }
    const parsed = Date.parse(message.timestamp);
    return Number.isFinite(parsed) ? parsed : 0;
}
export function sortMailboxMessages(messages) {
    return [...messages].sort((a, b) => toMessageTimestampMs(b) - toMessageTimestampMs(a));
}
export function summarizeMailboxPayload(message, maxLength = 220) {
    if (message.result_file_path) {
        return `Result file: ${message.result_file_path}`;
    }
    if (message.return_payload && message.return_payload.trim().length > 0) {
        return message.return_payload.trim().replace(/\s+/g, " ").slice(0, maxLength);
    }
    if (message.preview && message.preview.trim().length > 0) {
        return message.preview.trim().replace(/\s+/g, " ").slice(0, maxLength);
    }
    return "(no payload preview)";
}
export function mailboxMessageTaskId(message) {
    return (message.from_task_id ?? message.job_id ?? message.from_session_id ?? "unknown-task");
}
export async function loadMailboxPayloadText(message) {
    if (message.result_file_path) {
        try {
            const raw = await fs.readFile(message.result_file_path, "utf-8");
            const content = raw.trim();
            if (content.length > 0) {
                return content;
            }
            return `Result file is empty: ${message.result_file_path}`;
        }
        catch (error) {
            const details = error instanceof Error ? error.message : String(error);
            return `Unable to read result file "${message.result_file_path}": ${details}`;
        }
    }
    if (message.return_payload && message.return_payload.trim().length > 0) {
        return message.return_payload.trim();
    }
    if (message.preview && message.preview.trim().length > 0) {
        return message.preview.trim();
    }
    return "No payload available for this mailbox entry.";
}
export function resolveMailboxSelection(messages, selector) {
    const trimmed = selector.trim();
    if (!trimmed)
        return null;
    const numericIndex = Number.parseInt(trimmed, 10);
    if (Number.isFinite(numericIndex) && String(numericIndex) === trimmed) {
        const zeroBased = numericIndex - 1;
        if (zeroBased < 0 || zeroBased >= messages.length) {
            return null;
        }
        return {
            message: messages[zeroBased],
            index: numericIndex,
        };
    }
    const foundIndex = messages.findIndex((message) => {
        return (message.from_task_id === trimmed ||
            message.job_id === trimmed ||
            message.from_session_id === trimmed);
    });
    if (foundIndex < 0) {
        return null;
    }
    return {
        message: messages[foundIndex],
        index: foundIndex + 1,
    };
}
//# sourceMappingURL=mailbox.js.map