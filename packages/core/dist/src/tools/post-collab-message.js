/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { COLLAB_NOTIFY_MODES, COLLAB_MAX_REFS, COLLAB_MAX_TEXT_CHARS, COLLAB_MAX_TTL_SECONDS, postCollabMessage, } from "../collab/store.js";
import { enqueueCollabWakeForMessage } from "../collab/wake.js";
import { ToolErrorType } from "./tool-error.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";
class PostCollabMessageInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        const target = this.params.to_session_id?.trim() || "all";
        return `Posting collab message to ${target}`;
    }
    toolLocations() {
        return [{ path: this.config.getTargetDir() }];
    }
    async execute() {
        try {
            const result = await postCollabMessage({
                baseDir: this.config.getTargetDir(),
                fromSessionId: this.config.getSessionId(),
                toSessionId: this.params.to_session_id,
                type: this.params.type,
                text: this.params.text,
                refs: this.params.refs,
                inReplyTo: this.params.in_reply_to,
                ttlSeconds: this.params.ttl_seconds,
                notify: this.params.notify,
                source: "tool",
            });
            const message = result.message;
            const wakeResult = message.notify && message.notify !== "passive"
                ? await enqueueCollabWakeForMessage({ message })
                : null;
            const refsText = message.refs && message.refs.length > 0
                ? `\nRefs:\n- ${message.refs.join("\n- ")}`
                : "";
            const lines = [
                `Posted collab message.`,
                `Seq: ${message.seq}`,
                `Message ID: ${message.message_id}`,
                `From: ${message.from_session_id}`,
                `To: ${message.to_session_id ?? "all"}`,
                `Type: ${message.type}`,
                `Notify: ${message.notify ?? "passive"}`,
                `Timestamp: ${message.timestamp}`,
                "",
                message.text,
            ];
            if (wakeResult) {
                if (wakeResult.enqueued) {
                    lines.push("", `Wake: queued ${wakeResult.actionType} wake for ${wakeResult.targetSessionId}.`);
                }
                else {
                    lines.push("", `Wake: not queued (${wakeResult.reason ?? "unknown_reason"}).`);
                }
            }
            const output = lines.join("\n");
            return {
                llmContent: output + refsText,
                returnDisplay: output + refsText,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: `Error: ${errorMessage}`,
                error: {
                    message: errorMessage,
                    type: ToolErrorType.EXECUTION_FAILED,
                },
            };
        }
    }
}
export class PostCollabMessageTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.POST_COLLAB_MESSAGE;
    constructor(config) {
        super(PostCollabMessageTool.Name, "PostCollabMessage", "Post a short inter-session collaboration message to the shared workspace collab board. Keep message text concise and use refs for larger content.", Kind.Other, {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "Required short message text. Keep concise and reference large payloads via refs.",
                },
                to_session_id: {
                    type: "string",
                    description: "Optional destination session id. Use 'all' (or omit) for broadcast.",
                },
                type: {
                    type: "string",
                    description: "Optional message type label such as note, request, status, or result.",
                },
                refs: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional file path references for larger content. Avoid large inline payloads.",
                },
                in_reply_to: {
                    type: "string",
                    description: "Optional parent message id when this is a reply to an earlier collab message.",
                },
                ttl_seconds: {
                    type: "number",
                    description: "Optional expiration in seconds for ephemeral messages. Max 7 days.",
                },
                notify: {
                    type: "string",
                    enum: [...COLLAB_NOTIFY_MODES],
                    description: "Optional delivery mode: passive (default), wake_view (enqueue /collab view), or wake_prompt (enqueue a model prompt) for direct targets.",
                },
            },
            required: ["text"],
            $schema: "http://json-schema.org/draft-07/schema#",
        });
        this.config = config;
    }
    validateToolParamValues(params) {
        if (typeof params.text !== "string" || params.text.trim().length === 0) {
            return "Missing or empty \"text\".";
        }
        if (params.text.trim().length > COLLAB_MAX_TEXT_CHARS) {
            return `text exceeds ${COLLAB_MAX_TEXT_CHARS} characters. Write larger content to a file and reference it via refs.`;
        }
        if (params.refs) {
            const normalizedRefs = params.refs
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
            if (normalizedRefs.length > COLLAB_MAX_REFS) {
                return `refs cannot exceed ${COLLAB_MAX_REFS} entries.`;
            }
        }
        if (params.notify !== undefined && typeof params.notify !== "string") {
            return `notify must be one of: ${COLLAB_NOTIFY_MODES.join(", ")}.`;
        }
        const notify = typeof params.notify === "string" ? params.notify.trim() : "passive";
        if (!COLLAB_NOTIFY_MODES.includes(notify)) {
            return `notify must be one of: ${COLLAB_NOTIFY_MODES.join(", ")}.`;
        }
        if (notify !== "passive") {
            const target = params.to_session_id?.trim();
            if (!target || target === "all") {
                return "notify requires a direct --to session target (not all).";
            }
        }
        if (params.ttl_seconds !== undefined) {
            if (!Number.isFinite(params.ttl_seconds)) {
                return "ttl_seconds must be a finite number.";
            }
            const ttl = Math.floor(params.ttl_seconds);
            if (ttl < 1) {
                return "ttl_seconds must be >= 1.";
            }
            if (ttl > COLLAB_MAX_TTL_SECONDS) {
                return `ttl_seconds cannot exceed ${COLLAB_MAX_TTL_SECONDS}.`;
            }
        }
        return null;
    }
    createInvocation(params) {
        return new PostCollabMessageInvocation(this.config, params);
    }
}
//# sourceMappingURL=post-collab-message.js.map