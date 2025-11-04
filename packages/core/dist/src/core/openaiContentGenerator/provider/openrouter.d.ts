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
     * After fetching the list of models from OpenRouter, call this helper to
     * apply dynamic context limits reported by the provider. This ensures the
     * UI and TokenBudgetManager use the accurate context window sizes.
     */
    static applyProviderContextLimits(models: any[]): void;
}
