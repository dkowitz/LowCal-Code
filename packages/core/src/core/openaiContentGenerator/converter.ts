/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  Part,
  Content,
  Tool,
  ToolListUnion,
  CallableTool,
  FunctionCall,
  FunctionResponse,
  ContentListUnion,
  ContentUnion,
  PartUnion,
  Candidate,
} from "@google/genai";
import { GenerateContentResponse, FinishReason } from "@google/genai";
import type OpenAI from "openai";
import { safeJsonParse } from "../../utils/safeJsonParse.js";
import { StreamingToolCallParser } from "./streamingToolCallParser.js";
import type {
  Response,
  ResponseStreamEvent,
} from "openai/resources/responses/responses.js";

/**
 * Tool call accumulator for streaming responses
 */
export interface ToolCallAccumulator {
  id?: string;
  name?: string;
  arguments: string;
}

/**
 * Parsed parts from Gemini content, categorized by type
 */
interface ParsedParts {
  textParts: string[];
  functionCalls: FunctionCall[];
  functionResponses: FunctionResponse[];
  mediaParts: Array<{
    type: "image" | "audio" | "file";
    data: string;
    mimeType: string;
    fileUri?: string;
  }>;
}

type ThinkingSegment = {
  text: string;
  isThinking: boolean;
};

type StreamHistory = {
  thinking: {
    last: Map<number, string>;
    recent: Map<number, string[]>;
    counts: Map<string, number>;
  };
  text: {
    last: Map<number, string>;
    recent: Map<number, string[]>;
    counts: Map<string, number>;
  };
};

/**
 * Converter class for transforming data between Gemini and OpenAI formats
 */
export class OpenAIContentConverter {
  private model: string;
  private streamingToolCallParser: StreamingToolCallParser =
    new StreamingToolCallParser();
  private streamingReasoningBuffers: Map<number, string> = new Map();
  private streamingThinkingBuffers: Map<number, string> = new Map();
  private streamingLastThinkingBlocks: Map<number, string> = new Map();
  private streamingRecentThinkingBlocks: Map<number, string[]> = new Map();
  private sessionStreamHistory: Map<string, StreamHistory> = new Map();
  private streamingXmlToolCallBuffers: Map<number, string> = new Map();
  private globalThinkingCounts: Map<string, number> = new Map();

  constructor(model: string) {
    this.model = model;
  }

  /**
   * Reset streaming tool calls parser for new stream processing
   * This should be called at the beginning of each stream to prevent
   * data pollution from previous incomplete streams
   */
  resetStreamingToolCalls(promptId: string): void {
    this.streamingToolCallParser.reset();
    this.streamingReasoningBuffers.clear();
    this.streamingThinkingBuffers.clear();

    const sessionId = this.getSessionIdFromPrompt(promptId);
    let history = this.sessionStreamHistory.get(sessionId);
    if (!history) {
      history = {
        thinking: {
          last: new Map(),
          recent: new Map(),
          counts: new Map(),
        },
        text: {
          last: new Map(),
          recent: new Map(),
          counts: new Map(),
        },
      };
      this.sessionStreamHistory.set(sessionId, history);
    }

    this.streamingLastThinkingBlocks = history.thinking.last;
    this.streamingRecentThinkingBlocks = history.thinking.recent;
    this.globalThinkingCounts = history.thinking.counts;
    this.streamingXmlToolCallBuffers.clear();
  }

  private formatThinkingBlock(content: string): string {
    const lines = content.split(/\r?\n/);
    const formattedLines = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (formattedLines.length === 0) {
      return "";
    }

    const [firstLine, ...rest] = formattedLines;
    const resultLines = [`💭 *${firstLine}*`];
    for (const line of rest) {
      resultLines.push(`   *${line}*`);
    }

    return resultLines.join("\n\n").trimEnd();
  }

  private formatThinkingSegments(text: string): string {
    if (!text || typeof text !== "string") {
      return text;
    }

    return text.replace(
      /<(think|thinking)>([\s\S]*?)<\/\1>/g,
      (_match, _tag, content) => this.formatThinkingBlock(content),
    );
  }

  private processStreamingThinkingText(
    index: number,
    chunkText: string,
    flush = false,
  ): ThinkingSegment[] {
    if (!chunkText && !flush) {
      return [];
    }

    const buffers = this.streamingThinkingBuffers;
    const current = (buffers.get(index) ?? "") + (chunkText ?? "");
    const results: ThinkingSegment[] = [];

    const regex = /<(think|thinking)>([\s\S]*?)<\/\1>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(current)) !== null) {
      if (match.index > lastIndex) {
        const preceding = current.slice(lastIndex, match.index);
        if (preceding) {
          results.push({ text: preceding, isThinking: false });
        }
      }

      let formatted = this.formatThinkingBlock(match[2]);
      if (formatted) {
        if (!this.shouldEmitThinkingBlock(index, formatted)) {
          lastIndex = regex.lastIndex;
          continue;
        }
        if (results.length > 0) {
          const prev = results[results.length - 1];
          if (!prev.text.endsWith("\n\n")) {
            prev.text = `${prev.text}\n\n`;
          }
        }
        results.push({ text: formatted, isThinking: true });
      }
      lastIndex = regex.lastIndex;
    }

    const remaining = current.slice(lastIndex);

    if (flush) {
      if (remaining) {
        results.push({ text: remaining, isThinking: false });
      }
      buffers.delete(index);
    } else {
      const lastOpenTag = Math.max(
        remaining.lastIndexOf("<think>"),
        remaining.lastIndexOf("<thinking>"),
      );
      const lastCloseTag = Math.max(
        remaining.lastIndexOf("</think>"),
        remaining.lastIndexOf("</thinking>"),
      );

      if (lastOpenTag > lastCloseTag) {
        buffers.set(index, remaining);
      } else {
        if (remaining) {
          results.push({ text: remaining, isThinking: false });
        }
        buffers.delete(index);
      }
    }

    return results.filter((segment) => segment.text.length > 0);
  }

  private shouldEmitThinkingBlock(index: number, block: string): boolean {
    const normalized = this.normalizeThinkingBlock(block);
    if (!normalized) {
      return false;
    }

    const globalCount = this.globalThinkingCounts.get(normalized) ?? 0;
    if (globalCount >= 3) {
      return false;
    }

    const lastBlock = this.streamingLastThinkingBlocks.get(index);
    if (lastBlock === normalized) {
      return false;
    }

    const recent = this.streamingRecentThinkingBlocks.get(index) ?? [];
    if (recent.includes(normalized)) {
      this.streamingLastThinkingBlocks.set(index, normalized);
      return false;
    }

    recent.push(normalized);
    if (recent.length > 5) {
      recent.shift();
    }
    this.streamingRecentThinkingBlocks.set(index, recent);
    this.streamingLastThinkingBlocks.set(index, normalized);
    this.globalThinkingCounts.set(normalized, globalCount + 1);
    return true;
  }

  private normalizeThinkingBlock(block: string): string {
    return block
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
  }

  private extractXmlToolCalls(
    index: number,
    chunkText: string,
  ): { text: string; toolCalls: FunctionCall[] } {
    if (!chunkText) {
      return { text: chunkText, toolCalls: [] };
    }

    const buffer =
      (this.streamingXmlToolCallBuffers.get(index) ?? "") + chunkText;
    const toolCalls: FunctionCall[] = [];

    // First parse complete <tool_call>...</tool_call> blocks.
    const {
      blocks: toolCallBlocks,
      remainingText: withoutToolCallBlocks,
    } = this.extractCompleteTagBlocks(buffer, "tool_call");
    for (const block of toolCallBlocks) {
      const parsed = this.parseToolCallBlock(block);
      if (parsed) {
        toolCalls.push(parsed);
      }
    }

    // Also support legacy direct <invoke>...</invoke> blocks that are not wrapped.
    const {
      blocks: invokeBlocks,
      remainingText: withoutInvokeBlocks,
    } = this.extractCompleteTagBlocks(withoutToolCallBlocks, "invoke");
    for (const block of invokeBlocks) {
      const parsed = this.parseInvokeBlock(block);
      if (parsed) {
        toolCalls.push(parsed);
      }
    }

    let sanitized = withoutInvokeBlocks;

    const trailingOpenTagIndex = this.findTrailingOpenTagIndex(sanitized, [
      "tool_call",
      "invoke",
    ]);
    if (trailingOpenTagIndex >= 0) {
      this.streamingXmlToolCallBuffers.set(
        index,
        sanitized.slice(trailingOpenTagIndex),
      );
      sanitized = sanitized.slice(0, trailingOpenTagIndex);
    } else {
      this.streamingXmlToolCallBuffers.delete(index);
    }

    return {
      text: this.stripStrayToolCallMarkup(sanitized),
      toolCalls,
    };
  }

  private extractCompleteTagBlocks(
    input: string,
    tagName: string,
  ): { blocks: string[]; remainingText: string } {
    const regex = new RegExp(
      `<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
      "gi",
    );
    const blocks: string[] = [];
    let remainingText = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      remainingText += input.slice(lastIndex, match.index);
      blocks.push(match[0]);
      lastIndex = regex.lastIndex;
    }

    remainingText += input.slice(lastIndex);
    return { blocks, remainingText };
  }

  private findTrailingOpenTagIndex(input: string, tags: string[]): number {
    let trailingIndex = -1;

    for (const tag of tags) {
      const openIndex = input.lastIndexOf(`<${tag}`);
      const closeIndex = input.lastIndexOf(`</${tag}>`);
      if (openIndex > closeIndex) {
        trailingIndex = Math.max(trailingIndex, openIndex);
      }
    }

    return trailingIndex;
  }

  private stripStrayToolCallMarkup(text: string): string {
    return text
      .replace(/<\/?tool_call\b[^>]*>/gi, "")
      .replace(/<\/?invoke\b[^>]*>/gi, "")
      .replace(/<\/?function\b[^>]*>/gi, "")
      .replace(/<function=[^>]*>/gi, "")
      .replace(/<\/?parameter\b[^>]*>/gi, "")
      .replace(/<parameter=[^>]*>/gi, "");
  }

  private parseToolCallBlock(block: string): FunctionCall | null {
    const inner = block
      .replace(/^<tool_call\b[^>]*>/i, "")
      .replace(/<\/tool_call>\s*$/i, "")
      .trim();

    if (!inner) {
      return null;
    }

    if (/<invoke\b/i.test(inner)) {
      return this.parseInvokeBlock(inner);
    }

    if (/<function=/i.test(inner)) {
      return this.parseFunctionBlock(inner);
    }

    return this.parseJsonToolCallBlock(inner);
  }

  private parseInvokeBlock(block: string): FunctionCall | null {
    const nameMatch = block.match(/<invoke\b[^>]*name="([^"]+)"[^>]*>/i);
    if (!nameMatch) {
      return null;
    }

    const params: Record<string, unknown> = {};
    const paramRegex =
      /<parameter\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(block)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = this.parseParameterValue(paramMatch[2]);
      params[paramName] = paramValue;
    }

    return {
      id: this.generateToolCallId(nameMatch[1]),
      name: nameMatch[1],
      args: params,
    };
  }

  private parseFunctionBlock(block: string): FunctionCall | null {
    const nameMatch = block.match(/<function=([^>\s]+)>/i);
    if (!nameMatch) {
      return null;
    }

    const params: Record<string, unknown> = {};
    const paramRegex = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(block)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = this.parseParameterValue(paramMatch[2]);
      params[paramName] = paramValue;
    }

    return {
      id: this.generateToolCallId(nameMatch[1]),
      name: nameMatch[1],
      args: params,
    };
  }

  private parseJsonToolCallBlock(block: string): FunctionCall | null {
    const jsonCandidate = block
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    if (
      !(jsonCandidate.startsWith("{") && jsonCandidate.endsWith("}")) &&
      !(jsonCandidate.startsWith("[") && jsonCandidate.endsWith("]"))
    ) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      return null;
    }

    if (!this.isRecord(parsed)) {
      return null;
    }

    const parsedName = parsed["name"];
    const name = typeof parsedName === "string" ? parsedName.trim() : "";
    if (!name) {
      return null;
    }

    let args: Record<string, unknown> = {};
    const parsedArguments = parsed["arguments"];
    if (this.isRecord(parsedArguments)) {
      args = parsedArguments;
    } else if (typeof parsedArguments === "string") {
      const parsedArgs = safeJsonParse(parsedArguments, {});
      if (this.isRecord(parsedArgs)) {
        args = parsedArgs;
      }
    }

    return {
      id: this.generateToolCallId(name),
      name,
      args,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === "object" && value !== null && !Array.isArray(value)
    );
  }

  private parseParameterValue(value: string): unknown {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "";
    }

    if (/^(true|false)$/i.test(trimmed)) {
      return trimmed.toLowerCase() === "true";
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // ignore malformed JSON
      }
    }

    return trimmed;
  }

  private generateToolCallId(name: string): string {
    return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private getSessionIdFromPrompt(promptId: string): string {
    const [sessionId] = promptId.split("########");
    return sessionId || promptId;
  }

  private mergeReasoningChunks(existing: string, incoming: string): string {
    if (!existing) return incoming;
    if (!incoming) return existing;

    if (incoming.startsWith(existing)) {
      return incoming;
    }

    if (existing.startsWith(incoming)) {
      return existing;
    }

    const overlap = this.findOverlap(existing, incoming);
    return `${existing}${incoming.slice(overlap)}`;
  }

  private findOverlap(existing: string, incoming: string): number {
    const maxOverlap = Math.min(existing.length, incoming.length);
    for (let length = maxOverlap; length > 0; length--) {
      if (existing.endsWith(incoming.slice(0, length))) {
        return length;
      }
    }
    return 0;
  }

  private getTextFromPart(part: Part | undefined): string | undefined {
    if (!part) {
      return undefined;
    }

    if (typeof part === "string") {
      return part;
    }

    if ("text" in part && typeof part.text === "string") {
      return part.text;
    }

    return undefined;
  }

  private appendTextPart(
    parts: Part[],
    text: string,
    options: { isThinking?: boolean } = {},
  ): void {
    if (!text || text.length === 0) {
      return;
    }

    const { isThinking = false } = options;
    let textToAppend = text;

    const lastPart = parts.length > 0 ? parts[parts.length - 1] : undefined;
    const lastText = this.getTextFromPart(lastPart);
    const lastIsThinking = lastText?.trimStart().startsWith("💭");

    if (!isThinking && lastText !== undefined && !lastIsThinking) {
      const combined = `${lastText}${textToAppend}`;
      if (typeof lastPart === "string") {
        parts[parts.length - 1] = { text: combined } as Part;
      } else if (lastPart && typeof lastPart === "object") {
        (lastPart as { text?: string }).text = combined;
      }
      return;
    }

    const needsSpacing = parts.length > 0;
    if (needsSpacing) {
      if (textToAppend.startsWith("\n\n")) {
        // already has spacing
      } else if (textToAppend.startsWith("\n")) {
        textToAppend = `\n${textToAppend}`;
      } else {
        textToAppend = `\n\n${textToAppend}`;
      }
    }

    parts.push({ text: textToAppend });
  }

  /**
   * Extract textual content from OpenAI message content which can be a string
   * or an array of structured content parts.
   */
  private extractTextFromOpenAIContent(
    content:
      | string
      | null
      | undefined
      | Array<
          | string
          | {
              type?: string;
              text?: string;
              [key: string]: unknown;
            }
        >,
  ): string {
    if (!content) {
      return "";
    }

    if (typeof content === "string") {
      return content;
    }

    const textSegments: string[] = [];
    for (const segment of content) {
      if (!segment) {
        continue;
      }

      if (typeof segment === "string") {
        textSegments.push(segment);
        continue;
      }

      const maybeText = (segment as { text?: unknown }).text;
      if (typeof maybeText === "string" && maybeText.length > 0) {
        textSegments.push(maybeText);
        continue;
      }

      const maybeOutputText = (segment as { output_text?: unknown })
        .output_text;
      if (typeof maybeOutputText === "string" && maybeOutputText.length > 0) {
        textSegments.push(maybeOutputText);
      }
    }

    return textSegments.join("");
  }

  /**
   * Convert Gemini tool parameters to OpenAI JSON Schema format
   */
  convertGeminiToolParametersToOpenAI(
    parameters: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!parameters || typeof parameters !== "object") {
      return parameters;
    }

    const converted = JSON.parse(JSON.stringify(parameters));

    const convertTypes = (obj: unknown): unknown => {
      if (typeof obj !== "object" || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(convertTypes);
      }

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === "type" && typeof value === "string") {
          // Convert Gemini types to OpenAI JSON Schema types
          const lowerValue = value.toLowerCase();
          if (lowerValue === "integer") {
            result[key] = "integer";
          } else if (lowerValue === "number") {
            result[key] = "number";
          } else {
            result[key] = lowerValue;
          }
        } else if (
          key === "minimum" ||
          key === "maximum" ||
          key === "multipleOf"
        ) {
          // Ensure numeric constraints are actual numbers, not strings
          if (typeof value === "string" && !isNaN(Number(value))) {
            result[key] = Number(value);
          } else {
            result[key] = value;
          }
        } else if (
          key === "minLength" ||
          key === "maxLength" ||
          key === "minItems" ||
          key === "maxItems"
        ) {
          // Ensure length constraints are integers, not strings
          if (typeof value === "string" && !isNaN(Number(value))) {
            result[key] = parseInt(value, 10);
          } else {
            result[key] = value;
          }
        } else if (typeof value === "object") {
          result[key] = convertTypes(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return convertTypes(converted) as Record<string, unknown> | undefined;
  }

  /**
   * Convert Gemini tools to OpenAI format for API compatibility.
   * Handles both Gemini tools (using 'parameters' field) and MCP tools (using 'parametersJsonSchema' field).
   */
  async convertGeminiToolsToOpenAI(
    geminiTools: ToolListUnion,
  ): Promise<OpenAI.Chat.ChatCompletionTool[]> {
    const openAITools: OpenAI.Chat.ChatCompletionTool[] = [];

    for (const tool of geminiTools) {
      let actualTool: Tool;

      // Handle CallableTool vs Tool
      if ("tool" in tool) {
        // This is a CallableTool
        actualTool = await (tool as CallableTool).tool();
      } else {
        // This is already a Tool
        actualTool = tool as Tool;
      }

      if (actualTool.functionDeclarations) {
        for (const func of actualTool.functionDeclarations) {
          if (func.name && func.description) {
            let parameters: Record<string, unknown> | undefined;

            // Handle both Gemini tools (parameters) and MCP tools (parametersJsonSchema)
            if (func.parametersJsonSchema) {
              // MCP tool format - use parametersJsonSchema directly
              if (func.parametersJsonSchema) {
                // Create a shallow copy to avoid mutating the original object
                const paramsCopy = {
                  ...(func.parametersJsonSchema as Record<string, unknown>),
                };
                parameters = paramsCopy;
              }
            } else if (func.parameters) {
              // Gemini tool format - convert parameters to OpenAI format
              parameters = this.convertGeminiToolParametersToOpenAI(
                func.parameters as Record<string, unknown>,
              );
            }

            openAITools.push({
              type: "function",
              function: {
                name: func.name,
                description: func.description,
                parameters,
              },
            });
          }
        }
      }
    }

    return openAITools;
  }

  /**
   * Convert Gemini request to OpenAI message format
   */
  convertGeminiRequestToOpenAI(
    request: GenerateContentParameters,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Handle system instruction from config
    this.addSystemInstructionMessage(request, messages);

    // Handle contents
    this.processContents(request.contents, messages);

    // Clean up orphaned tool calls and merge consecutive assistant messages
    const cleanedMessages = this.cleanOrphanedToolCalls(messages);
    const mergedMessages =
      this.mergeConsecutiveAssistantMessages(cleanedMessages);

    return mergedMessages;
  }

  /**
   * Extract and add system instruction message from request config
   */
  private addSystemInstructionMessage(
    request: GenerateContentParameters,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    if (!request.config?.systemInstruction) return;

    const systemText = this.extractTextFromContentUnion(
      request.config.systemInstruction,
    );

    if (systemText) {
      messages.push({
        role: "system" as const,
        content: systemText,
      });
    }
  }

  /**
   * Process contents and convert to OpenAI messages
   */
  private processContents(
    contents: ContentListUnion,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    if (Array.isArray(contents)) {
      for (const content of contents) {
        this.processContent(content, messages);
      }
    } else if (contents) {
      this.processContent(contents, messages);
    }
  }

  /**
   * Process a single content item and convert to OpenAI message(s)
   */
  private processContent(
    content: ContentUnion | PartUnion,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    if (typeof content === "string") {
      messages.push({ role: "user" as const, content });
      return;
    }

    if (!this.isContentObject(content)) return;

    const parsedParts = this.parseParts(content.parts || []);

    // Handle function responses (tool results) first
    if (parsedParts.functionResponses.length > 0) {
      for (const funcResponse of parsedParts.functionResponses) {
        messages.push({
          role: "tool" as const,
          tool_call_id: funcResponse.id || "",
          content:
            typeof funcResponse.response === "string"
              ? funcResponse.response
              : JSON.stringify(funcResponse.response),
        });
      }

      // Preserve any non-function payload (text/media) emitted alongside tool
      // responses. This is required for multimodal tool outputs such as images.
      if (parsedParts.textParts.length > 0 || parsedParts.mediaParts.length > 0) {
        const followupMessage = this.createMultimodalMessage("user", parsedParts);
        if (followupMessage) {
          messages.push(followupMessage);
        }
      }
      return;
    }

    // Handle model messages with function calls
    if (content.role === "model" && parsedParts.functionCalls.length > 0) {
      const toolCalls = parsedParts.functionCalls.map((fc, index) => ({
        id: fc.id || `call_${index}`,
        type: "function" as const,
        function: {
          name: fc.name || "",
          arguments: JSON.stringify(fc.args || {}),
        },
      }));

      messages.push({
        role: "assistant" as const,
        content: parsedParts.textParts.join("") || null,
        tool_calls: toolCalls,
      });
      return;
    }

    // Handle regular messages with multimodal content
    const role = content.role === "model" ? "assistant" : "user";
    const openAIMessage = this.createMultimodalMessage(role, parsedParts);

    if (openAIMessage) {
      messages.push(openAIMessage);
    }
  }

  /**
   * Parse Gemini parts into categorized components
   */
  private parseParts(parts: Part[]): ParsedParts {
    const textParts: string[] = [];
    const functionCalls: FunctionCall[] = [];
    const functionResponses: FunctionResponse[] = [];
    const mediaParts: Array<{
      type: "image" | "audio" | "file";
      data: string;
      mimeType: string;
      fileUri?: string;
    }> = [];

    for (const part of parts) {
      if (typeof part === "string") {
        textParts.push(part);
      } else if ("text" in part && part.text) {
        textParts.push(part.text);
      } else if ("functionCall" in part && part.functionCall) {
        functionCalls.push(part.functionCall);
      } else if ("functionResponse" in part && part.functionResponse) {
        functionResponses.push(part.functionResponse);
      } else if ("inlineData" in part && part.inlineData) {
        const { data, mimeType } = part.inlineData;
        if (data && mimeType) {
          const mediaType = this.getMediaType(mimeType);
          mediaParts.push({ type: mediaType, data, mimeType });
        }
      } else if ("fileData" in part && part.fileData) {
        const { fileUri, mimeType } = part.fileData;
        if (fileUri && mimeType) {
          const mediaType = this.getMediaType(mimeType);
          mediaParts.push({
            type: mediaType,
            data: "",
            mimeType,
            fileUri,
          });
        }
      }
    }

    return { textParts, functionCalls, functionResponses, mediaParts };
  }

  /**
   * Determine media type from MIME type
   */
  private getMediaType(mimeType: string): "image" | "audio" | "file" {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    return "file";
  }

  /**
   * Create multimodal OpenAI message from parsed parts
   */
  private createMultimodalMessage(
    role: "user" | "assistant",
    parsedParts: Pick<ParsedParts, "textParts" | "mediaParts">,
  ): OpenAI.Chat.ChatCompletionMessageParam | null {
    const { textParts, mediaParts } = parsedParts;
    const content = textParts.map((text) => ({ type: "text" as const, text }));

    // If no media parts, return simple text message
    if (mediaParts.length === 0) {
      return content.length > 0 ? { role, content } : null;
    }

    // For assistant messages with media, convert to text only
    // since OpenAI assistant messages don't support media content arrays
    if (role === "assistant") {
      return content.length > 0
        ? { role: "assistant" as const, content }
        : null;
    }

    const contentArray: OpenAI.Chat.ChatCompletionContentPart[] = [...content];

    // Add media content
    for (const mediaPart of mediaParts) {
      if (mediaPart.type === "image") {
        if (mediaPart.fileUri) {
          // For file URIs, use the URI directly
          contentArray.push({
            type: "image_url" as const,
            image_url: { url: mediaPart.fileUri },
          });
        } else if (mediaPart.data) {
          // For inline data, create data URL
          const dataUrl = `data:${mediaPart.mimeType};base64,${mediaPart.data}`;
          contentArray.push({
            type: "image_url" as const,
            image_url: { url: dataUrl },
          });
        }
      } else if (mediaPart.type === "audio" && mediaPart.data) {
        // Convert audio format from MIME type
        const format = this.getAudioFormat(mediaPart.mimeType);
        if (format) {
          contentArray.push({
            type: "input_audio" as const,
            input_audio: {
              data: mediaPart.data,
              format: format as "wav" | "mp3",
            },
          });
        }
      }
      // Note: File type is not directly supported in OpenAI's current API
      // Could be extended in the future or handled as text description
    }

    return contentArray.length > 0
      ? { role: "user" as const, content: contentArray }
      : null;
  }

  /**
   * Convert MIME type to OpenAI audio format
   */
  private getAudioFormat(mimeType: string): "wav" | "mp3" | null {
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
    return null;
  }

  /**
   * Type guard to check if content is a valid Content object
   */
  private isContentObject(
    content: unknown,
  ): content is { role: string; parts: Part[] } {
    return (
      typeof content === "object" &&
      content !== null &&
      "role" in content &&
      "parts" in content &&
      Array.isArray((content as Record<string, unknown>)["parts"])
    );
  }

  /**
   * Extract text content from various Gemini content union types
   */
  private extractTextFromContentUnion(contentUnion: unknown): string {
    if (typeof contentUnion === "string") {
      return contentUnion;
    }

    if (Array.isArray(contentUnion)) {
      return contentUnion
        .map((item) => this.extractTextFromContentUnion(item))
        .filter(Boolean)
        .join("\n");
    }

    if (typeof contentUnion === "object" && contentUnion !== null) {
      if ("parts" in contentUnion) {
        const content = contentUnion as Content;
        return (
          content.parts
            ?.map((part: Part) => {
              if (typeof part === "string") return part;
              if ("text" in part) return part.text || "";
              return "";
            })
            .filter(Boolean)
            .join("\n") || ""
        );
      }
    }

    return "";
  }

  /**
   * Convert OpenAI response to Gemini format
   */
  convertOpenAIResponseToGemini(
    openaiResponse: OpenAI.Chat.ChatCompletion | Response,
  ): GenerateContentResponse {
    if (this.isResponsesApiResponse(openaiResponse)) {
      return this.convertResponsesApiResponseToGemini(openaiResponse);
    }

    const choice = openaiResponse.choices[0];
    const response = new GenerateContentResponse();

    const parts: Part[] = [];

    // Handle text content
    let textContent = this.extractTextFromOpenAIContent(choice.message.content);
    if (!textContent && choice.message) {
      const maybeOutputText = (
        choice.message as unknown as { output_text?: unknown }
      ).output_text;
      if (typeof maybeOutputText === "string" && maybeOutputText.length > 0) {
        textContent = maybeOutputText;
      }
    }
    if (textContent) {
      this.appendTextPart(parts, this.formatThinkingSegments(textContent));
    }

    const reasoningText = this.extractReasoningText(
      (
        choice.message as unknown as {
          reasoning_details?: unknown;
        }
      ).reasoning_details,
    );
    if (reasoningText) {
      const formattedThought = this.formatThinkingBlock(reasoningText);
      if (formattedThought) {
        this.appendTextPart(parts, formattedThought, { isThinking: true });
      }
    }

    // Handle tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function) {
          let args: Record<string, unknown> = {};
          if (toolCall.function.arguments) {
            args = safeJsonParse(toolCall.function.arguments, {});
          }

          parts.push({
            functionCall: {
              id: toolCall.id,
              name: toolCall.function.name,
              args,
            },
          });
        }
      }
    }

    response.responseId = openaiResponse.id;
    response.createTime = openaiResponse.created
      ? openaiResponse.created.toString()
      : new Date().getTime().toString();

    response.candidates = [
      {
        content: {
          parts,
          role: "model" as const,
        },
        finishReason: this.mapOpenAIFinishReasonToGemini(
          choice.finish_reason || "stop",
        ),
        index: 0,
        safetyRatings: [],
      },
    ];

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    // Add usage metadata if available
    if (openaiResponse.usage) {
      const usage = openaiResponse.usage;

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;

      // If we only have total tokens but no breakdown, estimate the split
      // Typically input is ~70% and output is ~30% for most conversations
      let finalPromptTokens = promptTokens;
      let finalCompletionTokens = completionTokens;

      if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
        // Estimate: assume 70% input, 30% output
        finalPromptTokens = Math.round(totalTokens * 0.7);
        finalCompletionTokens = Math.round(totalTokens * 0.3);
      }

      response.usageMetadata = {
        promptTokenCount: finalPromptTokens,
        candidatesTokenCount: finalCompletionTokens,
        totalTokenCount: totalTokens,
        cachedContentTokenCount: cachedTokens,
      };
    }

    return response;
  }

  /**
   * Convert OpenAI stream chunk to Gemini format
   */
  convertOpenAIChunkToGemini(
    chunk: OpenAI.Chat.ChatCompletionChunk,
  ): GenerateContentResponse {
    const choice = chunk.choices?.[0];
    const response = new GenerateContentResponse();

    if (choice) {
      const parts: Part[] = [];
      const choiceIndex = choice.index ?? 0;

      // Handle text content
      let deltaText = this.extractTextFromOpenAIContent(choice.delta?.content);
      if (!deltaText && choice.delta) {
        const maybeDeltaOutputText = (
          choice.delta as unknown as { output_text?: unknown }
        ).output_text;
        if (
          typeof maybeDeltaOutputText === "string" &&
          maybeDeltaOutputText.length > 0
        ) {
          deltaText = maybeDeltaOutputText;
        }
      }
      if (deltaText) {
        const { text: cleanedText, toolCalls: xmlToolCalls } =
          this.extractXmlToolCalls(choiceIndex, deltaText);

        if (xmlToolCalls.length > 0) {
          for (const toolCall of xmlToolCalls) {
            parts.push({ functionCall: toolCall });
          }
        }

        deltaText = cleanedText;

        const segments = this.processStreamingThinkingText(
          choiceIndex,
          deltaText,
        );
        for (const segment of segments) {
          this.appendTextPart(parts, segment.text, {
            isThinking: segment.isThinking,
          });
        }
      }

      // Handle reasoning content in streaming responses
      const deltaReasoningText = this.extractReasoningText(
        (
          choice.delta as unknown as {
            reasoning_details?: unknown;
          }
        )?.reasoning_details,
      );
      if (deltaReasoningText) {
        const existing = this.streamingReasoningBuffers.get(choiceIndex) ?? "";
        this.streamingReasoningBuffers.set(
          choiceIndex,
          this.mergeReasoningChunks(existing, deltaReasoningText),
        );
      }

      // Handle tool calls using the streaming parser
      if (choice.delta?.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          const index = toolCall.index ?? 0;

          // Process the tool call chunk through the streaming parser
          if (toolCall.function?.arguments) {
            this.streamingToolCallParser.addChunk(
              index,
              toolCall.function.arguments,
              toolCall.id,
              toolCall.function.name,
            );
          } else {
            // Handle metadata-only chunks (id and/or name without arguments)
            this.streamingToolCallParser.addChunk(
              index,
              "", // Empty chunk for metadata-only updates
              toolCall.id,
              toolCall.function?.name,
            );
          }
        }
      }

      // Only emit function calls when streaming is complete (finish_reason is present)
      if (choice.finish_reason) {
        const remainingSegments = this.processStreamingThinkingText(
          choiceIndex,
          "",
          true,
        );
        for (const segment of remainingSegments) {
          this.appendTextPart(parts, segment.text, {
            isThinking: segment.isThinking,
          });
        }

        const bufferedReasoning =
          this.streamingReasoningBuffers.get(choiceIndex);
        if (bufferedReasoning) {
          const formattedThought = this.formatThinkingBlock(bufferedReasoning);
          if (
            formattedThought &&
            this.shouldEmitThinkingBlock(choiceIndex, formattedThought)
          ) {
            this.appendTextPart(parts, formattedThought, {
              isThinking: true,
            });
          }
          this.streamingReasoningBuffers.delete(choiceIndex);
        }

        const completedToolCalls =
          this.streamingToolCallParser.getCompletedToolCalls();

        for (const toolCall of completedToolCalls) {
          if (toolCall.name) {
            const functionCall = {
              id:
                toolCall.id ||
                `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: toolCall.name,
              args: toolCall.args,
            };
            parts.push({ functionCall });
          }
        }

        // Clear the parser for the next stream
        this.streamingToolCallParser.reset();
      }

      // Only include finishReason key if finish_reason is present
      const candidate: Candidate = {
        content: {
          parts,
          role: "model" as const,
        },
        index: 0,
        safetyRatings: [],
      };
      if (choice.finish_reason) {
        candidate.finishReason = this.mapOpenAIFinishReasonToGemini(
          choice.finish_reason,
        );
      }
      response.candidates = [candidate];
    } else {
      response.candidates = [];
    }

    response.responseId = chunk.id;
    response.createTime = chunk.created
      ? chunk.created.toString()
      : new Date().getTime().toString();

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    // Add usage metadata if available in the chunk
    if (chunk.usage) {
      const usage = chunk.usage;

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;

      // If we only have total tokens but no breakdown, estimate the split
      // Typically input is ~70% and output is ~30% for most conversations
      let finalPromptTokens = promptTokens;
      let finalCompletionTokens = completionTokens;

      if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
        // Estimate: assume 70% input, 30% output
        finalPromptTokens = Math.round(totalTokens * 0.7);
        finalCompletionTokens = Math.round(totalTokens * 0.3);
      }

      response.usageMetadata = {
        promptTokenCount: finalPromptTokens,
        candidatesTokenCount: finalCompletionTokens,
        totalTokenCount: totalTokens,
        cachedContentTokenCount: cachedTokens,
      };
    }

    return response;
  }

  convertOpenAIResponseEventToGemini(
    event: ResponseStreamEvent,
  ): GenerateContentResponse | null {
    switch (event.type) {
      case "response.output_text.delta":
        return this.convertResponsesTextDeltaToGemini(event);
      case "response.function_call_arguments.delta":
        return this.convertResponsesFunctionCallDeltaToGemini(event);
      case "response.output_item.added":
        this.convertResponsesOutputItemAddedToGemini(event);
        return null;
      case "response.completed":
        return this.convertResponsesCompletedToGemini(event);
      default:
        return null;
    }
  }

  private isResponsesApiResponse(
    response: OpenAI.Chat.ChatCompletion | Response,
  ): response is Response {
    return "output_text" in response || "created_at" in response;
  }

  private convertResponsesApiResponseToGemini(
    response: Response,
  ): GenerateContentResponse {
    const parts: Part[] = [];

    for (const item of response.output ?? []) {
      if (item.type === "message") {
        for (const part of item.content ?? []) {
          if (part.type === "output_text") {
            this.appendTextPart(parts, this.formatThinkingSegments(part.text));
          }
        }
      } else if (item.type === "function_call") {
        const args = item.arguments ? safeJsonParse(item.arguments, {}) : {};
        parts.push({
          functionCall: {
            id: item.call_id || item.id,
            name: item.name,
            args,
          },
        });
      }
    }

    const geminiResponse = new GenerateContentResponse();
    geminiResponse.responseId = response.id;
    geminiResponse.createTime = response.created_at
      ? response.created_at.toString()
      : new Date().getTime().toString();
    geminiResponse.modelVersion = response.model;
    geminiResponse.promptFeedback = { safetyRatings: [] };

    const candidate: Candidate = {
      content: {
        parts,
        role: "model" as const,
      },
      index: 0,
      safetyRatings: [],
    };

    if (response.status === "completed") {
      candidate.finishReason = FinishReason.STOP;
    }

    geminiResponse.candidates = [candidate];

    if (response.usage) {
      const promptTokens = response.usage.input_tokens || 0;
      const completionTokens = response.usage.output_tokens || 0;
      const totalTokens = response.usage.total_tokens || 0;
      const cachedTokens =
        response.usage.input_tokens_details?.cached_tokens || 0;

      geminiResponse.usageMetadata = {
        promptTokenCount: promptTokens,
        candidatesTokenCount: completionTokens,
        totalTokenCount: totalTokens,
        cachedContentTokenCount: cachedTokens,
      };
    }

    return geminiResponse;
  }

  private convertResponsesTextDeltaToGemini(
    event: Extract<ResponseStreamEvent, { type: "response.output_text.delta" }>,
  ): GenerateContentResponse {
    const parts: Part[] = [];
    const segments = this.processStreamingThinkingText(
      event.output_index,
      event.delta,
    );
    for (const segment of segments) {
      this.appendTextPart(parts, segment.text, {
        isThinking: segment.isThinking,
      });
    }

    const response = new GenerateContentResponse();
    response.responseId = event.item_id;
    response.createTime = new Date().getTime().toString();
    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };
    response.candidates = [
      {
        content: { parts, role: "model" as const },
        index: 0,
        safetyRatings: [],
      },
    ];

    return response;
  }

  private convertResponsesFunctionCallDeltaToGemini(
    event: Extract<
      ResponseStreamEvent,
      { type: "response.function_call_arguments.delta" }
    >,
  ): GenerateContentResponse | null {
    this.streamingToolCallParser.addChunk(
      event.output_index,
      event.delta,
      event.item_id,
    );

    return null;
  }

  private convertResponsesOutputItemAddedToGemini(
    event: Extract<ResponseStreamEvent, { type: "response.output_item.added" }>,
  ): void {
    const item = event.item;
    if (item.type !== "function_call") return;
    this.streamingToolCallParser.addChunk(
      event.output_index,
      "",
      item.call_id || item.id,
      item.name,
    );
  }

  private convertResponsesCompletedToGemini(
    event: Extract<ResponseStreamEvent, { type: "response.completed" }>,
  ): GenerateContentResponse {
    const completedToolCalls =
      this.streamingToolCallParser.getCompletedToolCalls();

    this.streamingToolCallParser.reset();

    const response = this.convertResponsesApiResponseToGemini(event.response);
    const candidate = response.candidates?.[0];
    const existingParts = candidate?.content?.parts ?? [];

    const existingToolCallKeys = new Set<string>();
    for (const part of existingParts) {
      if ("functionCall" in part && part.functionCall) {
        const id = part.functionCall.id ?? "";
        const name = part.functionCall.name ?? "";
        const args =
          part.functionCall.args !== undefined
            ? JSON.stringify(part.functionCall.args)
            : "";
        const key = id ? `id:${id}` : `name:${name}|args:${args}`;
        existingToolCallKeys.add(key);
      }
    }

    const missingParts: Part[] = [];
    for (const toolCall of completedToolCalls) {
      if (!toolCall.name) continue;
      const id = toolCall.id || event.response.id;
      const argsJson =
        toolCall.args !== undefined ? JSON.stringify(toolCall.args) : "";
      const key = id ? `id:${id}` : `name:${toolCall.name}|args:${argsJson}`;
      if (existingToolCallKeys.has(key)) {
        continue;
      }
      missingParts.push({
        functionCall: {
          id,
          name: toolCall.name,
          args: toolCall.args,
        },
      });
    }

    if (missingParts.length > 0 && candidate) {
      candidate.content?.parts?.push(...missingParts);
    }

    return response;
  }

  /**
   * Extracts reasoning text from MiniMax reasoning_details payloads.
   */
  private extractReasoningText(reasoningDetails: unknown): string {
    if (!reasoningDetails) {
      return "";
    }

    if (typeof reasoningDetails === "string") {
      return reasoningDetails;
    }

    if (Array.isArray(reasoningDetails)) {
      return reasoningDetails
        .map((detail) => {
          if (!detail) return "";
          if (typeof detail === "string") return detail;
          if (typeof detail === "object") {
            const maybeText = (detail as { text?: unknown }).text;
            if (typeof maybeText === "string") {
              return maybeText;
            }
          }
          return "";
        })
        .filter((text) => text.length > 0)
        .join("");
    }

    if (typeof reasoningDetails === "object") {
      const maybeText = (reasoningDetails as { text?: unknown }).text;
      if (typeof maybeText === "string") {
        return maybeText;
      }
    }

    return "";
  }

  /**
   * Convert Gemini response format to OpenAI chat completion format for logging
   */
  convertGeminiResponseToOpenAI(
    response: GenerateContentResponse,
  ): OpenAI.Chat.ChatCompletion {
    const candidate = response.candidates?.[0];
    const content = candidate?.content;

    let messageContent: string | null = null;
    const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

    if (content?.parts) {
      const textParts: string[] = [];

      for (const part of content.parts) {
        if ("text" in part && part.text) {
          textParts.push(part.text);
        } else if ("functionCall" in part && part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id || `call_${toolCalls.length}`,
            type: "function" as const,
            function: {
              name: part.functionCall.name || "",
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }

      messageContent = textParts.join("").trimEnd();
    }

    const choice: OpenAI.Chat.ChatCompletion.Choice = {
      index: 0,
      message: {
        role: "assistant",
        content: messageContent,
        refusal: null,
      },
      finish_reason: this.mapGeminiFinishReasonToOpenAI(
        candidate?.finishReason,
      ) as OpenAI.Chat.ChatCompletion.Choice["finish_reason"],
      logprobs: null,
    };

    if (toolCalls.length > 0) {
      choice.message.tool_calls = toolCalls;
    }

    const openaiResponse: OpenAI.Chat.ChatCompletion = {
      id: response.responseId || `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: response.createTime
        ? Number(response.createTime)
        : Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [choice],
    };

    // Add usage metadata if available
    if (response.usageMetadata) {
      openaiResponse.usage = {
        prompt_tokens: response.usageMetadata.promptTokenCount || 0,
        completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata.totalTokenCount || 0,
      };

      if (response.usageMetadata.cachedContentTokenCount) {
        openaiResponse.usage.prompt_tokens_details = {
          cached_tokens: response.usageMetadata.cachedContentTokenCount,
        };
      }
    }

    return openaiResponse;
  }

  /**
   * Map OpenAI finish reasons to Gemini finish reasons
   */
  private mapOpenAIFinishReasonToGemini(
    openaiReason: string | null,
  ): FinishReason {
    if (!openaiReason) return FinishReason.FINISH_REASON_UNSPECIFIED;
    const mapping: Record<string, FinishReason> = {
      stop: FinishReason.STOP,
      length: FinishReason.MAX_TOKENS,
      content_filter: FinishReason.SAFETY,
      function_call: FinishReason.STOP,
      tool_calls: FinishReason.STOP,
    };
    return mapping[openaiReason] || FinishReason.FINISH_REASON_UNSPECIFIED;
  }

  /**
   * Map Gemini finish reasons to OpenAI finish reasons
   */
  private mapGeminiFinishReasonToOpenAI(geminiReason?: unknown): string {
    if (!geminiReason) return "stop";

    switch (geminiReason) {
      case "STOP":
      case 1: // FinishReason.STOP
        return "stop";
      case "MAX_TOKENS":
      case 2: // FinishReason.MAX_TOKENS
        return "length";
      case "SAFETY":
      case 3: // FinishReason.SAFETY
        return "content_filter";
      case "RECITATION":
      case 4: // FinishReason.RECITATION
        return "content_filter";
      case "OTHER":
      case 5: // FinishReason.OTHER
        return "stop";
      default:
        return "stop";
    }
  }

  /**
   * Clean up orphaned tool calls from message history to prevent OpenAI API errors
   */
  private cleanOrphanedToolCalls(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const cleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const toolCallIds = new Set<string>();
    const toolResponseIds = new Set<string>();

    // First pass: collect all tool call IDs and tool response IDs
    for (const message of messages) {
      if (
        message.role === "assistant" &&
        "tool_calls" in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            toolCallIds.add(toolCall.id);
          }
        }
      } else if (
        message.role === "tool" &&
        "tool_call_id" in message &&
        message.tool_call_id
      ) {
        toolResponseIds.add(message.tool_call_id);
      }
    }

    // Second pass: filter out orphaned messages
    for (const message of messages) {
      if (
        message.role === "assistant" &&
        "tool_calls" in message &&
        message.tool_calls
      ) {
        // Filter out tool calls that don't have corresponding responses
        const validToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && toolResponseIds.has(toolCall.id),
        );

        if (validToolCalls.length > 0) {
          // Keep the message but only with valid tool calls
          const cleanedMessage = { ...message };
          (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls = validToolCalls;
          cleaned.push(cleanedMessage);
        } else if (
          typeof message.content === "string" &&
          message.content.trim()
        ) {
          // Keep the message if it has text content, but remove tool calls
          const cleanedMessage = { ...message };
          delete (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls;
          cleaned.push(cleanedMessage);
        }
        // If no valid tool calls and no content, skip the message entirely
      } else if (
        message.role === "tool" &&
        "tool_call_id" in message &&
        message.tool_call_id
      ) {
        // Only keep tool responses that have corresponding tool calls
        if (toolCallIds.has(message.tool_call_id)) {
          cleaned.push(message);
        }
      } else {
        // Keep all other messages as-is
        cleaned.push(message);
      }
    }

    // Final validation: ensure every assistant message with tool_calls has corresponding tool responses
    const finalCleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const finalToolCallIds = new Set<string>();

    // Collect all remaining tool call IDs
    for (const message of cleaned) {
      if (
        message.role === "assistant" &&
        "tool_calls" in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            finalToolCallIds.add(toolCall.id);
          }
        }
      }
    }

    // Verify all tool calls have responses
    const finalToolResponseIds = new Set<string>();
    for (const message of cleaned) {
      if (
        message.role === "tool" &&
        "tool_call_id" in message &&
        message.tool_call_id
      ) {
        finalToolResponseIds.add(message.tool_call_id);
      }
    }

    // Remove any remaining orphaned tool calls
    for (const message of cleaned) {
      if (
        message.role === "assistant" &&
        "tool_calls" in message &&
        message.tool_calls
      ) {
        const finalValidToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && finalToolResponseIds.has(toolCall.id),
        );

        if (finalValidToolCalls.length > 0) {
          const cleanedMessage = { ...message };
          (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls = finalValidToolCalls;
          finalCleaned.push(cleanedMessage);
        } else if (
          typeof message.content === "string" &&
          message.content.trim()
        ) {
          const cleanedMessage = { ...message };
          delete (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls;
          finalCleaned.push(cleanedMessage);
        }
      } else {
        finalCleaned.push(message);
      }
    }

    return finalCleaned;
  }

  /**
   * Merge consecutive assistant messages to combine split text and tool calls
   */
  private mergeConsecutiveAssistantMessages(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const merged: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      if (message.role === "assistant" && merged.length > 0) {
        const lastMessage = merged[merged.length - 1];

        // If the last message is also an assistant message, merge them
        if (lastMessage.role === "assistant") {
          // Combine content
          const combinedContent = [
            typeof lastMessage.content === "string" ? lastMessage.content : "",
            typeof message.content === "string" ? message.content : "",
          ]
            .filter(Boolean)
            .join("");

          // Combine tool calls
          const lastToolCalls =
            "tool_calls" in lastMessage ? lastMessage.tool_calls || [] : [];
          const currentToolCalls =
            "tool_calls" in message ? message.tool_calls || [] : [];
          const combinedToolCalls = [...lastToolCalls, ...currentToolCalls];

          // Update the last message with combined data
          (
            lastMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              content: string | null;
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).content = combinedContent || null;
          if (combinedToolCalls.length > 0) {
            (
              lastMessage as OpenAI.Chat.ChatCompletionMessageParam & {
                content: string | null;
                tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
              }
            ).tool_calls = combinedToolCalls;
          }

          continue; // Skip adding the current message since it's been merged
        }
      }

      // Add the message as-is if no merging is needed
      merged.push(message);
    }

    return merged;
  }
}
