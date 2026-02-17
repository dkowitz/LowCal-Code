/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { reportError } from "../utils/errorReporting.js";
import { getErrorMessage, UnauthorizedError, toFriendlyError, } from "../utils/errors.js";
export var GeminiEventType;
(function (GeminiEventType) {
    GeminiEventType["Content"] = "content";
    GeminiEventType["ToolCallRequest"] = "tool_call_request";
    GeminiEventType["ToolCallResponse"] = "tool_call_response";
    GeminiEventType["ToolCallConfirmation"] = "tool_call_confirmation";
    GeminiEventType["UserCancelled"] = "user_cancelled";
    GeminiEventType["Error"] = "error";
    GeminiEventType["ChatCompressed"] = "chat_compressed";
    GeminiEventType["Thought"] = "thought";
    GeminiEventType["MaxSessionTurns"] = "max_session_turns";
    GeminiEventType["SessionTokenLimitExceeded"] = "session_token_limit_exceeded";
    GeminiEventType["Finished"] = "finished";
    GeminiEventType["LoopDetected"] = "loop_detected";
    GeminiEventType["Citation"] = "citation";
    GeminiEventType["Retry"] = "retry";
    GeminiEventType["TokenBudgetWarning"] = "token_budget_warning";
    GeminiEventType["ContextWindowRecovery"] = "context_window_recovery";
    GeminiEventType["ToolOutputTruncated"] = "tool_output_truncated";
})(GeminiEventType || (GeminiEventType = {}));
export var CompressionStatus;
(function (CompressionStatus) {
    /** The compression was successful */
    CompressionStatus[CompressionStatus["COMPRESSED"] = 1] = "COMPRESSED";
    /** The compression failed due to the compression inflating the token count */
    CompressionStatus[CompressionStatus["COMPRESSION_FAILED_INFLATED_TOKEN_COUNT"] = 2] = "COMPRESSION_FAILED_INFLATED_TOKEN_COUNT";
    /** The compression failed due to an error counting tokens */
    CompressionStatus[CompressionStatus["COMPRESSION_FAILED_TOKEN_COUNT_ERROR"] = 3] = "COMPRESSION_FAILED_TOKEN_COUNT_ERROR";
    /** The compression was not necessary and no action was taken */
    CompressionStatus[CompressionStatus["NOOP"] = 4] = "NOOP";
})(CompressionStatus || (CompressionStatus = {}));
// A turn manages the agentic loop turn within the server context.
export class Turn {
    chat;
    prompt_id;
    pendingToolCalls;
    debugResponses;
    finishReason;
    emittedThoughtHashes;
    lastCandidateTexts;
    textDuplicateTrackers;
    thinkingBlockTrackers;
    finishedEventEmitted;
    constructor(chat, prompt_id) {
        this.chat = chat;
        this.prompt_id = prompt_id;
        this.pendingToolCalls = [];
        this.debugResponses = [];
        this.finishReason = undefined;
        this.emittedThoughtHashes = new Set();
        this.lastCandidateTexts = new Map();
        this.textDuplicateTrackers = new Map();
        this.thinkingBlockTrackers = new Map();
        this.finishedEventEmitted = false;
    }
    // The run method yields simpler events suitable for server logic
    async *run(req, signal) {
        try {
            // Note: This assumes `sendMessageStream` yields events like
            // { type: StreamEventType.RETRY } or { type: StreamEventType.CHUNK, value: GenerateContentResponse }
            const responseStream = await this.chat.sendMessageStream({
                message: req,
                config: {
                    abortSignal: signal,
                },
            }, this.prompt_id);
            for await (const streamEvent of responseStream) {
                if (signal?.aborted) {
                    yield { type: GeminiEventType.UserCancelled };
                    return;
                }
                // Handle the new RETRY event
                if (streamEvent.type === "retry") {
                    // Keep deduplication state so replayed chunks from a retried stream
                    // are not emitted to the UI a second time.
                    this.finishedEventEmitted = false; // Reset finished flag on retry
                    yield { type: GeminiEventType.Retry };
                    continue; // Skip to the next event in the stream
                }
                // Assuming other events are chunks with a `value` property
                const resp = streamEvent.value;
                if (!resp)
                    continue; // Skip if there's no response body
                this.debugResponses.push(resp);
                const thought = this.extractThoughtSummary(resp);
                if (thought && this.shouldEmitThought(thought)) {
                    yield {
                        type: GeminiEventType.Thought,
                        value: thought,
                    };
                }
                const text = this.getVisibleResponseText(resp);
                if (text) {
                    const candidateIndex = resp.candidates?.[0]?.index ?? 0;
                    const previousText = this.getBestPreviousCandidateText(candidateIndex, text);
                    let delta;
                    if (text === previousText ||
                        (text.trim() && text.trim() === previousText.trim()) ||
                        previousText.includes(text)) {
                        delta = null;
                    }
                    else if (text.startsWith(previousText)) {
                        delta = text.slice(previousText.length);
                    }
                    else {
                        delta = text;
                    }
                    this.lastCandidateTexts.set(candidateIndex, text);
                    if (delta && delta.length > 0) {
                        const filteredDelta = this.filterThinkingLineDuplicates(candidateIndex, delta);
                        if (filteredDelta.length > 0 &&
                            this.shouldEmitTextDelta(candidateIndex, filteredDelta)) {
                            yield { type: GeminiEventType.Content, value: filteredDelta };
                        }
                    }
                }
                // Handle function calls (requesting tool execution)
                const functionCalls = this.getFunctionCallsFromResponse(resp);
                for (const fnCall of functionCalls) {
                    const event = this.handlePendingFunctionCall(fnCall);
                    if (event) {
                        yield event;
                    }
                }
                // Check if response was truncated or stopped for various reasons
                const finishReason = resp.candidates?.[0]?.finishReason;
                // Only yield 'Finished' once, on the first chunk with a finishReason.
                // This prevents premature turn termination when multiple chunks have finish reasons.
                if (finishReason && !this.finishedEventEmitted) {
                    this.finishReason = finishReason;
                    this.finishedEventEmitted = true;
                    yield {
                        type: GeminiEventType.Finished,
                        value: finishReason,
                    };
                }
            }
        }
        catch (e) {
            if (signal.aborted) {
                yield { type: GeminiEventType.UserCancelled };
                // Regular cancellation error, fail gracefully.
                return;
            }
            const error = toFriendlyError(e);
            if (error instanceof UnauthorizedError) {
                throw error;
            }
            const contextForReport = [...this.chat.getHistory(/*curated*/ true), req];
            await reportError(error, "Error when talking to API", contextForReport, "Turn.run-sendMessageStream");
            const status = typeof error === "object" &&
                error !== null &&
                "status" in error &&
                typeof error.status === "number"
                ? error.status
                : undefined;
            const structuredError = {
                message: getErrorMessage(error),
                status,
            };
            await this.chat.maybeIncludeSchemaDepthContext(structuredError);
            yield { type: GeminiEventType.Error, value: { error: structuredError } };
            return;
        }
    }
    handlePendingFunctionCall(fnCall) {
        const callId = fnCall.id ??
            `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const name = fnCall.name || "undefined_tool_name";
        const args = (fnCall.args || {});
        const toolCallRequest = {
            callId,
            name,
            args,
            isClientInitiated: false,
            prompt_id: this.prompt_id,
        };
        this.pendingToolCalls.push(toolCallRequest);
        // Yield a request for the tool call, not the pending/confirming status
        return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
    }
    getDebugResponses() {
        return this.debugResponses;
    }
    extractThoughtSummary(resp) {
        const thoughtPart = resp.candidates?.[0]?.content?.parts?.find((part) => !!part?.thought);
        if (!thoughtPart) {
            return null;
        }
        // Thought always has a bold "subject" part enclosed in double asterisks
        // (e.g., **Subject**). The rest of the string is considered the description.
        const rawText = thoughtPart.text ?? "";
        const subjectStringMatches = rawText.match(/\*\*(.*?)\*\*/s);
        const subject = subjectStringMatches ? subjectStringMatches[1].trim() : "";
        const description = rawText.replace(/\*\*(.*?)\*\*/s, "").trim();
        return {
            subject,
            description,
        };
    }
    getVisibleResponseText(resp) {
        const parts = resp.candidates?.[0]?.content?.parts;
        if (!parts || parts.length === 0) {
            return null;
        }
        const textSegments = parts
            .filter((part) => !part.thought)
            .map((part) => (typeof part.text === "string" ? part.text : ""))
            .filter((segment) => segment.length > 0);
        return textSegments.length > 0 ? textSegments.join("") : null;
    }
    getFunctionCallsFromResponse(resp) {
        const responseFunctionCalls = resp.functionCalls ?? [];
        const partFunctionCalls = resp.candidates?.[0]?.content?.parts
            ?.map((part) => part.functionCall)
            .filter((call) => !!call) ?? [];
        const mergedCalls = [...responseFunctionCalls, ...partFunctionCalls];
        const dedupedCalls = [];
        const seen = new Set();
        for (const call of mergedCalls) {
            const key = `${call.id ?? ""}:${call.name ?? ""}:${JSON.stringify(call.args ?? {})}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            dedupedCalls.push(call);
        }
        return dedupedCalls;
    }
    shouldEmitThought(thought) {
        const normalized = this.normalizeThought(thought);
        if (!normalized) {
            return false;
        }
        if (this.emittedThoughtHashes.has(normalized)) {
            return false;
        }
        this.emittedThoughtHashes.add(normalized);
        return true;
    }
    getBestPreviousCandidateText(index, text) {
        let best = this.lastCandidateTexts.get(index) ?? "";
        for (const previous of this.lastCandidateTexts.values()) {
            if (!previous) {
                continue;
            }
            if (text === previous) {
                return previous;
            }
            if (text.startsWith(previous) && previous.length > best.length) {
                best = previous;
            }
        }
        return best;
    }
    normalizeThought(thought) {
        return `${thought.subject}::${thought.description}`
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }
    shouldEmitTextDelta(index, delta) {
        // For thinking blocks, use a lower threshold since they tend to be shorter
        const isThinkingBlock = delta.includes("💭");
        const MIN_LENGTH_FOR_DEDUP = isThinkingBlock ? 20 : 80;
        const normalized = delta.toLowerCase().replace(/\s+/g, " ").trim();
        if (!normalized || delta.length < MIN_LENGTH_FOR_DEDUP) {
            return true;
        }
        let tracker = this.textDuplicateTrackers.get(index);
        if (!tracker) {
            tracker = new Map();
            this.textDuplicateTrackers.set(index, tracker);
        }
        const count = tracker.get(normalized) ?? 0;
        if (count >= 1) {
            tracker.set(normalized, count + 1);
            return false;
        }
        tracker.set(normalized, count + 1);
        if (tracker.size > 20) {
            const iterator = tracker.keys().next();
            if (!iterator.done && iterator.value !== undefined) {
                tracker.delete(iterator.value);
            }
        }
        return true;
    }
    filterThinkingLineDuplicates(index, delta) {
        const thinkingRegex = /(\s*💭[^\n]*(?:\n\s{2,}\*[^\n]*)*)/g;
        let result = "";
        let lastIndex = 0;
        let match;
        while ((match = thinkingRegex.exec(delta)) !== null) {
            result += delta.slice(lastIndex, match.index);
            const block = match[0];
            if (this.shouldEmitThinkingTextBlock(index, block)) {
                result += block;
            }
            lastIndex = thinkingRegex.lastIndex;
        }
        result += delta.slice(lastIndex);
        return result;
    }
    shouldEmitThinkingTextBlock(index, block) {
        if (!block.trim()) {
            return false;
        }
        let tracker = this.thinkingBlockTrackers.get(index);
        if (!tracker) {
            tracker = new Map();
            this.thinkingBlockTrackers.set(index, tracker);
        }
        // Use a more conservative normalization that preserves semantic meaning
        // Remove only the emoji and extra whitespace, but keep punctuation and structure
        const normalized = block
            .replace(/💭/g, "") // Remove the thinking emoji
            .toLowerCase()
            .replace(/\s+/g, " ") // Normalize whitespace
            .trim();
        if (!normalized) {
            return true;
        }
        const count = tracker.get(normalized) ?? 0;
        tracker.set(normalized, count + 1);
        return count === 0;
    }
}
//# sourceMappingURL=turn.js.map