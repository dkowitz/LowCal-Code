/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import OpenAI from "openai";
import type { Config } from "../../../config/config.js";
import type { ContentGeneratorConfig } from "../../contentGenerator.js";
import { DefaultOpenAICompatibleProvider } from "./default.js";
/**
 * Provider for llama.cpp's built-in OpenAI-compatible HTTP server (llama-server).
 *
 * Key differences from LM Studio:
 * - We manage the server process lifecycle ourselves (via LlamaCppProcessManager)
 * - No authentication needed (local-only)
 * - Supports prefix caching via cache_control markers (same as LM Studio)
 */
export declare class LlamaCppOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
    constructor(contentGeneratorConfig: ContentGeneratorConfig, cliConfig: Config);
    /**
     * Detect if the current config points to a llama.cpp server.
     */
    static isLlamaCppProvider(contentGeneratorConfig: ContentGeneratorConfig): boolean;
    buildHeaders(): Record<string, string | undefined>;
    buildClient(): OpenAI;
    shouldUseResponses(_model: string): boolean;
    /**
     * Build and configure the request for llama.cpp server.
     *
     * Enforces max_tokens to prevent runaway reasoning loops.
     */
    buildRequest(request: OpenAI.Chat.ChatCompletionCreateParams, _userPromptId: string): OpenAI.Chat.ChatCompletionCreateParams;
}
