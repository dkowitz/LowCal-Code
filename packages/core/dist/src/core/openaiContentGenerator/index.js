/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { DashScopeOpenAICompatibleProvider, OpenRouterOpenAICompatibleProvider, LMStudioOpenAICompatibleProvider, DefaultOpenAICompatibleProvider, } from './provider/index.js';
export { OpenAIContentGenerator } from './openaiContentGenerator.js';
export { ContentGenerationPipeline } from './pipeline.js';
export { DashScopeOpenAICompatibleProvider, OpenRouterOpenAICompatibleProvider, } from './provider/index.js';
export { OpenAIContentConverter } from './converter.js';
/**
 * Create an OpenAI-compatible content generator with the appropriate provider
 */
export function createOpenAIContentGenerator(contentGeneratorConfig, cliConfig) {
    const provider = determineProvider(contentGeneratorConfig, cliConfig);
    return new OpenAIContentGenerator(contentGeneratorConfig, cliConfig, provider);
}
/**
 * Determine the appropriate provider based on configuration
 */
export function determineProvider(contentGeneratorConfig, cliConfig) {
    const config = contentGeneratorConfig || cliConfig.getContentGeneratorConfig();
    // Check for LM Studio provider
    if (LMStudioOpenAICompatibleProvider.isLMStudioProvider(config)) {
        return new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, cliConfig);
    }
    // Check for DashScope provider
    if (DashScopeOpenAICompatibleProvider.isDashScopeProvider(config)) {
        return new DashScopeOpenAICompatibleProvider(contentGeneratorConfig, cliConfig);
    }
    // Check for OpenRouter provider
    if (OpenRouterOpenAICompatibleProvider.isOpenRouterProvider(config)) {
        return new OpenRouterOpenAICompatibleProvider(contentGeneratorConfig, cliConfig);
    }
    // Default provider for standard OpenAI-compatible APIs
    return new DefaultOpenAICompatibleProvider(contentGeneratorConfig, cliConfig);
}
// Services
export { DefaultTelemetryService, } from './telemetryService.js';
export { EnhancedErrorHandler } from './errorHandler.js';
//# sourceMappingURL=index.js.map