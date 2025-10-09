/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DefaultTelemetryService } from "./telemetryService.js";
import { logApiError, logApiResponse } from "../../telemetry/loggers.js";
import { ApiErrorEvent, ApiResponseEvent } from "../../telemetry/types.js";
import { openaiLogger } from "../../utils/openaiLogger.js";
// Mock dependencies
vi.mock("../../telemetry/loggers.js");
vi.mock("../../utils/openaiLogger.js");
describe("DefaultTelemetryService", () => {
    let mockConfig;
    let telemetryService;
    let mockRequestContext;
    beforeEach(() => {
        // Create mock config
        mockConfig = {
            getSessionId: vi.fn().mockReturnValue("test-session-id"),
        };
        // Create mock request context
        mockRequestContext = {
            userPromptId: "test-prompt-id",
            model: "test-model",
            authType: "test-auth",
            startTime: Date.now(),
            duration: 1000,
            isStreaming: false,
        };
        // Clear all mocks
        vi.clearAllMocks();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    describe("constructor", () => {
        it("should create instance with default OpenAI logging disabled", () => {
            const service = new DefaultTelemetryService(mockConfig);
            expect(service).toBeInstanceOf(DefaultTelemetryService);
        });
        it("should create instance with OpenAI logging enabled when specified", () => {
            const service = new DefaultTelemetryService(mockConfig, true);
            expect(service).toBeInstanceOf(DefaultTelemetryService);
        });
    });
    describe("logSuccess", () => {
        beforeEach(() => {
            telemetryService = new DefaultTelemetryService(mockConfig, false);
        });
        it("should log API response event with complete response data", async () => {
            const mockResponse = {
                responseId: "test-response-id",
                usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                    cachedContentTokenCount: 10,
                    thoughtsTokenCount: 5,
                    toolUsePromptTokenCount: 20,
                },
            };
            await telemetryService.logSuccess(mockRequestContext, mockResponse);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "test-response-id",
                model: "test-model",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
                input_token_count: 100,
                output_token_count: 50,
                total_token_count: 150,
                cached_content_token_count: 10,
                thoughts_token_count: 5,
                tool_token_count: 20,
            }));
        });
        it("should handle response without responseId", async () => {
            const mockResponse = {
                usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                },
            };
            await telemetryService.logSuccess(mockRequestContext, mockResponse);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "unknown",
                model: "test-model",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
            }));
        });
        it("should handle response without usage metadata", async () => {
            const mockResponse = {
                responseId: "test-response-id",
            };
            await telemetryService.logSuccess(mockRequestContext, mockResponse);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "test-response-id",
                model: "test-model",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
            }));
        });
        it("should not log OpenAI interaction when logging is disabled", async () => {
            const mockResponse = {
                responseId: "test-response-id",
            };
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIResponse = {
                id: "test-id",
                choices: [{ message: { content: "response" } }],
            };
            await telemetryService.logSuccess(mockRequestContext, mockResponse, mockOpenAIRequest, mockOpenAIResponse);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
        });
        it("should log OpenAI interaction when logging is enabled", async () => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
            const mockResponse = {
                responseId: "test-response-id",
            };
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIResponse = {
                id: "test-id",
                choices: [{ message: { content: "response" } }],
            };
            await telemetryService.logSuccess(mockRequestContext, mockResponse, mockOpenAIRequest, mockOpenAIResponse);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, mockOpenAIResponse);
        });
        it("should not log OpenAI interaction when request or response is missing", async () => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
            const mockResponse = {
                responseId: "test-response-id",
            };
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            // Test with missing OpenAI response
            await telemetryService.logSuccess(mockRequestContext, mockResponse, mockOpenAIRequest, undefined);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
            // Test with missing OpenAI request
            await telemetryService.logSuccess(mockRequestContext, mockResponse, undefined, {});
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
        });
    });
    describe("logError", () => {
        beforeEach(() => {
            telemetryService = new DefaultTelemetryService(mockConfig, false);
        });
        it("should log API error event with Error instance", async () => {
            const error = new Error("Test error message");
            error.requestID = "test-request-id";
            error.type = "TestError";
            error.code = "TEST_CODE";
            await telemetryService.logError(mockRequestContext, error);
            expect(logApiError).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "test-request-id",
                model: "test-model",
                error: "Test error message",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
                error_type: "TestError",
                status_code: "TEST_CODE",
            }));
        });
        it("should handle error without requestID", async () => {
            const error = new Error("Test error message");
            await telemetryService.logError(mockRequestContext, error);
            expect(logApiError).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "unknown",
                model: "test-model",
                error: "Test error message",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
            }));
        });
        it("should handle non-Error objects", async () => {
            const error = "String error message";
            await telemetryService.logError(mockRequestContext, error);
            expect(logApiError).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "unknown",
                model: "test-model",
                error: "String error message",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
            }));
        });
        it("should handle null/undefined errors", async () => {
            await telemetryService.logError(mockRequestContext, null);
            expect(logApiError).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                error: "null",
            }));
            await telemetryService.logError(mockRequestContext, undefined);
            expect(logApiError).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                error: "undefined",
            }));
        });
        it("should not log OpenAI interaction when logging is disabled", async () => {
            const error = new Error("Test error");
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            await telemetryService.logError(mockRequestContext, error, mockOpenAIRequest);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
        });
        it("should log OpenAI interaction when logging is enabled", async () => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
            const error = new Error("Test error");
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            await telemetryService.logError(mockRequestContext, error, mockOpenAIRequest);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, undefined, error);
        });
        it("should not log OpenAI interaction when request is missing", async () => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
            const error = new Error("Test error");
            await telemetryService.logError(mockRequestContext, error, undefined);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
        });
    });
    describe("logStreamingSuccess", () => {
        beforeEach(() => {
            telemetryService = new DefaultTelemetryService(mockConfig, false);
        });
        it("should log streaming success with multiple responses", async () => {
            const mockResponses = [
                {
                    responseId: "response-1",
                    usageMetadata: {
                        promptTokenCount: 50,
                        candidatesTokenCount: 25,
                        totalTokenCount: 75,
                    },
                },
                {
                    responseId: "response-2",
                    usageMetadata: {
                        promptTokenCount: 100,
                        candidatesTokenCount: 50,
                        totalTokenCount: 150,
                        cachedContentTokenCount: 10,
                        thoughtsTokenCount: 5,
                        toolUsePromptTokenCount: 20,
                    },
                },
                {
                    responseId: "response-3",
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "response-3",
                model: "test-model",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
                // Should use usage metadata from response-2 (last one with metadata)
                input_token_count: 100,
                output_token_count: 50,
                total_token_count: 150,
                cached_content_token_count: 10,
                thoughts_token_count: 5,
                tool_token_count: 20,
            }));
        });
        it("should handle empty responses array", async () => {
            const mockResponses = [];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "unknown",
                model: "test-model",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
            }));
        });
        it("should handle responses without usage metadata", async () => {
            const mockResponses = [
                {
                    responseId: "response-1",
                },
                {
                    responseId: "response-2",
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "response-2",
                model: "test-model",
                duration_ms: 1000,
                prompt_id: "test-prompt-id",
                auth_type: "test-auth",
            }));
        });
        it("should use the last response with usage metadata", async () => {
            const mockResponses = [
                {
                    responseId: "response-1",
                    usageMetadata: {
                        promptTokenCount: 50,
                        candidatesTokenCount: 25,
                        totalTokenCount: 75,
                    },
                },
                {
                    responseId: "response-2",
                },
                {
                    responseId: "response-3",
                    usageMetadata: {
                        promptTokenCount: 100,
                        candidatesTokenCount: 50,
                        totalTokenCount: 150,
                    },
                },
                {
                    responseId: "response-4",
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.objectContaining({
                response_id: "response-4",
                // Should use usage metadata from response-3 (last one with metadata)
                input_token_count: 100,
                output_token_count: 50,
                total_token_count: 150,
            }));
        });
        it("should not log OpenAI interaction when logging is disabled", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    choices: [{ delta: { content: "response" } }],
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
        });
        it("should log OpenAI interaction when logging is enabled", async () => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: "Hello" },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: " world" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                id: "test-id",
                object: "chat.completion",
                created: 1234567890,
                model: "gpt-4",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "Hello world",
                            refusal: null,
                        },
                        finish_reason: "stop",
                        logprobs: null,
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            }));
        });
        it("should not log OpenAI interaction when request or chunks are missing", async () => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            // Test with missing OpenAI chunks
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, undefined);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
            // Test with missing OpenAI request
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, undefined, []);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
            // Test with empty chunks array
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, []);
            expect(openaiLogger.logInteraction).not.toHaveBeenCalled();
        });
    });
    describe("RequestContext interface", () => {
        it("should have all required properties", () => {
            const context = {
                userPromptId: "test-prompt-id",
                model: "test-model",
                authType: "test-auth",
                startTime: Date.now(),
                duration: 1000,
                isStreaming: false,
            };
            expect(context.userPromptId).toBe("test-prompt-id");
            expect(context.model).toBe("test-model");
            expect(context.authType).toBe("test-auth");
            expect(typeof context.startTime).toBe("number");
            expect(context.duration).toBe(1000);
            expect(context.isStreaming).toBe(false);
        });
        it("should support streaming context", () => {
            const context = {
                userPromptId: "test-prompt-id",
                model: "test-model",
                authType: "test-auth",
                startTime: Date.now(),
                duration: 1000,
                isStreaming: true,
            };
            expect(context.isStreaming).toBe(true);
        });
    });
    describe("combineOpenAIChunksForLogging", () => {
        beforeEach(() => {
            telemetryService = new DefaultTelemetryService(mockConfig, true);
        });
        it("should combine simple text chunks correctly", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: "Hello" },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: " world!" },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                id: "test-id",
                object: "chat.completion",
                created: 1234567890,
                model: "gpt-4",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "Hello world!",
                            refusal: null,
                        },
                        finish_reason: "stop",
                        logprobs: null,
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            }));
        });
        it("should combine tool call chunks correctly", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "call_123",
                                        type: "function",
                                        function: { name: "get_weather", arguments: "" },
                                    },
                                ],
                            },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        function: { arguments: '{"location": "' },
                                    },
                                ],
                            },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        function: { arguments: 'New York"}' },
                                    },
                                ],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                    usage: {
                        prompt_tokens: 15,
                        completion_tokens: 8,
                        total_tokens: 23,
                    },
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                id: "test-id",
                object: "chat.completion",
                created: 1234567890,
                model: "gpt-4",
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: null,
                            refusal: null,
                            tool_calls: [
                                {
                                    id: "call_123",
                                    type: "function",
                                    function: {
                                        name: "get_weather",
                                        arguments: '{"location": "New York"}',
                                    },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                        logprobs: null,
                    },
                ],
                usage: {
                    prompt_tokens: 15,
                    completion_tokens: 8,
                    total_tokens: 23,
                },
            }));
        });
        it("should handle mixed content and tool calls", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: "Let me check the weather. " },
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "call_456",
                                        type: "function",
                                        function: {
                                            name: "get_weather",
                                            arguments: '{"location": "Paris"}',
                                        },
                                    },
                                ],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                    usage: {
                        prompt_tokens: 20,
                        completion_tokens: 12,
                        total_tokens: 32,
                    },
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: "Let me check the weather. ",
                            refusal: null,
                            tool_calls: [
                                {
                                    id: "call_456",
                                    type: "function",
                                    function: {
                                        name: "get_weather",
                                        arguments: '{"location": "Paris"}',
                                    },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                        logprobs: null,
                    },
                ],
            }));
        });
        it("should handle chunks with no content or tool calls", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: null,
                        },
                    ],
                },
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {},
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 5,
                        completion_tokens: 0,
                        total_tokens: 5,
                    },
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: null,
                            refusal: null,
                        },
                        finish_reason: "stop",
                        logprobs: null,
                    },
                ],
            }));
        });
        it("should use default values when usage is missing", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: "Hello" },
                            finish_reason: "stop",
                        },
                    ],
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
            }));
        });
        it("should use default finish_reason when missing", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: { content: "Hello" },
                            finish_reason: null,
                        },
                    ],
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                choices: [
                    {
                        index: 0,
                        message: expect.any(Object),
                        finish_reason: "stop",
                        logprobs: null,
                    },
                ],
            }));
        });
        it("should filter out empty tool calls", async () => {
            const mockResponses = [
                { responseId: "response-1" },
            ];
            const mockOpenAIRequest = {
                model: "gpt-4",
                messages: [{ role: "user", content: "test" }],
            };
            const mockOpenAIChunks = [
                {
                    id: "test-id",
                    object: "chat.completion.chunk",
                    created: 1234567890,
                    model: "gpt-4",
                    choices: [
                        {
                            index: 0,
                            delta: {
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "", // Empty ID should be filtered out
                                        type: "function",
                                        function: { name: "test", arguments: "{}" },
                                    },
                                    {
                                        index: 1,
                                        id: "call_valid",
                                        type: "function",
                                        function: { name: "valid_call", arguments: "{}" },
                                    },
                                ],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                },
            ];
            await telemetryService.logStreamingSuccess(mockRequestContext, mockResponses, mockOpenAIRequest, mockOpenAIChunks);
            expect(openaiLogger.logInteraction).toHaveBeenCalledWith(mockOpenAIRequest, expect.objectContaining({
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: null,
                            refusal: null,
                            tool_calls: [
                                {
                                    id: "call_valid",
                                    type: "function",
                                    function: {
                                        name: "valid_call",
                                        arguments: "{}",
                                    },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                        logprobs: null,
                    },
                ],
            }));
        });
    });
    describe("integration with telemetry events", () => {
        beforeEach(() => {
            telemetryService = new DefaultTelemetryService(mockConfig, false);
        });
        it("should create ApiResponseEvent with correct structure", async () => {
            const mockResponse = {
                responseId: "test-response-id",
                usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 50,
                    totalTokenCount: 150,
                },
            };
            await telemetryService.logSuccess(mockRequestContext, mockResponse);
            expect(logApiResponse).toHaveBeenCalledWith(mockConfig, expect.any(ApiResponseEvent));
            const mockLogApiResponse = vi.mocked(logApiResponse);
            const callArgs = mockLogApiResponse.mock.calls[0];
            const event = callArgs[1];
            expect(event["event.name"]).toBe("api_response");
            expect(event["event.timestamp"]).toBeDefined();
            expect(event.response_id).toBe("test-response-id");
            expect(event.model).toBe("test-model");
            expect(event.duration_ms).toBe(1000);
            expect(event.prompt_id).toBe("test-prompt-id");
            expect(event.auth_type).toBe("test-auth");
        });
        it("should create ApiErrorEvent with correct structure", async () => {
            const error = new Error("Test error message");
            error.requestID = "test-request-id";
            error.type = "TestError";
            error.code = "TEST_CODE";
            await telemetryService.logError(mockRequestContext, error);
            expect(logApiError).toHaveBeenCalledWith(mockConfig, expect.any(ApiErrorEvent));
            const mockLogApiError = vi.mocked(logApiError);
            const callArgs = mockLogApiError.mock.calls[0];
            const event = callArgs[1];
            expect(event["event.name"]).toBe("api_error");
            expect(event["event.timestamp"]).toBeDefined();
            expect(event.response_id).toBe("test-request-id");
            expect(event.model).toBe("test-model");
            expect(event.error).toBe("Test error message");
            expect(event.duration_ms).toBe(1000);
            expect(event.prompt_id).toBe("test-prompt-id");
            expect(event.auth_type).toBe("test-auth");
            expect(event.error_type).toBe("TestError");
            expect(event.status_code).toBe("TEST_CODE");
        });
    });
});
//# sourceMappingURL=telemetryService.test.js.map