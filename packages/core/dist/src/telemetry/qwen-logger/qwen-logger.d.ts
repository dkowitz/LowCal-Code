/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { StartSessionEvent, UserPromptEvent, ToolCallEvent, ApiRequestEvent, ApiResponseEvent, ApiErrorEvent, FileOperationEvent, FlashFallbackEvent, LoopDetectedEvent, NextSpeakerCheckEvent, SlashCommandEvent, MalformedJsonResponseEvent, IdeConnectionEvent, KittySequenceOverflowEvent, ChatCompressionEvent, InvalidChunkEvent, ContentRetryEvent, ContentRetryFailureEvent, ConversationFinishedEvent, SubagentExecutionEvent } from '../types.js';
import { EndSessionEvent } from '../types.js';
import type { RumEvent, RumViewEvent, RumActionEvent, RumResourceEvent, RumExceptionEvent, RumPayload } from './event-types.js';
import type { Config } from '../../config/config.js';
export interface LogResponse {
    nextRequestWaitMs?: number;
}
export declare class QwenLogger {
    private static instance;
    private config?;
    private readonly installationManager;
    /**
     * Queue of pending events that need to be flushed to the server. New events
     * are added to this queue and then flushed on demand (via `flushToRum`)
     */
    private readonly events;
    /**
     * The last time that the events were successfully flushed to the server.
     */
    private lastFlushTime;
    private userId;
    private sessionId;
    /**
     * The value is true when there is a pending flush happening. This prevents
     * concurrent flush operations.
     */
    private isFlushInProgress;
    /**
     * This value is true when a flush was requested during an ongoing flush.
     */
    private pendingFlush;
    private isShutdown;
    private constructor();
    private generateUserId;
    static getInstance(config?: Config): QwenLogger | undefined;
    enqueueLogEvent(event: RumEvent): void;
    createRumEvent(eventType: 'view' | 'action' | 'exception' | 'resource', type: string, name: string, properties: Partial<RumEvent>): RumEvent;
    createViewEvent(type: string, name: string, properties: Partial<RumViewEvent>): RumEvent;
    createActionEvent(type: string, name: string, properties: Partial<RumActionEvent>): RumEvent;
    createResourceEvent(type: string, name: string, properties: Partial<RumResourceEvent>): RumEvent;
    createExceptionEvent(type: string, name: string, properties: Partial<RumExceptionEvent>): RumEvent;
    createRumPayload(): Promise<RumPayload>;
    flushIfNeeded(): void;
    flushToRum(): Promise<LogResponse>;
    logStartSessionEvent(event: StartSessionEvent): void;
    logNewPromptEvent(event: UserPromptEvent): void;
    logToolCallEvent(event: ToolCallEvent): void;
    logFileOperationEvent(event: FileOperationEvent): void;
    logApiRequestEvent(event: ApiRequestEvent): void;
    logApiResponseEvent(event: ApiResponseEvent): void;
    logApiErrorEvent(event: ApiErrorEvent): void;
    logFlashFallbackEvent(event: FlashFallbackEvent): void;
    logLoopDetectedEvent(event: LoopDetectedEvent): void;
    logNextSpeakerCheck(event: NextSpeakerCheckEvent): void;
    logSlashCommandEvent(event: SlashCommandEvent): void;
    logMalformedJsonResponseEvent(event: MalformedJsonResponseEvent): void;
    logIdeConnectionEvent(event: IdeConnectionEvent): void;
    logConversationFinishedEvent(event: ConversationFinishedEvent): void;
    logKittySequenceOverflowEvent(event: KittySequenceOverflowEvent): void;
    logChatCompressionEvent(event: ChatCompressionEvent): void;
    logInvalidChunkEvent(event: InvalidChunkEvent): void;
    logContentRetryEvent(event: ContentRetryEvent): void;
    logContentRetryFailureEvent(event: ContentRetryFailureEvent): void;
    logSubagentExecutionEvent(event: SubagentExecutionEvent): void;
    logEndSessionEvent(_event: EndSessionEvent): void;
    getProxyAgent(): HttpsProxyAgent<string> | undefined;
    shutdown(): void;
    private requeueFailedEvents;
}
export declare const TEST_ONLY: {
    MAX_RETRY_EVENTS: number;
    MAX_EVENTS: number;
    FLUSH_INTERVAL_MS: number;
};
