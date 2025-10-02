/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '../../config/config.js';
import type { GenerateContentResponse } from '@google/genai';
import type OpenAI from 'openai';
export interface RequestContext {
    userPromptId: string;
    model: string;
    authType: string;
    startTime: number;
    duration: number;
    isStreaming: boolean;
}
export interface TelemetryService {
    logSuccess(context: RequestContext, response: GenerateContentResponse, openaiRequest?: OpenAI.Chat.ChatCompletionCreateParams, openaiResponse?: OpenAI.Chat.ChatCompletion): Promise<void>;
    logError(context: RequestContext, error: unknown, openaiRequest?: OpenAI.Chat.ChatCompletionCreateParams): Promise<void>;
    logStreamingSuccess(context: RequestContext, responses: GenerateContentResponse[], openaiRequest?: OpenAI.Chat.ChatCompletionCreateParams, openaiChunks?: OpenAI.Chat.ChatCompletionChunk[]): Promise<void>;
}
export declare class DefaultTelemetryService implements TelemetryService {
    private config;
    private enableOpenAILogging;
    constructor(config: Config, enableOpenAILogging?: boolean);
    logSuccess(context: RequestContext, response: GenerateContentResponse, openaiRequest?: OpenAI.Chat.ChatCompletionCreateParams, openaiResponse?: OpenAI.Chat.ChatCompletion): Promise<void>;
    logError(context: RequestContext, error: unknown, openaiRequest?: OpenAI.Chat.ChatCompletionCreateParams): Promise<void>;
    logStreamingSuccess(context: RequestContext, responses: GenerateContentResponse[], openaiRequest?: OpenAI.Chat.ChatCompletionCreateParams, openaiChunks?: OpenAI.Chat.ChatCompletionChunk[]): Promise<void>;
    /**
     * Combine OpenAI chunks for logging purposes
     * This method consolidates all OpenAI stream chunks into a single ChatCompletion response
     * for telemetry and logging purposes, avoiding unnecessary format conversions
     */
    private combineOpenAIChunksForLogging;
}
