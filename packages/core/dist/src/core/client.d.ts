/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type Content, type GenerateContentConfig, type GenerateContentResponse, type PartListUnion } from "@google/genai";
import type { UserTierId } from "../code_assist/types.js";
import type { Config } from "../config/config.js";
import type { ContentGenerator, ContentGeneratorConfig } from "./contentGenerator.js";
import { GeminiChat } from "./geminiChat.js";
import type { ChatCompressionInfo, ServerGeminiStreamEvent } from "./turn.js";
import { Turn } from "./turn.js";
/**
 * Returns the index of the content after the fraction of the total characters in the history.
 *
 * Exported for testing purposes.
 */
export declare function findIndexAfterFraction(history: Content[], fraction: number): number;
export declare class GeminiClient {
    private readonly config;
    private chat?;
    private contentGenerator?;
    private readonly embeddingModel;
    private readonly generateContentConfig;
    private sessionTurnCount;
    private readonly loopDetector;
    private lastPromptId;
    private lastSentIdeContext;
    private forceFullIdeContext;
    private tokenBudgetManager?;
    /**
     * At any point in this conversation, was compression triggered without
     * being forced and did it fail?
     */
    private hasFailedCompressionAttempt;
    constructor(config: Config);
    initialize(contentGeneratorConfig: ContentGeneratorConfig, extraHistory?: Content[]): Promise<void>;
    getContentGenerator(): ContentGenerator;
    private getTokenBudgetManager;
    getUserTier(): UserTierId | undefined;
    addHistory(content: Content): Promise<void>;
    getChat(): GeminiChat;
    isInitialized(): boolean;
    getHistory(): Content[];
    setHistory(history: Content[], { stripThoughts }?: {
        stripThoughts?: boolean;
    }): void;
    private getActiveToolDeclarations;
    setTools(): Promise<void>;
    resetChat(): Promise<void>;
    /**
     * Reinitializes the chat with the current contentGeneratorConfig while preserving chat history.
     * This creates a new chat object using the existing history and updated configuration.
     * Should be called when configuration changes (model, auth, etc.) to ensure consistency.
     */
    reinitialize(): Promise<void>;
    addDirectoryContext(): Promise<void>;
    startChat(extraHistory?: Content[], model?: string): Promise<GeminiChat>;
    private getIdeContextParts;
    sendMessageStream(request: PartListUnion, signal: AbortSignal, prompt_id: string, turns?: number, originalModel?: string): AsyncGenerator<ServerGeminiStreamEvent, Turn>;
    private shouldAutoContinueTurn;
    private buildContinuationPrompt;
    private isPlanIntentText;
    private isRepeatedPlanResponse;
    private getRecentModelTexts;
    private normalizeTextForComparison;
    private ensureRequestWithinBudget;
    /**
     * Self-healing recovery from context overflow using adaptive compression.
     * This is a last-resort fallback when standard compression fails.
     */
    private tryAdaptiveRecovery;
    private pruneStaleMediaPayloads;
    private pruneOversizedToolOutputs;
    private runNonStreamingFallback;
    generateJson(contents: Content[], schema: Record<string, unknown>, abortSignal: AbortSignal, model?: string, config?: GenerateContentConfig): Promise<Record<string, unknown>>;
    generateContent(contents: Content[], generationConfig: GenerateContentConfig, abortSignal: AbortSignal, model?: string): Promise<GenerateContentResponse>;
    generateEmbedding(texts: string[]): Promise<number[][]>;
    tryCompressChat(prompt_id: string, force?: boolean, options?: {
        preserveFraction?: number;
    }): Promise<ChatCompressionInfo>;
    /**
     * Auto-compress using a dedicated OpenRouter model when configured.
     *
     * When autocompress is enabled with an openRouterModel setting, this method:
     * 1. Checks if context has exceeded the user-defined threshold
     * 2. Temporarily switches auth to OpenRouter + configured model
     * 3. Runs compression via tryCompressChat(force=true)
     * 4. Restores original session state (auth, model) in a finally block
     *
     * Returns COMPRESSED on success, NOOP when not triggered or already below threshold.
     */
    autoCompress(promptId: string): Promise<ChatCompressionInfo>;
    /**
     * Mid-turn auto-compress check. Safe to call between tool execution rounds
     * during long agentic runs. Unlike autoCompress(), this doesn't require a
     * promptId since it's not tied to a specific sendMessageStream call.
     */
    checkMidTurnAutoCompress(): Promise<ChatCompressionInfo>;
    /**
     * Handles falling back to Flash model when persistent 429 errors occur for OAuth users.
     * Uses a fallback handler if provided by the config; otherwise, returns null.
     */
    private handleFlashFallback;
    /**
     * Handles Qwen OAuth authentication errors and rate limiting
     */
    private handleQwenOAuthError;
}
export declare const TEST_ONLY: {
    COMPRESSION_PRESERVE_THRESHOLD: number;
    COMPRESSION_TOKEN_THRESHOLD: number;
};
