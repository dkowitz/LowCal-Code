/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from "vitest";
import { OpenAIContentConverter } from "./converter.js";
describe("OpenAIContentConverter", () => {
    let converter;
    beforeEach(() => {
        converter = new OpenAIContentConverter("test-model");
    });
    describe("resetStreamingToolCalls", () => {
        it("should clear streaming tool calls accumulator", () => {
            // Access private field for testing
            const parser = converter.streamingToolCallParser;
            // Add some test data to the parser
            parser.addChunk(0, '{"arg": "value"}', "test-id", "test-function");
            parser.addChunk(1, '{"arg2": "value2"}', "test-id-2", "test-function-2");
            // Verify data is present
            expect(parser.getBuffer(0)).toBe('{"arg": "value"}');
            expect(parser.getBuffer(1)).toBe('{"arg2": "value2"}');
            // Call reset method
            converter.resetStreamingToolCalls();
            // Verify data is cleared
            expect(parser.getBuffer(0)).toBe("");
            expect(parser.getBuffer(1)).toBe("");
        });
        it("should be safe to call multiple times", () => {
            // Call reset multiple times
            converter.resetStreamingToolCalls();
            converter.resetStreamingToolCalls();
            converter.resetStreamingToolCalls();
            // Should not throw any errors
            const parser = converter.streamingToolCallParser;
            expect(parser.getBuffer(0)).toBe("");
        });
        it("should be safe to call on empty accumulator", () => {
            // Call reset on empty accumulator
            converter.resetStreamingToolCalls();
            // Should not throw any errors
            const parser = converter.streamingToolCallParser;
            expect(parser.getBuffer(0)).toBe("");
        });
        it("should clear streaming reasoning buffers", () => {
            converter.streamingReasoningBuffers.set(0, "partial reasoning");
            converter.resetStreamingToolCalls();
            expect(converter.streamingReasoningBuffers.size).toBe(0);
        });
    });
    describe("convertOpenAIResponseToGemini", () => {
        it("should include thinking content when reasoning details are present", () => {
            const response = converter.convertOpenAIResponseToGemini({
                id: "resp-id",
                object: "chat.completion",
                created: 123,
                model: "minimax/minimax-m2",
                choices: [
                    {
                        index: 0,
                        finish_reason: "stop",
                        message: {
                            role: "assistant",
                            content: "Visible answer",
                            reasoning_details: [{ text: "Internal reasoning" }],
                        },
                    },
                ],
            });
            const parts = response.candidates?.[0]?.content?.parts ?? [];
            expect(parts?.length).toBeGreaterThan(0);
            const textParts = parts.map((part) => typeof part === "string"
                ? part
                : "text" in part
                    ? part.text ?? ""
                    : "");
            const visibleIndex = textParts.findIndex((value) => value?.includes("Visible answer"));
            const thinkingIndex = textParts.findIndex((value) => value?.includes("💭 *Internal reasoning*"));
            expect(visibleIndex).toBeGreaterThanOrEqual(0);
            expect(thinkingIndex).toBeGreaterThanOrEqual(0);
            expect(thinkingIndex).toBeGreaterThan(visibleIndex);
        });
    });
    describe("convertOpenAIChunkToGemini", () => {
        it("should buffer reasoning until finish_reason and emit <think> block", () => {
            converter.resetStreamingToolCalls();
            const firstChunk = converter.convertOpenAIChunkToGemini({
                id: "chunk-1",
                object: "chat.completion.chunk",
                created: 456,
                model: "minimax/minimax-m2",
                choices: [
                    {
                        index: 0,
                        delta: {
                            reasoning_details: [{ text: "Partial" }],
                        },
                    },
                ],
            });
            const firstParts = firstChunk.candidates?.[0]?.content?.parts ?? [];
            expect(firstParts.length).toBe(0);
            const secondChunk = converter.convertOpenAIChunkToGemini({
                id: "chunk-2",
                object: "chat.completion.chunk",
                created: 457,
                model: "minimax/minimax-m2",
                choices: [
                    {
                        index: 0,
                        delta: {
                            content: "Visible",
                        },
                        finish_reason: "stop",
                    },
                ],
            });
            const secondParts = secondChunk.candidates?.[0]?.content?.parts ?? [];
            expect(secondParts.length).toBeGreaterThan(0);
            const secondTextParts = secondParts.map((part) => typeof part === "string"
                ? part
                : "text" in part
                    ? part.text ?? ""
                    : "");
            const visibleIndex = secondTextParts.findIndex((value) => value?.includes("Visible"));
            const thinkingIndex = secondTextParts.findIndex((value) => value?.includes("💭 *Partial*"));
            expect(visibleIndex).toBeGreaterThanOrEqual(0);
            expect(thinkingIndex).toBeGreaterThanOrEqual(0);
            expect(thinkingIndex).toBeGreaterThan(visibleIndex);
            expect(converter.streamingReasoningBuffers.size).toBe(0);
        });
    });
});
//# sourceMappingURL=converter.test.js.map