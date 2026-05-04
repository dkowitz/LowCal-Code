import type OpenAI from "openai";
import type { Config } from "../../../config/config.js";
import type { ContentGeneratorConfig } from "../../contentGenerator.js";
import { DefaultOpenAICompatibleProvider } from "./default.js";
export declare class OpenRouterOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    constructor(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config);
    static isOpenRouterProvider(contentGeneratorConfig: ContentGeneratorConfig): boolean;
    buildHeaders(): Record<string, string | undefined>;
    buildRequest(request: OpenAI.Chat.ChatCompletionCreateParams, userPromptId: string): OpenAI.Chat.ChatCompletionCreateParams;
    /**
     * Add cache_control markers to optimize prefix caching.
     *
     * OpenRouter supports prompt caching across multiple upstream providers:
     * - Automatic: OpenAI, Grok, Moonshot, Groq, DeepSeek, Gemini 2.5
     * - Explicit: Anthropic Claude, older Gemini models
     *
     * For Anthropic models, we add top-level cache_control for automatic multi-turn caching.
     * For all models, we add explicit cache_control breakpoints to system and last messages.
     *
     * Cost savings: Cache reads are 0.1x-0.5x cost depending on provider.
     */
    private addCacheControl;
    /**
     * Add cache_control markers to system and last user messages.
     *
     * Strategy:
     * - System message: ephemeral cache (stays cached during session)
     * - Last user/assistant message: ephemeral cache (most recent turn)
     *
     * This enables prefix caching for conversation history, dramatically reducing
     * token costs and latency for multi-turn conversations.
     */
    private addCacheControlMarkers;
    /**
     * Add cache_control marker to a message's content.
     */
    private addCacheToMessage;
    /**
     * Check if cache control should be disabled via config.
     */
    private shouldDisableCacheControl;
    /**
     * After fetching the list of models from OpenRouter, call this helper to
     * apply dynamic context limits reported by the provider. This ensures the
     * UI and TokenBudgetManager use the accurate context window sizes.
     */
    static applyProviderContextLimits(models: unknown[]): void;
}
