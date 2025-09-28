import OpenAI from 'openai';
import type { Config } from '../../../config/config.js';
import type { ContentGeneratorConfig } from '../../contentGenerator.js';
import type { OpenAICompatibleProvider, DashScopeRequestMetadata } from './types.js';
export declare class DashScopeOpenAICompatibleProvider implements OpenAICompatibleProvider {
    private contentGeneratorConfig;
    private cliConfig;
    constructor(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config);
    static isDashScopeProvider(contentGeneratorConfig: ContentGeneratorConfig): boolean;
    buildHeaders(): Record<string, string | undefined>;
    buildClient(): OpenAI;
    /**
     * Build and configure the request for DashScope API.
     *
     * This method applies DashScope-specific configurations including:
     * - Cache control for system and user messages
     * - Output token limits based on model capabilities
     * - Vision model specific parameters (vl_high_resolution_images)
     * - Request metadata for session tracking
     *
     * @param request - The original chat completion request parameters
     * @param userPromptId - Unique identifier for the user prompt for session tracking
     * @returns Configured request with DashScope-specific parameters applied
     */
    buildRequest(request: OpenAI.Chat.ChatCompletionCreateParams, userPromptId: string): OpenAI.Chat.ChatCompletionCreateParams;
    buildMetadata(userPromptId: string): DashScopeRequestMetadata;
    /**
     * Add cache control flag to specified message(s) for DashScope providers
     */
    private addDashScopeCacheControl;
    /**
     * Helper method to add cache control to a specific message
     */
    private addCacheControlToMessage;
    /**
     * Find the index of the target message (system or last)
     */
    private findTargetMessageIndex;
    /**
     * Add cache control to message content, handling both string and array formats
     */
    private addCacheControlToContent;
    /**
     * Normalize content to array format
     */
    private normalizeContentToArray;
    /**
     * Add cache control to the content array
     */
    private addCacheControlToContentArray;
    /**
     * Apply output token limit to a request's max_tokens parameter.
     *
     * Ensures that existing max_tokens parameters don't exceed the model's maximum output
     * token limit. Only modifies max_tokens when already present in the request.
     *
     * @param request - The chat completion request parameters
     * @param model - The model name to get the output token limit for
     * @returns The request with max_tokens adjusted to respect the model's limits (if present)
     */
    private applyOutputTokenLimit;
    /**
     * Check if cache control should be disabled based on configuration.
     *
     * @returns true if cache control should be disabled, false otherwise
     */
    private shouldDisableCacheControl;
}
