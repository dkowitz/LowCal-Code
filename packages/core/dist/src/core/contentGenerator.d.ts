/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CountTokensParameters, CountTokensResponse, EmbedContentParameters, EmbedContentResponse, GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import type { Config } from '../config/config.js';
import type { UserTierId } from '../code_assist/types.js';
/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
    generateContent(request: GenerateContentParameters, userPromptId: string): Promise<GenerateContentResponse>;
    generateContentStream(request: GenerateContentParameters, userPromptId: string): Promise<AsyncGenerator<GenerateContentResponse>>;
    countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
    embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
    userTier?: UserTierId;
}
export declare enum AuthType {
    LOGIN_WITH_GOOGLE = "oauth-personal",
    USE_GEMINI = "gemini-api-key",
    USE_VERTEX_AI = "vertex-ai",
    CLOUD_SHELL = "cloud-shell",
    USE_OPENAI = "openai",
    QWEN_OAUTH = "qwen-oauth"
}
export type ContentGeneratorConfig = {
    model: string;
    apiKey?: string;
    baseUrl?: string;
    vertexai?: boolean;
    authType?: AuthType | undefined;
    enableOpenAILogging?: boolean;
    timeout?: number;
    maxRetries?: number;
    disableCacheControl?: boolean;
    samplingParams?: {
        top_p?: number;
        top_k?: number;
        repetition_penalty?: number;
        presence_penalty?: number;
        frequency_penalty?: number;
        temperature?: number;
        max_tokens?: number;
    };
    proxy?: string | undefined;
    userAgent?: string;
};
export declare function createContentGeneratorConfig(config: Config, authType: AuthType | undefined): ContentGeneratorConfig;
export declare function createContentGenerator(config: ContentGeneratorConfig, gcConfig: Config, sessionId?: string): Promise<ContentGenerator>;
