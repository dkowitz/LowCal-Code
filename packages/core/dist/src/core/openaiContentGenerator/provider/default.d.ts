import OpenAI from 'openai';
import type { Config } from '../../../config/config.js';
import type { ContentGeneratorConfig } from '../../contentGenerator.js';
import type { OpenAICompatibleProvider } from './types.js';
/**
 * Default provider for standard OpenAI-compatible APIs
 */
export declare class DefaultOpenAICompatibleProvider implements OpenAICompatibleProvider {
    protected contentGeneratorConfig: ContentGeneratorConfig;
    protected cliConfig: Config;
    constructor(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config);
    buildHeaders(): Record<string, string | undefined>;
    buildClient(): OpenAI;
    buildRequest(request: OpenAI.Chat.ChatCompletionCreateParams, _userPromptId: string): OpenAI.Chat.ChatCompletionCreateParams;
}
