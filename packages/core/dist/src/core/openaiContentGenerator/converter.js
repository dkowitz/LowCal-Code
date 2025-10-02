/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateContentResponse, FinishReason } from '@google/genai';
import { safeJsonParse } from '../../utils/safeJsonParse.js';
import { StreamingToolCallParser } from './streamingToolCallParser.js';
/**
 * Converter class for transforming data between Gemini and OpenAI formats
 */
export class OpenAIContentConverter {
    model;
    streamingToolCallParser = new StreamingToolCallParser();
    constructor(model) {
        this.model = model;
    }
    /**
     * Reset streaming tool calls parser for new stream processing
     * This should be called at the beginning of each stream to prevent
     * data pollution from previous incomplete streams
     */
    resetStreamingToolCalls() {
        this.streamingToolCallParser.reset();
    }
    /**
     * Convert Gemini tool parameters to OpenAI JSON Schema format
     */
    convertGeminiToolParametersToOpenAI(parameters) {
        if (!parameters || typeof parameters !== 'object') {
            return parameters;
        }
        const converted = JSON.parse(JSON.stringify(parameters));
        const convertTypes = (obj) => {
            if (typeof obj !== 'object' || obj === null) {
                return obj;
            }
            if (Array.isArray(obj)) {
                return obj.map(convertTypes);
            }
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (key === 'type' && typeof value === 'string') {
                    // Convert Gemini types to OpenAI JSON Schema types
                    const lowerValue = value.toLowerCase();
                    if (lowerValue === 'integer') {
                        result[key] = 'integer';
                    }
                    else if (lowerValue === 'number') {
                        result[key] = 'number';
                    }
                    else {
                        result[key] = lowerValue;
                    }
                }
                else if (key === 'minimum' ||
                    key === 'maximum' ||
                    key === 'multipleOf') {
                    // Ensure numeric constraints are actual numbers, not strings
                    if (typeof value === 'string' && !isNaN(Number(value))) {
                        result[key] = Number(value);
                    }
                    else {
                        result[key] = value;
                    }
                }
                else if (key === 'minLength' ||
                    key === 'maxLength' ||
                    key === 'minItems' ||
                    key === 'maxItems') {
                    // Ensure length constraints are integers, not strings
                    if (typeof value === 'string' && !isNaN(Number(value))) {
                        result[key] = parseInt(value, 10);
                    }
                    else {
                        result[key] = value;
                    }
                }
                else if (typeof value === 'object') {
                    result[key] = convertTypes(value);
                }
                else {
                    result[key] = value;
                }
            }
            return result;
        };
        return convertTypes(converted);
    }
    /**
     * Convert Gemini tools to OpenAI format for API compatibility.
     * Handles both Gemini tools (using 'parameters' field) and MCP tools (using 'parametersJsonSchema' field).
     */
    async convertGeminiToolsToOpenAI(geminiTools) {
        const openAITools = [];
        for (const tool of geminiTools) {
            let actualTool;
            // Handle CallableTool vs Tool
            if ('tool' in tool) {
                // This is a CallableTool
                actualTool = await tool.tool();
            }
            else {
                // This is already a Tool
                actualTool = tool;
            }
            if (actualTool.functionDeclarations) {
                for (const func of actualTool.functionDeclarations) {
                    if (func.name && func.description) {
                        let parameters;
                        // Handle both Gemini tools (parameters) and MCP tools (parametersJsonSchema)
                        if (func.parametersJsonSchema) {
                            // MCP tool format - use parametersJsonSchema directly
                            if (func.parametersJsonSchema) {
                                // Create a shallow copy to avoid mutating the original object
                                const paramsCopy = {
                                    ...func.parametersJsonSchema,
                                };
                                parameters = paramsCopy;
                            }
                        }
                        else if (func.parameters) {
                            // Gemini tool format - convert parameters to OpenAI format
                            parameters = this.convertGeminiToolParametersToOpenAI(func.parameters);
                        }
                        openAITools.push({
                            type: 'function',
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
    convertGeminiRequestToOpenAI(request) {
        const messages = [];
        // Handle system instruction from config
        this.addSystemInstructionMessage(request, messages);
        // Handle contents
        this.processContents(request.contents, messages);
        // Clean up orphaned tool calls and merge consecutive assistant messages
        const cleanedMessages = this.cleanOrphanedToolCalls(messages);
        const mergedMessages = this.mergeConsecutiveAssistantMessages(cleanedMessages);
        return mergedMessages;
    }
    /**
     * Extract and add system instruction message from request config
     */
    addSystemInstructionMessage(request, messages) {
        if (!request.config?.systemInstruction)
            return;
        const systemText = this.extractTextFromContentUnion(request.config.systemInstruction);
        if (systemText) {
            messages.push({
                role: 'system',
                content: systemText,
            });
        }
    }
    /**
     * Process contents and convert to OpenAI messages
     */
    processContents(contents, messages) {
        if (Array.isArray(contents)) {
            for (const content of contents) {
                this.processContent(content, messages);
            }
        }
        else if (contents) {
            this.processContent(contents, messages);
        }
    }
    /**
     * Process a single content item and convert to OpenAI message(s)
     */
    processContent(content, messages) {
        if (typeof content === 'string') {
            messages.push({ role: 'user', content });
            return;
        }
        if (!this.isContentObject(content))
            return;
        const parsedParts = this.parseParts(content.parts || []);
        // Handle function responses (tool results) first
        if (parsedParts.functionResponses.length > 0) {
            for (const funcResponse of parsedParts.functionResponses) {
                messages.push({
                    role: 'tool',
                    tool_call_id: funcResponse.id || '',
                    content: typeof funcResponse.response === 'string'
                        ? funcResponse.response
                        : JSON.stringify(funcResponse.response),
                });
            }
            return;
        }
        // Handle model messages with function calls
        if (content.role === 'model' && parsedParts.functionCalls.length > 0) {
            const toolCalls = parsedParts.functionCalls.map((fc, index) => ({
                id: fc.id || `call_${index}`,
                type: 'function',
                function: {
                    name: fc.name || '',
                    arguments: JSON.stringify(fc.args || {}),
                },
            }));
            messages.push({
                role: 'assistant',
                content: parsedParts.textParts.join('') || null,
                tool_calls: toolCalls,
            });
            return;
        }
        // Handle regular messages with multimodal content
        const role = content.role === 'model' ? 'assistant' : 'user';
        const openAIMessage = this.createMultimodalMessage(role, parsedParts);
        if (openAIMessage) {
            messages.push(openAIMessage);
        }
    }
    /**
     * Parse Gemini parts into categorized components
     */
    parseParts(parts) {
        const textParts = [];
        const functionCalls = [];
        const functionResponses = [];
        const mediaParts = [];
        for (const part of parts) {
            if (typeof part === 'string') {
                textParts.push(part);
            }
            else if ('text' in part && part.text) {
                textParts.push(part.text);
            }
            else if ('functionCall' in part && part.functionCall) {
                functionCalls.push(part.functionCall);
            }
            else if ('functionResponse' in part && part.functionResponse) {
                functionResponses.push(part.functionResponse);
            }
            else if ('inlineData' in part && part.inlineData) {
                const { data, mimeType } = part.inlineData;
                if (data && mimeType) {
                    const mediaType = this.getMediaType(mimeType);
                    mediaParts.push({ type: mediaType, data, mimeType });
                }
            }
            else if ('fileData' in part && part.fileData) {
                const { fileUri, mimeType } = part.fileData;
                if (fileUri && mimeType) {
                    const mediaType = this.getMediaType(mimeType);
                    mediaParts.push({
                        type: mediaType,
                        data: '',
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
    getMediaType(mimeType) {
        if (mimeType.startsWith('image/'))
            return 'image';
        if (mimeType.startsWith('audio/'))
            return 'audio';
        return 'file';
    }
    /**
     * Create multimodal OpenAI message from parsed parts
     */
    createMultimodalMessage(role, parsedParts) {
        const { textParts, mediaParts } = parsedParts;
        const content = textParts.map((text) => ({ type: 'text', text }));
        // If no media parts, return simple text message
        if (mediaParts.length === 0) {
            return content.length > 0 ? { role, content } : null;
        }
        // For assistant messages with media, convert to text only
        // since OpenAI assistant messages don't support media content arrays
        if (role === 'assistant') {
            return content.length > 0
                ? { role: 'assistant', content }
                : null;
        }
        const contentArray = [...content];
        // Add media content
        for (const mediaPart of mediaParts) {
            if (mediaPart.type === 'image') {
                if (mediaPart.fileUri) {
                    // For file URIs, use the URI directly
                    contentArray.push({
                        type: 'image_url',
                        image_url: { url: mediaPart.fileUri },
                    });
                }
                else if (mediaPart.data) {
                    // For inline data, create data URL
                    const dataUrl = `data:${mediaPart.mimeType};base64,${mediaPart.data}`;
                    contentArray.push({
                        type: 'image_url',
                        image_url: { url: dataUrl },
                    });
                }
            }
            else if (mediaPart.type === 'audio' && mediaPart.data) {
                // Convert audio format from MIME type
                const format = this.getAudioFormat(mediaPart.mimeType);
                if (format) {
                    contentArray.push({
                        type: 'input_audio',
                        input_audio: {
                            data: mediaPart.data,
                            format: format,
                        },
                    });
                }
            }
            // Note: File type is not directly supported in OpenAI's current API
            // Could be extended in the future or handled as text description
        }
        return contentArray.length > 0
            ? { role: 'user', content: contentArray }
            : null;
    }
    /**
     * Convert MIME type to OpenAI audio format
     */
    getAudioFormat(mimeType) {
        if (mimeType.includes('wav'))
            return 'wav';
        if (mimeType.includes('mp3') || mimeType.includes('mpeg'))
            return 'mp3';
        return null;
    }
    /**
     * Type guard to check if content is a valid Content object
     */
    isContentObject(content) {
        return (typeof content === 'object' &&
            content !== null &&
            'role' in content &&
            'parts' in content &&
            Array.isArray(content['parts']));
    }
    /**
     * Extract text content from various Gemini content union types
     */
    extractTextFromContentUnion(contentUnion) {
        if (typeof contentUnion === 'string') {
            return contentUnion;
        }
        if (Array.isArray(contentUnion)) {
            return contentUnion
                .map((item) => this.extractTextFromContentUnion(item))
                .filter(Boolean)
                .join('\n');
        }
        if (typeof contentUnion === 'object' && contentUnion !== null) {
            if ('parts' in contentUnion) {
                const content = contentUnion;
                return (content.parts
                    ?.map((part) => {
                    if (typeof part === 'string')
                        return part;
                    if ('text' in part)
                        return part.text || '';
                    return '';
                })
                    .filter(Boolean)
                    .join('\n') || '');
            }
        }
        return '';
    }
    /**
     * Convert OpenAI response to Gemini format
     */
    convertOpenAIResponseToGemini(openaiResponse) {
        const choice = openaiResponse.choices[0];
        const response = new GenerateContentResponse();
        const parts = [];
        // Handle text content
        if (choice.message.content) {
            parts.push({ text: choice.message.content });
        }
        // Handle tool calls
        if (choice.message.tool_calls) {
            for (const toolCall of choice.message.tool_calls) {
                if (toolCall.function) {
                    let args = {};
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
                    role: 'model',
                },
                finishReason: this.mapOpenAIFinishReasonToGemini(choice.finish_reason || 'stop'),
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
    convertOpenAIChunkToGemini(chunk) {
        const choice = chunk.choices?.[0];
        const response = new GenerateContentResponse();
        if (choice) {
            const parts = [];
            // Handle text content
            if (choice.delta?.content) {
                if (typeof choice.delta.content === 'string') {
                    parts.push({ text: choice.delta.content });
                }
            }
            // Handle tool calls using the streaming parser
            if (choice.delta?.tool_calls) {
                for (const toolCall of choice.delta.tool_calls) {
                    const index = toolCall.index ?? 0;
                    // Process the tool call chunk through the streaming parser
                    if (toolCall.function?.arguments) {
                        this.streamingToolCallParser.addChunk(index, toolCall.function.arguments, toolCall.id, toolCall.function.name);
                    }
                    else {
                        // Handle metadata-only chunks (id and/or name without arguments)
                        this.streamingToolCallParser.addChunk(index, '', // Empty chunk for metadata-only updates
                        toolCall.id, toolCall.function?.name);
                    }
                }
            }
            // Only emit function calls when streaming is complete (finish_reason is present)
            if (choice.finish_reason) {
                const completedToolCalls = this.streamingToolCallParser.getCompletedToolCalls();
                for (const toolCall of completedToolCalls) {
                    if (toolCall.name) {
                        parts.push({
                            functionCall: {
                                id: toolCall.id ||
                                    `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                                name: toolCall.name,
                                args: toolCall.args,
                            },
                        });
                    }
                }
                // Clear the parser for the next stream
                this.streamingToolCallParser.reset();
            }
            // Only include finishReason key if finish_reason is present
            const candidate = {
                content: {
                    parts,
                    role: 'model',
                },
                index: 0,
                safetyRatings: [],
            };
            if (choice.finish_reason) {
                candidate.finishReason = this.mapOpenAIFinishReasonToGemini(choice.finish_reason);
            }
            response.candidates = [candidate];
        }
        else {
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
    /**
     * Convert Gemini response format to OpenAI chat completion format for logging
     */
    convertGeminiResponseToOpenAI(response) {
        const candidate = response.candidates?.[0];
        const content = candidate?.content;
        let messageContent = null;
        const toolCalls = [];
        if (content?.parts) {
            const textParts = [];
            for (const part of content.parts) {
                if ('text' in part && part.text) {
                    textParts.push(part.text);
                }
                else if ('functionCall' in part && part.functionCall) {
                    toolCalls.push({
                        id: part.functionCall.id || `call_${toolCalls.length}`,
                        type: 'function',
                        function: {
                            name: part.functionCall.name || '',
                            arguments: JSON.stringify(part.functionCall.args || {}),
                        },
                    });
                }
            }
            messageContent = textParts.join('').trimEnd();
        }
        const choice = {
            index: 0,
            message: {
                role: 'assistant',
                content: messageContent,
                refusal: null,
            },
            finish_reason: this.mapGeminiFinishReasonToOpenAI(candidate?.finishReason),
            logprobs: null,
        };
        if (toolCalls.length > 0) {
            choice.message.tool_calls = toolCalls;
        }
        const openaiResponse = {
            id: response.responseId || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
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
    mapOpenAIFinishReasonToGemini(openaiReason) {
        if (!openaiReason)
            return FinishReason.FINISH_REASON_UNSPECIFIED;
        const mapping = {
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
    mapGeminiFinishReasonToOpenAI(geminiReason) {
        if (!geminiReason)
            return 'stop';
        switch (geminiReason) {
            case 'STOP':
            case 1: // FinishReason.STOP
                return 'stop';
            case 'MAX_TOKENS':
            case 2: // FinishReason.MAX_TOKENS
                return 'length';
            case 'SAFETY':
            case 3: // FinishReason.SAFETY
                return 'content_filter';
            case 'RECITATION':
            case 4: // FinishReason.RECITATION
                return 'content_filter';
            case 'OTHER':
            case 5: // FinishReason.OTHER
                return 'stop';
            default:
                return 'stop';
        }
    }
    /**
     * Clean up orphaned tool calls from message history to prevent OpenAI API errors
     */
    cleanOrphanedToolCalls(messages) {
        const cleaned = [];
        const toolCallIds = new Set();
        const toolResponseIds = new Set();
        // First pass: collect all tool call IDs and tool response IDs
        for (const message of messages) {
            if (message.role === 'assistant' &&
                'tool_calls' in message &&
                message.tool_calls) {
                for (const toolCall of message.tool_calls) {
                    if (toolCall.id) {
                        toolCallIds.add(toolCall.id);
                    }
                }
            }
            else if (message.role === 'tool' &&
                'tool_call_id' in message &&
                message.tool_call_id) {
                toolResponseIds.add(message.tool_call_id);
            }
        }
        // Second pass: filter out orphaned messages
        for (const message of messages) {
            if (message.role === 'assistant' &&
                'tool_calls' in message &&
                message.tool_calls) {
                // Filter out tool calls that don't have corresponding responses
                const validToolCalls = message.tool_calls.filter((toolCall) => toolCall.id && toolResponseIds.has(toolCall.id));
                if (validToolCalls.length > 0) {
                    // Keep the message but only with valid tool calls
                    const cleanedMessage = { ...message };
                    cleanedMessage.tool_calls = validToolCalls;
                    cleaned.push(cleanedMessage);
                }
                else if (typeof message.content === 'string' &&
                    message.content.trim()) {
                    // Keep the message if it has text content, but remove tool calls
                    const cleanedMessage = { ...message };
                    delete cleanedMessage.tool_calls;
                    cleaned.push(cleanedMessage);
                }
                // If no valid tool calls and no content, skip the message entirely
            }
            else if (message.role === 'tool' &&
                'tool_call_id' in message &&
                message.tool_call_id) {
                // Only keep tool responses that have corresponding tool calls
                if (toolCallIds.has(message.tool_call_id)) {
                    cleaned.push(message);
                }
            }
            else {
                // Keep all other messages as-is
                cleaned.push(message);
            }
        }
        // Final validation: ensure every assistant message with tool_calls has corresponding tool responses
        const finalCleaned = [];
        const finalToolCallIds = new Set();
        // Collect all remaining tool call IDs
        for (const message of cleaned) {
            if (message.role === 'assistant' &&
                'tool_calls' in message &&
                message.tool_calls) {
                for (const toolCall of message.tool_calls) {
                    if (toolCall.id) {
                        finalToolCallIds.add(toolCall.id);
                    }
                }
            }
        }
        // Verify all tool calls have responses
        const finalToolResponseIds = new Set();
        for (const message of cleaned) {
            if (message.role === 'tool' &&
                'tool_call_id' in message &&
                message.tool_call_id) {
                finalToolResponseIds.add(message.tool_call_id);
            }
        }
        // Remove any remaining orphaned tool calls
        for (const message of cleaned) {
            if (message.role === 'assistant' &&
                'tool_calls' in message &&
                message.tool_calls) {
                const finalValidToolCalls = message.tool_calls.filter((toolCall) => toolCall.id && finalToolResponseIds.has(toolCall.id));
                if (finalValidToolCalls.length > 0) {
                    const cleanedMessage = { ...message };
                    cleanedMessage.tool_calls = finalValidToolCalls;
                    finalCleaned.push(cleanedMessage);
                }
                else if (typeof message.content === 'string' &&
                    message.content.trim()) {
                    const cleanedMessage = { ...message };
                    delete cleanedMessage.tool_calls;
                    finalCleaned.push(cleanedMessage);
                }
            }
            else {
                finalCleaned.push(message);
            }
        }
        return finalCleaned;
    }
    /**
     * Merge consecutive assistant messages to combine split text and tool calls
     */
    mergeConsecutiveAssistantMessages(messages) {
        const merged = [];
        for (const message of messages) {
            if (message.role === 'assistant' && merged.length > 0) {
                const lastMessage = merged[merged.length - 1];
                // If the last message is also an assistant message, merge them
                if (lastMessage.role === 'assistant') {
                    // Combine content
                    const combinedContent = [
                        typeof lastMessage.content === 'string' ? lastMessage.content : '',
                        typeof message.content === 'string' ? message.content : '',
                    ]
                        .filter(Boolean)
                        .join('');
                    // Combine tool calls
                    const lastToolCalls = 'tool_calls' in lastMessage ? lastMessage.tool_calls || [] : [];
                    const currentToolCalls = 'tool_calls' in message ? message.tool_calls || [] : [];
                    const combinedToolCalls = [...lastToolCalls, ...currentToolCalls];
                    // Update the last message with combined data
                    lastMessage.content = combinedContent || null;
                    if (combinedToolCalls.length > 0) {
                        lastMessage.tool_calls = combinedToolCalls;
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
//# sourceMappingURL=converter.js.map