import OpenAI from "openai";
import { Agent } from "undici";
import type { Config } from "../../../config/config.js";
import type { ContentGeneratorConfig } from "../../contentGenerator.js";
import { DEFAULT_MAX_RETRIES, DEFAULT_TIMEOUT } from "../constants.js";
import { DefaultOpenAICompatibleProvider } from "./default.js";
import type {
  ChatCompletionContentPartTextWithCache,
  ChatCompletionContentPartWithCache,
} from "./types.js";

const LM_STUDIO_MIN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes; local loads can be slow

const lmStudioDispatcher = new Agent({
  bodyTimeout: 0, // allow arbitrarily long gaps while the model loads or processes the prompt
  headersTimeout: 0,
});

export class LMStudioOpenAICompatibleProvider extends DefaultOpenAICompatibleProvider {
  constructor(
    contentGeneratorConfig: ContentGeneratorConfig,
    cliConfig: Config,
  ) {
    super(contentGeneratorConfig, cliConfig);
  }

  static isLMStudioProvider(
    contentGeneratorConfig: ContentGeneratorConfig,
  ): boolean {
    const baseURL = contentGeneratorConfig.baseUrl || "";
    if (!baseURL) return false;
    try {
      const parsed = new URL(baseURL);
      if (parsed.port === "1234") return true;
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    } catch {
      return (
        baseURL.includes("127.0.0.1:1234") ||
        baseURL.includes("localhost:1234") ||
        baseURL.includes(":1234")
      );
    }
  }

  override buildHeaders(): Record<string, string | undefined> {
    // Get base headers from parent class
    const baseHeaders = super.buildHeaders();

    // LM Studio might need specific headers or none at all
    // Remove any headers that might cause issues with LM Studio
    const { "User-Agent": _userAgent, ...filteredHeaders } = baseHeaders;

    return filteredHeaders;
  }

  override buildClient(): OpenAI {
    const {
      apiKey,
      baseUrl,
      timeout = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
    } = this.contentGeneratorConfig;

    const effectiveTimeout = Math.max(timeout ?? 0, LM_STUDIO_MIN_TIMEOUT_MS);

    return new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: effectiveTimeout,
      maxRetries,
      defaultHeaders: this.buildHeaders(),
      fetchOptions: {
        dispatcher: lmStudioDispatcher,
      },
    });
  }

  override shouldUseResponses(_model: string): boolean {
    // LM Studio does not support the Responses API.
    return false;
  }

  /**
   * Build and configure the request for LM Studio.
   * 
   * Adds cache_control markers to system message and last user message
   * to enable prefix caching in LM Studio (supported in v1.0+).
   * This dramatically improves response times for long conversations.
   */
  override buildRequest(
    request: OpenAI.Chat.ChatCompletionCreateParams,
    _userPromptId: string,
  ): OpenAI.Chat.ChatCompletionCreateParams {
    // Only add cache control if not disabled
    if (this.shouldDisableCacheControl()) {
      return request;
    }

    // Add cache_control markers for prefix caching optimization
    const messages = this.addCacheControlMarkers(request.messages);

    return {
      ...request,
      messages,
    };
  }

  /**
   * Add cache_control markers to system and last user messages.
   * 
   * LM Studio supports Anthropic-style cache_control for prompt caching.
   * By marking the system prompt and the last user message as cacheable,
   * we enable LM Studio to cache the conversation prefix and only process
   * new content on each turn.
   * 
   * Strategy:
   * - System message: ephemeral cache (stays cached during session)
   * - Last user message: ephemeral cache (most recent turn)
   */
  private addCacheControlMarkers(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    if (messages.length === 0) return messages;

    const updatedMessages = [...messages];

    // Mark system message as cacheable
    const systemIndex = updatedMessages.findIndex((m) => m.role === "system");
    if (systemIndex !== -1) {
      updatedMessages[systemIndex] = this.addCacheToMessage(
        updatedMessages[systemIndex],
      );
    }

    // Mark the last user/assistant message as cacheable
    // This helps cache the conversation history prefix
    if (updatedMessages.length > 1) {
      const lastIndex = updatedMessages.length - 1;
      updatedMessages[lastIndex] = this.addCacheToMessage(
        updatedMessages[lastIndex],
      );
    }

    return updatedMessages;
  }

  /**
   * Add cache_control marker to a message's content.
   */
  private addCacheToMessage(
    message: OpenAI.Chat.ChatCompletionMessageParam,
  ): OpenAI.Chat.ChatCompletionMessageParam {
    if (!("content" in message) || !message.content) {
      return message;
    }

    const content = message.content;

    // Handle string content
    if (typeof content === "string") {
      return {
        ...message,
        content: [
          {
            type: "text",
            text: content,
            cache_control: { type: "ephemeral" },
          } as ChatCompletionContentPartTextWithCache,
        ],
      } as OpenAI.Chat.ChatCompletionMessageParam;
    }

    // Handle array content
    if (Array.isArray(content)) {
      const updatedContent = [...content] as ChatCompletionContentPartWithCache[];
      // Add cache_control to the last text part
      for (let i = updatedContent.length - 1; i >= 0; i--) {
        const part = updatedContent[i];
        if (part && typeof part === "object" && "type" in part && part.type === "text") {
          (part as ChatCompletionContentPartTextWithCache).cache_control = {
            type: "ephemeral",
          };
          break;
        }
      }
      return {
        ...message,
        content: updatedContent,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    }

    return message;
  }

  /**
   * Check if cache control should be disabled via config.
   */
  private shouldDisableCacheControl(): boolean {
    return (
      this.cliConfig.getContentGeneratorConfig()?.disableCacheControl === true
    );
  }

  /**
   * Attempt to unload the current model in LM Studio.
   *
   * Note: LM Studio does not currently provide a dedicated REST API endpoint for unloading models.
   * Model unloading is typically managed through:
   * 1. SDK methods (model.unload())
   * 2. CLI commands (lms unload)
   * 3. Automatic unloading through Idle TTL and Auto-Evict features
   *
   * This method sends a request that may trigger model unloading in some versions of LM Studio,
   * but it's not guaranteed to work. The most reliable approach is to rely on LM Studio's
   * automatic model management features.
   */
  async unloadModel(): Promise<void> {
    try {
      // Create a temporary client for the unload request
      const tempClient = this.buildClient();

      // Send a request that might trigger model unloading
      // This is not guaranteed to work and is provided as a best-effort approach
      await tempClient.chat.completions.create({
        model: this.contentGeneratorConfig.model,
        messages: [{ role: "user", content: "" }],
        max_tokens: 1,
        temperature: 0,
      });
    } catch (error) {
      // We're not concerned with the result of this request
      // The purpose is to potentially trigger LM Studio's model management
      console.debug(
        "LM Studio model unload request sent (result not guaranteed):",
        error,
      );
    }
  }
}
