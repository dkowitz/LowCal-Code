/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Part,
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
  FunctionDeclaration,
  FinishReason,
} from "@google/genai";
import type {
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from "../tools/tools.js";
import type { ToolErrorType } from "../tools/tool-error.js";
import { getResponseText } from "../utils/partUtils.js";
import { reportError } from "../utils/errorReporting.js";
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from "../utils/errors.js";
import type { GeminiChat } from "./geminiChat.js";

// Define a structure for tools passed to the server
export interface ServerTool {
  name: string;
  schema: FunctionDeclaration;
  // The execute method signature might differ slightly or be wrapped
  execute(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
  shouldConfirmExecute(
    params: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;
}

export enum GeminiEventType {
  Content = "content",
  ToolCallRequest = "tool_call_request",
  ToolCallResponse = "tool_call_response",
  ToolCallConfirmation = "tool_call_confirmation",
  UserCancelled = "user_cancelled",
  Error = "error",
  ChatCompressed = "chat_compressed",
  Thought = "thought",
  MaxSessionTurns = "max_session_turns",
  SessionTokenLimitExceeded = "session_token_limit_exceeded",
  Finished = "finished",
  LoopDetected = "loop_detected",
  Citation = "citation",
  Retry = "retry",
  TokenBudgetWarning = "token_budget_warning",
  ContextWindowRecovery = "context_window_recovery",
  ToolOutputTruncated = "tool_output_truncated",
}

export type ServerGeminiRetryEvent = {
  type: GeminiEventType.Retry;
};

export interface StructuredError {
  message: string;
  status?: number;
}

export interface GeminiErrorEventValue {
  error: StructuredError;
}

export interface SessionTokenLimitExceededValue {
  currentTokens: number;
  limit: number;
  message: string;
}

export interface TokenBudgetWarningValue {
  tokens: number;
  limit: number;
  effectiveLimit: number;
}

export interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  prompt_id: string;
}

export interface ToolCallResponseInfo {
  callId: string;
  responseParts: Part[];
  resultDisplay: ToolResultDisplay | undefined;
  error: Error | undefined;
  errorType: ToolErrorType | undefined;
}

export interface ServerToolCallConfirmationDetails {
  request: ToolCallRequestInfo;
  details: ToolCallConfirmationDetails;
}

export type ThoughtSummary = {
  subject: string;
  description: string;
};

export type ServerGeminiContentEvent = {
  type: GeminiEventType.Content;
  value: string;
};

export type ServerGeminiThoughtEvent = {
  type: GeminiEventType.Thought;
  value: ThoughtSummary;
};

export type ServerGeminiToolCallRequestEvent = {
  type: GeminiEventType.ToolCallRequest;
  value: ToolCallRequestInfo;
};

export type ServerGeminiToolCallResponseEvent = {
  type: GeminiEventType.ToolCallResponse;
  value: ToolCallResponseInfo;
};

export type ServerGeminiToolCallConfirmationEvent = {
  type: GeminiEventType.ToolCallConfirmation;
  value: ServerToolCallConfirmationDetails;
};

export type ServerGeminiUserCancelledEvent = {
  type: GeminiEventType.UserCancelled;
};

export type ServerGeminiErrorEvent = {
  type: GeminiEventType.Error;
  value: GeminiErrorEventValue;
};

export enum CompressionStatus {
  /** The compression was successful */
  COMPRESSED = 1,

  /** The compression failed due to the compression inflating the token count */
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,

  /** The compression failed due to an error counting tokens */
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR,

  /** The compression was not necessary and no action was taken */
  NOOP,
}

export interface ChatCompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
  compressionStatus: CompressionStatus;
}

export type ServerGeminiChatCompressedEvent = {
  type: GeminiEventType.ChatCompressed;
  value: ChatCompressionInfo | null;
};

export type ServerGeminiMaxSessionTurnsEvent = {
  type: GeminiEventType.MaxSessionTurns;
};

export type ServerGeminiSessionTokenLimitExceededEvent = {
  type: GeminiEventType.SessionTokenLimitExceeded;
  value: SessionTokenLimitExceededValue;
};

export type ServerGeminiFinishedEvent = {
  type: GeminiEventType.Finished;
  value: FinishReason;
};

export type ServerGeminiLoopDetectedEvent = {
  type: GeminiEventType.LoopDetected;
};

export type ServerGeminiTokenBudgetWarningEvent = {
  type: GeminiEventType.TokenBudgetWarning;
  value: TokenBudgetWarningValue;
};

export interface ContextWindowRecoveryInfo {
  message: string;
}

export type ServerGeminiContextWindowRecoveryEvent = {
  type: GeminiEventType.ContextWindowRecovery;
  value: ContextWindowRecoveryInfo;
};

export interface ToolOutputTruncatedInfo {
  toolName: string;
  output: string;
}

export type ServerGeminiToolOutputTruncatedEvent = {
  type: GeminiEventType.ToolOutputTruncated;
  value: ToolOutputTruncatedInfo;
};

// The original union type, now composed of the individual types
export type ServerGeminiStreamEvent =
  | ServerGeminiContentEvent
  | ServerGeminiToolCallRequestEvent
  | ServerGeminiToolCallResponseEvent
  | ServerGeminiToolCallConfirmationEvent
  | ServerGeminiUserCancelledEvent
  | ServerGeminiErrorEvent
  | ServerGeminiChatCompressedEvent
  | ServerGeminiThoughtEvent
  | ServerGeminiMaxSessionTurnsEvent
  | ServerGeminiSessionTokenLimitExceededEvent
  | ServerGeminiFinishedEvent
  | ServerGeminiLoopDetectedEvent
  | ServerGeminiTokenBudgetWarningEvent
  | ServerGeminiContextWindowRecoveryEvent
  | ServerGeminiToolOutputTruncatedEvent
  | ServerGeminiRetryEvent;

// A turn manages the agentic loop turn within the server context.
export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[];
  private debugResponses: GenerateContentResponse[];
  finishReason: FinishReason | undefined;
  private emittedThoughtHashes: Set<string>;
  private lastCandidateTexts: Map<number, string>;
  private textDuplicateTrackers: Map<number, Map<string, number>>;
  private thinkingBlockTrackers: Map<number, Map<string, number>>;
  private finishedEventEmitted: boolean;

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
  ) {
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
  async *run(
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      // Note: This assumes `sendMessageStream` yields events like
      // { type: StreamEventType.RETRY } or { type: StreamEventType.CHUNK, value: GenerateContentResponse }
      const responseStream = await this.chat.sendMessageStream(
        {
          message: req,
          config: {
            abortSignal: signal,
          },
        },
        this.prompt_id,
      );

      for await (const streamEvent of responseStream) {
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          return;
        }

        // Handle the new RETRY event
        if (streamEvent.type === "retry") {
          this.lastCandidateTexts.clear();
          this.textDuplicateTrackers.clear();
          this.thinkingBlockTrackers.clear();
          this.emittedThoughtHashes.clear(); // CRITICAL: Reset thought deduplication on retry
          this.finishedEventEmitted = false; // Reset finished flag on retry
          yield { type: GeminiEventType.Retry };
          continue; // Skip to the next event in the stream
        }

        // Assuming other events are chunks with a `value` property
        const resp = streamEvent.value as GenerateContentResponse;
        if (!resp) continue; // Skip if there's no response body

        this.debugResponses.push(resp);

        const thoughtPart = resp.candidates?.[0]?.content?.parts?.[0];
        if (thoughtPart?.thought) {
          // Thought always has a bold "subject" part enclosed in double asterisks
          // (e.g., **Subject**). The rest of the string is considered the description.
          const rawText = thoughtPart.text ?? "";
          const subjectStringMatches = rawText.match(/\*\*(.*?)\*\*/s);
          const subject = subjectStringMatches
            ? subjectStringMatches[1].trim()
            : "";
          const description = rawText.replace(/\*\*(.*?)\*\*/s, "").trim();
          const thought: ThoughtSummary = {
            subject,
            description,
          };

          if (!this.shouldEmitThought(thought)) {
            continue;
          }

          yield {
            type: GeminiEventType.Thought,
            value: thought,
          };
          continue;
        }

        const text = getResponseText(resp);
        if (text) {
          const candidateIndex = resp.candidates?.[0]?.index ?? 0;
          const previousText =
            this.lastCandidateTexts.get(candidateIndex) ?? "";
          let delta: string | null;

          if (
            text === previousText ||
            (text.trim() && text.trim() === previousText.trim()) ||
            previousText.includes(text)
          ) {
            delta = null;
          } else if (text.startsWith(previousText)) {
            delta = text.slice(previousText.length);
          } else {
            delta = text;
          }

          this.lastCandidateTexts.set(candidateIndex, text);
          if (delta && delta.length > 0) {
            const filteredDelta = this.filterThinkingLineDuplicates(
              candidateIndex,
              delta,
            );
            if (
              filteredDelta.length > 0 &&
              this.shouldEmitTextDelta(candidateIndex, filteredDelta)
            ) {
              yield { type: GeminiEventType.Content, value: filteredDelta };
            }
          }
        }

        // Handle function calls (requesting tool execution)
        const functionCalls = resp.functionCalls ?? [];
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
            value: finishReason as FinishReason,
          };
        }
      }
    } catch (e) {
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
      await reportError(
        error,
        "Error when talking to API",
        contextForReport,
        "Turn.run-sendMessageStream",
      );
      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof (error as { status: unknown }).status === "number"
          ? (error as { status: number }).status
          : undefined;
      const structuredError: StructuredError = {
        message: getErrorMessage(error),
        status,
      };
      await this.chat.maybeIncludeSchemaDepthContext(structuredError);
      yield { type: GeminiEventType.Error, value: { error: structuredError } };
      return;
    }
  }

  private handlePendingFunctionCall(
    fnCall: FunctionCall,
  ): ServerGeminiStreamEvent | null {
    const callId =
      fnCall.id ??
      `${fnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = fnCall.name || "undefined_tool_name";
    const args = (fnCall.args || {}) as Record<string, unknown>;

    const toolCallRequest: ToolCallRequestInfo = {
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

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }

  private shouldEmitThought(thought: ThoughtSummary): boolean {
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

  private normalizeThought(thought: ThoughtSummary): string {
    return `${thought.subject}::${thought.description}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private shouldEmitTextDelta(index: number, delta: string): boolean {
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

  private filterThinkingLineDuplicates(index: number, delta: string): string {
    const thinkingRegex = /(\s*💭[^\n]*(?:\n\s{2,}\*[^\n]*)*)/g;
    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

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

  private shouldEmitThinkingTextBlock(index: number, block: string): boolean {
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
