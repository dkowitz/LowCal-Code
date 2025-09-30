/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Part, PartListUnion, GenerateContentResponse, FunctionDeclaration, FinishReason } from "@google/genai";
import type { ToolCallConfirmationDetails, ToolResult, ToolResultDisplay } from "../tools/tools.js";
import type { ToolErrorType } from "../tools/tool-error.js";
import type { GeminiChat } from "./geminiChat.js";
export interface ServerTool {
    name: string;
    schema: FunctionDeclaration;
    execute(params: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult>;
    shouldConfirmExecute(params: Record<string, unknown>, abortSignal: AbortSignal): Promise<ToolCallConfirmationDetails | false>;
}
export declare enum GeminiEventType {
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
    TokenBudgetWarning = "token_budget_warning"
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
export declare enum CompressionStatus {
    /** The compression was successful */
    COMPRESSED = 1,
    /** The compression failed due to the compression inflating the token count */
    COMPRESSION_FAILED_INFLATED_TOKEN_COUNT = 2,
    /** The compression failed due to an error counting tokens */
    COMPRESSION_FAILED_TOKEN_COUNT_ERROR = 3,
    /** The compression was not necessary and no action was taken */
    NOOP = 4
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
export type ServerGeminiStreamEvent = ServerGeminiContentEvent | ServerGeminiToolCallRequestEvent | ServerGeminiToolCallResponseEvent | ServerGeminiToolCallConfirmationEvent | ServerGeminiUserCancelledEvent | ServerGeminiErrorEvent | ServerGeminiChatCompressedEvent | ServerGeminiThoughtEvent | ServerGeminiMaxSessionTurnsEvent | ServerGeminiSessionTokenLimitExceededEvent | ServerGeminiFinishedEvent | ServerGeminiLoopDetectedEvent | ServerGeminiTokenBudgetWarningEvent | ServerGeminiRetryEvent;
export declare class Turn {
    private readonly chat;
    private readonly prompt_id;
    readonly pendingToolCalls: ToolCallRequestInfo[];
    private debugResponses;
    finishReason: FinishReason | undefined;
    constructor(chat: GeminiChat, prompt_id: string);
    run(req: PartListUnion, signal: AbortSignal): AsyncGenerator<ServerGeminiStreamEvent>;
    private handlePendingFunctionCall;
    getDebugResponses(): GenerateContentResponse[];
}
