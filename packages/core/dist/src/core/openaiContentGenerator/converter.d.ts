/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenerateContentParameters, ToolListUnion } from "@google/genai";
import { GenerateContentResponse } from "@google/genai";
import type OpenAI from "openai";
/**
 * Tool call accumulator for streaming responses
 */
export interface ToolCallAccumulator {
    id?: string;
    name?: string;
    arguments: string;
}
/**
 * Converter class for transforming data between Gemini and OpenAI formats
 */
export declare class OpenAIContentConverter {
    private model;
    private streamingToolCallParser;
    constructor(model: string);
    /**
     * Reset streaming tool calls parser for new stream processing
     * This should be called at the beginning of each stream to prevent
     * data pollution from previous incomplete streams
     */
    resetStreamingToolCalls(): void;
    /**
     * Convert Gemini tool parameters to OpenAI JSON Schema format
     */
    convertGeminiToolParametersToOpenAI(parameters: Record<string, unknown>): Record<string, unknown> | undefined;
    /**
     * Convert Gemini tools to OpenAI format for API compatibility.
     * Handles both Gemini tools (using 'parameters' field) and MCP tools (using 'parametersJsonSchema' field).
     */
    convertGeminiToolsToOpenAI(geminiTools: ToolListUnion): Promise<OpenAI.Chat.ChatCompletionTool[]>;
    /**
     * Convert Gemini request to OpenAI message format
     */
    convertGeminiRequestToOpenAI(request: GenerateContentParameters): OpenAI.Chat.ChatCompletionMessageParam[];
    /**
     * Extract and add system instruction message from request config
     */
    private addSystemInstructionMessage;
    /**
     * Process contents and convert to OpenAI messages
     */
    private processContents;
    /**
     * Process a single content item and convert to OpenAI message(s)
     */
    private processContent;
    /**
     * Parse Gemini parts into categorized components
     */
    private parseParts;
    /**
     * Determine media type from MIME type
     */
    private getMediaType;
    /**
     * Create multimodal OpenAI message from parsed parts
     */
    private createMultimodalMessage;
    /**
     * Convert MIME type to OpenAI audio format
     */
    private getAudioFormat;
    /**
     * Type guard to check if content is a valid Content object
     */
    private isContentObject;
    /**
     * Extract text content from various Gemini content union types
     */
    private extractTextFromContentUnion;
    /**
     * Convert OpenAI response to Gemini format
     */
    convertOpenAIResponseToGemini(openaiResponse: OpenAI.Chat.ChatCompletion): GenerateContentResponse;
    /**
     * Convert OpenAI stream chunk to Gemini format
     */
    convertOpenAIChunkToGemini(chunk: OpenAI.Chat.ChatCompletionChunk): GenerateContentResponse;
    /**
     * Convert Gemini response format to OpenAI chat completion format for logging
     */
    convertGeminiResponseToOpenAI(response: GenerateContentResponse): OpenAI.Chat.ChatCompletion;
    /**
     * Map OpenAI finish reasons to Gemini finish reasons
     */
    private mapOpenAIFinishReasonToGemini;
    /**
     * Map Gemini finish reasons to OpenAI finish reasons
     */
    private mapGeminiFinishReasonToOpenAI;
    /**
     * Clean up orphaned tool calls from message history to prevent OpenAI API errors
     */
    private cleanOrphanedToolCalls;
    /**
     * Merge consecutive assistant messages to combine split text and tool calls
     */
    private mergeConsecutiveAssistantMessages;
}
