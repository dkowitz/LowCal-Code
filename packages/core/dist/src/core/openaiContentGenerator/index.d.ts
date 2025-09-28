/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContentGenerator, ContentGeneratorConfig } from '../contentGenerator.js';
import type { Config } from '../../config/config.js';
import { type OpenAICompatibleProvider } from './provider/index.js';
export { OpenAIContentGenerator } from './openaiContentGenerator.js';
export { ContentGenerationPipeline, type PipelineConfig } from './pipeline.js';
export { type OpenAICompatibleProvider, DashScopeOpenAICompatibleProvider, OpenRouterOpenAICompatibleProvider, } from './provider/index.js';
export { OpenAIContentConverter } from './converter.js';
/**
 * Create an OpenAI-compatible content generator with the appropriate provider
 */
export declare function createOpenAIContentGenerator(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config): ContentGenerator;
/**
 * Determine the appropriate provider based on configuration
 */
export declare function determineProvider(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config): OpenAICompatibleProvider;
export { type TelemetryService, type RequestContext, DefaultTelemetryService, } from './telemetryService.js';
export { type ErrorHandler, EnhancedErrorHandler } from './errorHandler.js';
