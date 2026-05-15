/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import OpenAI from "openai";
import { Agent } from "undici";
import type { Config } from "../../../config/config.js";
import type { ContentGeneratorConfig } from "../../contentGenerator.js";
import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT } from "../constants.js";
import { DefaultOpenAICompatibleProvider } from "./default.js";

const LLAMA_CPP_MIN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — local model loads are slow
const LLAMA_CPP_MAX_TOKENS = 8000; // Prevent runaway reasoning loops
const LLAMA_CPP_DUMMY_KEY = "llamacpp-local-key";

const llamaCppDispatcher = new Agent({
  bodyTimeout: 0, // allow arbitrarily long gaps while the model loads or processes
  headersTimeout: 0,
});

/**
 * Provider for llama.cpp's built-in OpenAI-compatible HTTP server (llama-server).
 *
 * Key differences from LM Studio:
 * - We manage the server process lifecycle ourselves (via LlamaCppProcessManager)
 * - No authentication needed (local-only)
 * - Supports prefix caching via cache_control markers (same as LM Studio)
 */
export class LlamaCppOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    cliConfig: Config,
  ) {
    super(contentGeneratorConfig, cliConfig);
  }

  /**
   * Detect if the current config points to a llama.cpp server.
   */
  static isLlamaCppProvider(
    contentGeneratorConfig: ContentGeneratorConfig,
  ): boolean {
    // Check for our dummy API key marker
    if (contentGeneratorConfig.apiKey === LLAMA_CPP_DUMMY_KEY) {
      return true;
    }

    const baseURL = contentGeneratorConfig.baseUrl || "";
    if (!baseURL) return false;

    // Check for llama.cpp-specific port patterns or env markers
    try {
      const parsed = new URL(baseURL);
      // Default llama-server port is 8080, but it's configurable
      // We primarily rely on the dummy key check above
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        // Check for LLAMA_CPP_PORT env var match
        const llamacppPort = process.env["LLAMA_CPP_PORT"] || "8080";
        if (parsed.port === llamacppPort) {
          return true;
        }
      }
    } catch {
      // URL parsing failed — fall through to string checks
    }

    return false;
  }

  override buildHeaders(): Record<string, string | undefined> {
    const baseHeaders = super.buildHeaders();
    // llama.cpp server doesn't need special headers, keep it minimal
    return baseHeaders;
  }

  override buildClient(): OpenAI {
    const {
      apiKey,
      baseUrl,
      timeout = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
    } = this.contentGeneratorConfig;

    const effectiveTimeout = Math.max(timeout ?? 0, LLAMA_CPP_MIN_TIMEOUT_MS);

    return new OpenAI({
      apiKey: apiKey || LLAMA_CPP_DUMMY_KEY,
      baseURL: baseUrl,
      timeout: effectiveTimeout,
      maxRetries,
      defaultHeaders: this.buildHeaders(),
      fetchOptions: {
        dispatcher: llamaCppDispatcher,
      },
    });
  }

  override shouldUseResponses(_model: string): boolean {
    // llama.cpp does not support the Responses API.
    return false;
  }

  /**
   * Build and configure the request for llama.cpp server.
   *
   * Enforces max_tokens to prevent runaway reasoning loops.
   */
  override buildRequest(
    request: OpenAI.Chat.ChatCompletionCreateParams,
    _userPromptId: string,
  ): OpenAI.Chat.ChatCompletionCreateParams {
    const maxTokens = request.max_tokens ?? LLAMA_CPP_MAX_TOKENS;

    return {
      ...request,
      max_tokens: maxTokens,
    };
  }
}
