/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type OpenAI from "openai";
import {
  type GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import type { Config } from "../../config/config.js";
import type { ContentGeneratorConfig } from "../contentGenerator.js";
import type { OpenAICompatibleProvider } from "./provider/index.js";
import { OpenAIContentConverter } from "./converter.js";
import type { TelemetryService, RequestContext } from "./telemetryService.js";
import type { ErrorHandler } from "./errorHandler.js";
import { openaiLogger } from "../../utils/openaiLogger.js";
import type {
  Response,
  ResponseStreamEvent,
  ResponseCreateParamsBase,
} from "openai/resources/responses/responses.js";

function truncateForLog(value: unknown, limit = 4000): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length <= limit) {
    return text;
  }
  const half = Math.floor(limit / 2) - 3;
  return `${text.slice(0, half)}...${text.slice(-half)}`;
}

export interface PipelineConfig {
  cliConfig: Config;
  provider: OpenAICompatibleProvider;
  contentGeneratorConfig: ContentGeneratorConfig;
  telemetryService: TelemetryService;
  errorHandler: ErrorHandler;
}

export class ContentGenerationPipeline {
  client: OpenAI;
  private provider: OpenAICompatibleProvider;
  private converter: OpenAIContentConverter;
  private contentGeneratorConfig: ContentGeneratorConfig;
  private readonly enableOpenAILogging: boolean;

  constructor(private config: PipelineConfig) {
    this.provider = config.provider;
    this.contentGeneratorConfig = config.contentGeneratorConfig;
    this.client = this.provider.buildClient();
    this.converter = new OpenAIContentConverter(
      this.contentGeneratorConfig.model,
    );
    this.enableOpenAILogging =
      !!this.contentGeneratorConfig.enableOpenAILogging;
  }

  async execute(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    return this.executeWithErrorHandling(
      request,
      userPromptId,
      false,
      async (openaiRequest, context) => {
        const useResponses = this.provider.shouldUseResponses?.(
          this.contentGeneratorConfig.model,
        );

        if (useResponses) {
          const response = (await this.client.responses.create(
            this.buildResponsesRequest(
              openaiRequest,
            ) as ResponseCreateParamsBase,
          )) as Response;

          const geminiResponse =
            this.converter.convertOpenAIResponseToGemini(response);

          await this.config.telemetryService.logSuccess(
            context,
            geminiResponse,
            openaiRequest,
            response,
          );

          return geminiResponse;
        }

        const openaiResponse = (await this.client.chat.completions.create(
          openaiRequest,
        )) as OpenAI.Chat.ChatCompletion;

        console.warn(
          "[OpenAIContentGenerator] Raw completion response:",
          truncateForLog(JSON.stringify(openaiResponse)),
        );

        const geminiResponse =
          this.converter.convertOpenAIResponseToGemini(openaiResponse);

        // Log success
        await this.config.telemetryService.logSuccess(
          context,
          geminiResponse,
          openaiRequest,
          openaiResponse,
        );

        return geminiResponse;
      },
    );
  }

  async executeStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.executeWithErrorHandling(
      request,
      userPromptId,
      true,
      async (openaiRequest, context) => {
        const useResponses = this.provider.shouldUseResponses?.(
          this.contentGeneratorConfig.model,
        );

        if (useResponses) {
          const stream = (await this.client.responses.create({
            ...this.buildResponsesRequest(openaiRequest),
            stream: true,
          } as ResponseCreateParamsBase)) as AsyncIterable<ResponseStreamEvent>;

          return this.processResponsesStreamWithLogging(
            stream,
            context,
            openaiRequest,
            request,
            userPromptId,
          );
        }

        // Stage 1: Create OpenAI stream
        const stream = (await this.client.chat.completions.create(
          openaiRequest,
        )) as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

        // Stage 2: Process stream with conversion and logging
        return this.processStreamWithLogging(
          stream,
          context,
          openaiRequest,
          request,
        );
      },
    );
  }

  /**
   * Stage 2: Process OpenAI stream with conversion and logging
   * This method handles the complete stream processing pipeline:
   * 1. Convert OpenAI chunks to Gemini format while preserving original chunks
   * 2. Filter empty responses
   * 3. Handle chunk merging for providers that send finishReason and usageMetadata separately
   * 4. Collect both formats for logging
   * 5. Handle success/error logging
   */
  private async *processStreamWithLogging(
    stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    context: RequestContext,
    openaiRequest: OpenAI.Chat.ChatCompletionCreateParams,
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const collectedGeminiResponses: GenerateContentResponse[] = [];
    const collectedOpenAIChunks: OpenAI.Chat.ChatCompletionChunk[] = [];

    // Reset streaming tool calls to prevent data pollution from previous streams
    this.converter.resetStreamingToolCalls(context.userPromptId);

    // State for handling chunk merging
    let pendingFinishResponse: GenerateContentResponse | null = null;

    try {
      // Stage 2a: Convert and yield each chunk while preserving original
      for await (const chunk of stream) {
        // Always collect OpenAI chunks for logging, regardless of Gemini conversion result
        collectedOpenAIChunks.push(chunk);

        const response = this.converter.convertOpenAIChunkToGemini(chunk);

        // Stage 2b: Filter empty responses to avoid downstream issues
        if (
          response.candidates?.[0]?.content?.parts?.length === 0 &&
          !response.candidates?.[0]?.finishReason &&
          !response.usageMetadata
        ) {
          continue;
        }

        // Stage 2c: Handle chunk merging for providers that send finishReason and usageMetadata separately
        const shouldYield = this.handleChunkMerging(
          response,
          collectedGeminiResponses,
          (mergedResponse) => {
            pendingFinishResponse = mergedResponse;
          },
        );

        if (shouldYield) {
          // If we have a pending finish response, yield it instead
          if (pendingFinishResponse) {
            yield pendingFinishResponse;
            pendingFinishResponse = null;
          } else {
            yield response;
          }
        }
      }

      // Stage 2d: If there's still a pending finish response at the end, yield it
      if (pendingFinishResponse) {
        yield pendingFinishResponse;
      }

      // Stage 2e: Stream completed successfully - perform logging with original OpenAI chunks
      context.duration = Date.now() - context.startTime;

      await this.config.telemetryService.logStreamingSuccess(
        context,
        collectedGeminiResponses,
        openaiRequest,
        collectedOpenAIChunks,
      );
    } catch (error) {
      // Clear streaming tool calls on error to prevent data pollution
      this.converter.resetStreamingToolCalls(context.userPromptId);

      // Use shared error handling logic
      await this.handleError(error, context, request);
    }
  }

  private async *processResponsesStreamWithLogging(
    stream: AsyncIterable<ResponseStreamEvent>,
    context: RequestContext,
    openaiRequest: OpenAI.Chat.ChatCompletionCreateParams,
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const collectedGeminiResponses: GenerateContentResponse[] = [];
    const collectedResponseEvents: ResponseStreamEvent[] = [];

    // Reset streaming tool calls to prevent data pollution from previous streams
    this.converter.resetStreamingToolCalls(context.userPromptId);

    // State for handling chunk merging
    let pendingFinishResponse: GenerateContentResponse | null = null;

    try {
      for await (const event of stream) {
        collectedResponseEvents.push(event);

        const response =
          this.converter.convertOpenAIResponseEventToGemini(event);

        if (!response) {
          continue;
        }

        if (
          response.candidates?.[0]?.content?.parts?.length === 0 &&
          !response.candidates?.[0]?.finishReason &&
          !response.usageMetadata
        ) {
          continue;
        }

        const shouldYield = this.handleChunkMerging(
          response,
          collectedGeminiResponses,
          (mergedResponse) => {
            pendingFinishResponse = mergedResponse;
          },
        );

        if (shouldYield) {
          if (pendingFinishResponse) {
            yield pendingFinishResponse;
            pendingFinishResponse = null;
          } else {
            yield response;
          }
        }
      }

      if (pendingFinishResponse) {
        yield pendingFinishResponse;
      }

      context.duration = Date.now() - context.startTime;

      await this.config.telemetryService.logResponsesStreamingSuccess(
        context,
        collectedGeminiResponses,
        openaiRequest,
        collectedResponseEvents,
      );
    } catch (error) {
      this.converter.resetStreamingToolCalls(context.userPromptId);
      await this.handleError(error, context, request, userPromptId, true);
    }
  }

  /**
   * Handle chunk merging for providers that send finishReason and usageMetadata separately.
   *
   * Strategy: When we encounter a finishReason chunk, we hold it and merge all subsequent
   * chunks into it until the stream ends. This ensures the final chunk contains both
   * finishReason and the most up-to-date usage information from any provider pattern.
   *
   * @param response Current Gemini response
   * @param collectedGeminiResponses Array to collect responses for logging
   * @param setPendingFinish Callback to set pending finish response
   * @returns true if the response should be yielded, false if it should be held for merging
   */
  private handleChunkMerging(
    response: GenerateContentResponse,
    collectedGeminiResponses: GenerateContentResponse[],
    setPendingFinish: (response: GenerateContentResponse) => void,
  ): boolean {
    const isFinishChunk = response.candidates?.[0]?.finishReason;

    // Check if we have a pending finish response from previous chunks
    const hasPendingFinish =
      collectedGeminiResponses.length > 0 &&
      collectedGeminiResponses[collectedGeminiResponses.length - 1]
        .candidates?.[0]?.finishReason;

    if (isFinishChunk) {
      // This is a finish reason chunk
      collectedGeminiResponses.push(response);
      setPendingFinish(response);
      return false; // Don't yield yet, wait for potential subsequent chunks to merge
    } else if (hasPendingFinish) {
      // We have a pending finish chunk, merge this chunk's data into it
      const lastResponse =
        collectedGeminiResponses[collectedGeminiResponses.length - 1];
      const mergedResponse = new GenerateContentResponse();

      // Keep the finish reason from the previous chunk
      mergedResponse.candidates = lastResponse.candidates;

      // Merge usage metadata if this chunk has it
      if (response.usageMetadata) {
        mergedResponse.usageMetadata = response.usageMetadata;
      } else {
        mergedResponse.usageMetadata = lastResponse.usageMetadata;
      }

      // Update the collected responses with the merged response
      collectedGeminiResponses[collectedGeminiResponses.length - 1] =
        mergedResponse;

      setPendingFinish(mergedResponse);
      return true; // Yield the merged response
    }

    // Normal chunk - collect and yield
    collectedGeminiResponses.push(response);
    return true;
  }

  private async buildRequest(
    request: GenerateContentParameters,
    userPromptId: string,
    streaming: boolean = false,
  ): Promise<OpenAI.Chat.ChatCompletionCreateParams> {
    const messages = this.converter.convertGeminiRequestToOpenAI(request);

    // Apply provider-specific enhancements
    const baseRequest: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.contentGeneratorConfig.model,
      messages,
      ...this.buildSamplingParameters(request),
    };

    // Let provider enhance the request (e.g., add metadata, cache control)
    const enhancedRequest = this.config.provider.buildRequest(
      baseRequest,
      userPromptId,
    );

    // Add tools if present
    if (request.config?.tools) {
      enhancedRequest.tools = await this.converter.convertGeminiToolsToOpenAI(
        request.config.tools,
      );
    }

    // Add streaming options if needed
    if (streaming) {
      enhancedRequest.stream = true;
      enhancedRequest.stream_options = { include_usage: true };
    }

    return enhancedRequest;
  }

  private buildResponsesRequest(
    chatRequest: OpenAI.Chat.ChatCompletionCreateParams,
  ): {
    model: string;
    input: Array<
      | {
          role: "user" | "assistant" | "system" | "developer";
          type: "message";
          content: Array<{ type: "input_text"; text: string }>;
        }
      | {
          type: "function_call";
          call_id: string;
          name: string;
          arguments: string;
        }
      | {
          type: "function_call_output";
          call_id: string;
          output: string;
        }
    >;
    tools?: Array<{
      type: "function";
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
      strict?: boolean | null;
    }>;
    tool_choice?:
      | "auto"
      | "none"
      | "required"
      | { type: "function"; name: string };
    max_output_tokens?: number;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
  } {
    const input: Array<
      | {
          role: "user" | "assistant" | "system" | "developer";
          type: "message";
          content: Array<{ type: "input_text"; text: string }>;
        }
      | {
          type: "function_call";
          call_id: string;
          name: string;
          arguments: string;
        }
      | {
          type: "function_call_output";
          call_id: string;
          output: string;
        }
    > = [];

    for (const message of chatRequest.messages ?? []) {
      if (message.role === "tool") {
        const callId =
          "tool_call_id" in message && message.tool_call_id
            ? message.tool_call_id
            : "";
        if (!callId) {
          continue;
        }
        const output =
          typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content)
              ? message.content
                  .map((part) => (part && "text" in part ? part.text : ""))
                  .filter(Boolean)
                  .join(" ")
              : "";
        input.push({
          type: "function_call_output" as const,
          call_id: callId,
          output,
        });
        continue;
      }

      if (
        message.role === "user" ||
        message.role === "assistant" ||
        message.role === "system" ||
        message.role === "developer"
      ) {
        const text =
          typeof message.content === "string"
            ? message.content
            : Array.isArray(message.content)
              ? message.content
                  .map((part) => (part && "text" in part ? part.text : ""))
                  .filter(Boolean)
                  .join(" ")
              : "";

        if (text.length > 0) {
          input.push({
            role: message.role,
            type: "message" as const,
            content: [{ type: "input_text" as const, text }],
          });
        }

        if (message.role === "assistant" && "tool_calls" in message) {
          for (const toolCall of message.tool_calls ?? []) {
            const callId = toolCall.id || "";
            if (!callId) {
              continue;
            }
            input.push({
              type: "function_call" as const,
              call_id: callId,
              name: toolCall.function?.name ?? "",
              arguments: toolCall.function?.arguments ?? "{}",
            });
          }
        }
      }
    }

    type SimpleFunctionTool = {
      type: "function";
      name: string;
      description?: string | undefined;
      parameters?: Record<string, unknown>;
      strict?: boolean | null;
    };

    const functionTools: SimpleFunctionTool[] | undefined = chatRequest.tools
      ? chatRequest.tools.reduce<SimpleFunctionTool[]>((acc, tool) => {
          if (tool.type !== "function") return acc;
          const entry: SimpleFunctionTool = {
            type: "function",
            name: tool.function?.name ?? "",
            description:
              tool.function?.description === null
                ? undefined
                : (tool.function?.description ?? undefined),
            parameters:
              tool.function?.parameters &&
              Object.keys(tool.function.parameters).length > 0
                ? (tool.function.parameters as Record<string, unknown>)
                : undefined,
            strict: tool.function?.strict ?? null,
          };
          if (entry.name) {
            acc.push(entry);
          }
          return acc;
        }, [])
      : undefined;

    const toolChoice = chatRequest.tool_choice;
    const tool_choice =
      typeof toolChoice === "string"
        ? toolChoice
        : toolChoice &&
            typeof toolChoice === "object" &&
            toolChoice.type === "function"
          ? { type: "function" as const, name: toolChoice.function.name }
          : undefined;

    const max_output_tokens =
      typeof chatRequest.max_tokens === "number"
        ? chatRequest.max_tokens
        : undefined;

    return {
      model: chatRequest.model,
      input,
      tools: functionTools,
      tool_choice,
      max_output_tokens,
      temperature:
        typeof chatRequest.temperature === "number"
          ? chatRequest.temperature
          : undefined,
      top_p:
        typeof chatRequest.top_p === "number" ? chatRequest.top_p : undefined,
      stream:
        chatRequest.stream === true
          ? true
          : chatRequest.stream === false
            ? false
            : undefined,
    };
  }

  private buildSamplingParameters(
    request: GenerateContentParameters,
  ): Record<string, unknown> {
    const configSamplingParams = this.contentGeneratorConfig.samplingParams;

    // Helper function to get parameter value with priority: config > request > default
    const getParameterValue = <T>(
      configKey: keyof NonNullable<typeof configSamplingParams>,
      requestKey: keyof NonNullable<typeof request.config>,
      defaultValue?: T,
    ): T | undefined => {
      const configValue = configSamplingParams?.[configKey] as T | undefined;
      const requestValue = request.config?.[requestKey] as T | undefined;

      if (configValue !== undefined) return configValue;
      if (requestValue !== undefined) return requestValue;
      return defaultValue;
    };

    // Helper function to conditionally add parameter if it has a value
    const addParameterIfDefined = <T>(
      key: string,
      configKey: keyof NonNullable<typeof configSamplingParams>,
      requestKey?: keyof NonNullable<typeof request.config>,
      defaultValue?: T,
    ): Record<string, T> | Record<string, never> => {
      const value = requestKey
        ? getParameterValue(configKey, requestKey, defaultValue)
        : ((configSamplingParams?.[configKey] as T | undefined) ??
          defaultValue);

      return value !== undefined ? { [key]: value } : {};
    };

    const params = {
      // Parameters with request fallback and defaults
      temperature: getParameterValue("temperature", "temperature", 0.0),
      top_p: getParameterValue("top_p", "topP", 1.0),

      // Max tokens (special case: different property names)
      ...addParameterIfDefined("max_tokens", "max_tokens", "maxOutputTokens"),

      // Config-only parameters (no request fallback)
      ...addParameterIfDefined("top_k", "top_k"),
      ...addParameterIfDefined("repetition_penalty", "repetition_penalty"),
      ...addParameterIfDefined("presence_penalty", "presence_penalty"),
      ...addParameterIfDefined("frequency_penalty", "frequency_penalty"),
    };

    return params;
  }

  /**
   * Common error handling wrapper for execute methods
   */
  private async executeWithErrorHandling<T>(
    request: GenerateContentParameters,
    userPromptId: string,
    isStreaming: boolean,
    executor: (
      openaiRequest: OpenAI.Chat.ChatCompletionCreateParams,
      context: RequestContext,
    ) => Promise<T>,
  ): Promise<T> {
    const context = this.createRequestContext(userPromptId, isStreaming);

    try {
      const openaiRequest = await this.buildRequest(
        request,
        userPromptId,
        isStreaming,
      );

      if (this.enableOpenAILogging) {
        try {
          await openaiLogger.logInteraction(openaiRequest, undefined);
        } catch (error) {
          console.warn("Failed to log OpenAI request payload:", error);
        }
      }

      const result = await executor(openaiRequest, context);

      context.duration = Date.now() - context.startTime;
      return result;
    } catch (error) {
      // Use shared error handling logic
      return await this.handleError(
        error,
        context,
        request,
        userPromptId,
        isStreaming,
      );
    }
  }

  /**
   * Shared error handling logic for both executeWithErrorHandling and processStreamWithLogging
   * This centralizes the common error processing steps to avoid duplication
   */
  private async handleError(
    error: unknown,
    context: RequestContext,
    request: GenerateContentParameters,
    userPromptId?: string,
    isStreaming?: boolean,
  ): Promise<never> {
    context.duration = Date.now() - context.startTime;

    // Build request for logging (may fail, but we still want to log the error)
    let openaiRequest: OpenAI.Chat.ChatCompletionCreateParams;
    try {
      if (userPromptId !== undefined && isStreaming !== undefined) {
        openaiRequest = await this.buildRequest(
          request,
          userPromptId,
          isStreaming,
        );
      } else {
        // For processStreamWithLogging, we don't have userPromptId/isStreaming,
        // so create a minimal request
        openaiRequest = {
          model: this.contentGeneratorConfig.model,
          messages: [],
        };
      }
    } catch (_buildError) {
      // If we can't build the request, create a minimal one for logging
      openaiRequest = {
        model: this.contentGeneratorConfig.model,
        messages: [],
      };
    }

    await this.config.telemetryService.logError(context, error, openaiRequest);
    this.config.errorHandler.handle(error, context, request);
  }

  /**
   * Create request context with common properties
   */
  private createRequestContext(
    userPromptId: string,
    isStreaming: boolean,
  ): RequestContext {
    return {
      userPromptId,
      model: this.contentGeneratorConfig.model,
      authType: this.contentGeneratorConfig.authType || "unknown",
      startTime: Date.now(),
      duration: 0,
      isStreaming,
    };
  }
}
