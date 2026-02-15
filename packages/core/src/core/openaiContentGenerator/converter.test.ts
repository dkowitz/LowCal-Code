/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from "vitest";
import { OpenAIContentConverter } from "./converter.js";
import type { StreamingToolCallParser } from "./streamingToolCallParser.js";
import type OpenAI from "openai";
import type { FunctionCall } from "@google/genai";

describe("OpenAIContentConverter", () => {
  let converter: OpenAIContentConverter;
  const TEST_PROMPT_ID = "prompt-123";

  beforeEach(() => {
    converter = new OpenAIContentConverter("test-model");
  });

  describe("resetStreamingToolCalls", () => {
    it("should clear streaming tool calls accumulator", () => {
      // Access private field for testing
      const parser = (
        converter as unknown as {
          streamingToolCallParser: StreamingToolCallParser;
        }
      ).streamingToolCallParser;

      // Add some test data to the parser
      parser.addChunk(0, '{"arg": "value"}', "test-id", "test-function");
      parser.addChunk(1, '{"arg2": "value2"}', "test-id-2", "test-function-2");

      // Verify data is present
      expect(parser.getBuffer(0)).toBe('{"arg": "value"}');
      expect(parser.getBuffer(1)).toBe('{"arg2": "value2"}');

      // Call reset method
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      // Verify data is cleared
      expect(parser.getBuffer(0)).toBe("");
      expect(parser.getBuffer(1)).toBe("");
    });

    it("should be safe to call multiple times", () => {
      // Call reset multiple times
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      // Should not throw any errors
      const parser = (
        converter as unknown as {
          streamingToolCallParser: StreamingToolCallParser;
        }
      ).streamingToolCallParser;
      expect(parser.getBuffer(0)).toBe("");
    });

    it("should be safe to call on empty accumulator", () => {
      // Call reset on empty accumulator
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      // Should not throw any errors
      const parser = (
        converter as unknown as {
          streamingToolCallParser: StreamingToolCallParser;
        }
      ).streamingToolCallParser;
      expect(parser.getBuffer(0)).toBe("");
    });

    it("should clear streaming reasoning buffers", () => {
      (
        converter as unknown as {
          streamingReasoningBuffers: Map<number, string>;
        }
      ).streamingReasoningBuffers.set(0, "partial reasoning");

      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      expect(
        (
          converter as unknown as {
            streamingReasoningBuffers: Map<number, string>;
          }
        ).streamingReasoningBuffers.size,
      ).toBe(0);
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
      } as unknown as OpenAI.Chat.ChatCompletion);

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      expect(parts?.length).toBeGreaterThan(0);

      const textParts = parts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      const visibleIndex = textParts.findIndex((value) =>
        value?.includes("Visible answer"),
      );
      const thinkingIndex = textParts.findIndex((value) =>
        value?.includes("💭 *Internal reasoning*"),
      );

      expect(visibleIndex).toBeGreaterThanOrEqual(0);
      expect(thinkingIndex).toBeGreaterThanOrEqual(0);
      expect(thinkingIndex).toBeGreaterThan(visibleIndex);
    });
  });

  describe("convertGeminiRequestToOpenAI", () => {
    it("preserves media emitted with tool responses", () => {
      const request = {
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  id: "call-read-image-1",
                  name: "read_image",
                  args: { absolute_path: "/tmp/bat.jpg" },
                },
              },
            ],
          },
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  id: "call-read-image-1",
                  name: "read_image",
                  response: { output: "Tool execution succeeded." },
                },
              },
              {
                text: "Image loaded from /tmp/bat.jpg. Analyze visual content.",
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: "dGVzdA==",
                },
              },
            ],
          },
        ],
      } as any;

      const messages = converter.convertGeminiRequestToOpenAI(request);
      expect(messages.length).toBe(3);

      const assistantMessage = messages[0] as OpenAI.Chat.ChatCompletionMessage;
      expect(assistantMessage.role).toBe("assistant");
      expect(
        (assistantMessage as OpenAI.Chat.ChatCompletionAssistantMessageParam)
          .tool_calls?.[0]?.function.name,
      ).toBe("read_image");

      const toolMessage = messages[1] as OpenAI.Chat.ChatCompletionToolMessageParam;
      expect(toolMessage.role).toBe("tool");
      expect(toolMessage.tool_call_id).toBe("call-read-image-1");

      const userMessage = messages[2] as OpenAI.Chat.ChatCompletionUserMessageParam;
      expect(userMessage.role).toBe("user");
      expect(Array.isArray(userMessage.content)).toBe(true);

      const content = userMessage.content as OpenAI.Chat.ChatCompletionContentPart[];
      const textPart = content.find((part) => part.type === "text") as
        | OpenAI.Chat.ChatCompletionContentPartText
        | undefined;
      expect(textPart?.text).toContain("Analyze visual content");

      const imagePart = content.find((part) => part.type === "image_url") as
        | OpenAI.Chat.ChatCompletionContentPartImage
        | undefined;
      expect(imagePart?.image_url.url).toBe("data:image/jpeg;base64,dGVzdA==");
    });
  });

  describe("convertOpenAIChunkToGemini", () => {
    it("should buffer reasoning until finish_reason and emit <think> block", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

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
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

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
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const secondParts = secondChunk.candidates?.[0]?.content?.parts ?? [];
      expect(secondParts.length).toBeGreaterThan(0);

      const secondTextParts = secondParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      const visibleIndex = secondTextParts.findIndex((value) =>
        value?.includes("Visible"),
      );
      const thinkingIndex = secondTextParts.findIndex((value) =>
        value?.includes("💭 *Partial*"),
      );

      expect(visibleIndex).toBeGreaterThanOrEqual(0);
      expect(thinkingIndex).toBeGreaterThanOrEqual(0);
      expect(thinkingIndex).toBeGreaterThan(visibleIndex);

      expect(
        (
          converter as unknown as {
            streamingReasoningBuffers: Map<number, string>;
          }
        ).streamingReasoningBuffers.size,
      ).toBe(0);
    });

    it("deduplicates repeated reasoning_details chunks", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      converter.convertOpenAIChunkToGemini({
        id: "chunk-1",
        object: "chat.completion.chunk",
        created: 1000,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              reasoning_details: [{ text: "Step one" }],
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const finalChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-2",
        object: "chat.completion.chunk",
        created: 1001,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              reasoning_details: [{ text: "Step one" }],
              content: "Visible answer",
            },
            finish_reason: "stop",
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const finalParts = finalChunk.candidates?.[0]?.content?.parts ?? [];
      const finalTextParts = finalParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      const thinkingParts = finalTextParts.filter((value) =>
        value?.includes("💭 *Step one*"),
      );
      expect(thinkingParts.length).toBe(1);
    });

    it("omits duplicate streaming <think> blocks", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      const firstChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-3",
        object: "chat.completion.chunk",
        created: 2000,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "<think>Plan next</think>",
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const firstParts = firstChunk.candidates?.[0]?.content?.parts ?? [];
      const firstTextParts = firstParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );
      expect(firstTextParts.some((value) => value?.includes("Plan next"))).toBe(
        true,
      );

      const duplicateChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-4",
        object: "chat.completion.chunk",
        created: 2001,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "<think>Plan next</think>",
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const duplicateParts =
        duplicateChunk.candidates?.[0]?.content?.parts ?? [];
      const duplicateTextParts = duplicateParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      expect(
        duplicateTextParts.some((value) => value?.includes("Plan next")),
      ).toBe(false);
    });

    it("persists thinking dedupe across continuations within same session", () => {
      converter.resetStreamingToolCalls("sessionA########1");

      converter.convertOpenAIChunkToGemini({
        id: "chunk-5",
        object: "chat.completion.chunk",
        created: 3000,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "<think>Repeat later</think>",
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      converter.resetStreamingToolCalls("sessionA########2");
      const continuationChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-6",
        object: "chat.completion.chunk",
        created: 3001,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "<think>Repeat later</think>",
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const continuationParts =
        continuationChunk.candidates?.[0]?.content?.parts ?? [];
      const continuationTextParts = continuationParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      expect(
        continuationTextParts.some((value) => value?.includes("Repeat later")),
      ).toBe(false);
    });

    it("allows identical thinking blocks after prompt id changes", () => {
      converter.resetStreamingToolCalls("prompt-alpha");

      const firstChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-7",
        object: "chat.completion.chunk",
        created: 4000,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "<think>Fresh thought</think>",
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const firstParts = firstChunk.candidates?.[0]?.content?.parts ?? [];
      const firstTextParts = firstParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      expect(
        firstTextParts.some((value) => value?.includes("Fresh thought")),
      ).toBe(true);

      converter.resetStreamingToolCalls("prompt-beta");

      const secondChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-8",
        object: "chat.completion.chunk",
        created: 4001,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "<think>Fresh thought</think>",
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const secondParts = secondChunk.candidates?.[0]?.content?.parts ?? [];
      const secondTextParts = secondParts.map((part) =>
        typeof part === "string"
          ? part
          : "text" in part
            ? ((part as { text?: string }).text ?? "")
            : "",
      );

      expect(
        secondTextParts.some((value) => value?.includes("Fresh thought")),
      ).toBe(true);
    });

    it("converts XML tool calls embedded in text to function calls", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      const chunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-xml",
        object: "chat.completion.chunk",
        created: 5000,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content:
                '<tool_call><invoke name="run_shell_command"><parameter name="command">echo "hello"</parameter><parameter name="is_background">false</parameter></invoke></tool_call>Let me continue.',
            },
            finish_reason: "stop",
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const functionPart = parts.find(
        (part) => typeof part === "object" && "functionCall" in part,
      ) as { functionCall?: FunctionCall } | undefined;
      expect(functionPart?.functionCall?.name).toBe("run_shell_command");
      expect(functionPart?.functionCall?.args).toMatchObject({
        command: 'echo "hello"',
        is_background: false,
      });

      const textPart = parts.find(
        (part) =>
          typeof part === "object" &&
          "text" in part &&
          (part as { text?: string }).text?.includes("Let me continue."),
      ) as { text?: string } | undefined;
      expect(textPart?.text).toBeDefined();
      expect(textPart?.text).not.toContain("<invoke");

      expect(chunk.functionCalls).toBeDefined();
      expect(chunk.functionCalls?.length).toBe(1);
      expect(chunk.functionCalls?.[0]?.name).toBe("run_shell_command");
    });

    it("buffers partial XML tool calls across chunks", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      const firstChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-xml-1",
        object: "chat.completion.chunk",
        created: 6000,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content:
                '<tool_call><invoke name="run_shell_command"><parameter name="command">echo "hi',
            },
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      expect(firstChunk.functionCalls).toBeUndefined();

      const secondChunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-xml-2",
        object: "chat.completion.chunk",
        created: 6001,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content:
                '"</parameter><parameter name="description">Test</parameter></invoke></tool_call>',
            },
            finish_reason: "stop",
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      expect(secondChunk.functionCalls).toBeDefined();
      expect(secondChunk.functionCalls?.length).toBe(1);
      expect(secondChunk.functionCalls?.[0]?.args).toMatchObject({
        command: 'echo "hi"',
        description: "Test",
      });
    });

    it("converts qwen-coder style function blocks to function calls", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      const chunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-function",
        object: "chat.completion.chunk",
        created: 7000,
        model: "qwen/qwen3-coder",
        choices: [
          {
            index: 0,
            delta: {
              content:
                "<tool_call><function=read_file><parameter=absolute_path>/tmp/example.ts</parameter><parameter=offset>10</parameter></function></tool_call>Continuing.",
            },
            finish_reason: "stop",
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      expect(chunk.functionCalls?.length).toBe(1);
      expect(chunk.functionCalls?.[0]?.name).toBe("read_file");
      expect(chunk.functionCalls?.[0]?.args).toMatchObject({
        absolute_path: "/tmp/example.ts",
        offset: 10,
      });

      const textPart = chunk.candidates?.[0]?.content?.parts?.find(
        (part) => typeof part === "object" && "text" in part && part.text,
      ) as { text?: string } | undefined;
      expect(textPart?.text).toContain("Continuing.");
      expect(textPart?.text).not.toContain("tool_call");
      expect(textPart?.text).not.toContain("function=");
    });

    it("converts qwen-vl JSON tool_call blocks to function calls", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      const chunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-json-tool-call",
        object: "chat.completion.chunk",
        created: 7001,
        model: "qwen/qwen2.5-vl",
        choices: [
          {
            index: 0,
            delta: {
              content:
                '<tool_call>{"name":"read_file","arguments":{"absolute_path":"/tmp/bronc.jpg"}}</tool_call>I will inspect it now.',
            },
            finish_reason: "stop",
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      expect(chunk.functionCalls?.length).toBe(1);
      expect(chunk.functionCalls?.[0]?.name).toBe("read_file");
      expect(chunk.functionCalls?.[0]?.args).toMatchObject({
        absolute_path: "/tmp/bronc.jpg",
      });

      const textPart = chunk.candidates?.[0]?.content?.parts?.find(
        (part) => typeof part === "object" && "text" in part && part.text,
      ) as { text?: string } | undefined;
      expect(textPart?.text).toContain("I will inspect it now.");
      expect(textPart?.text).not.toContain("tool_call");
    });

    it("strips stray parameter tags after tool calls", () => {
      converter.resetStreamingToolCalls(TEST_PROMPT_ID);

      const chunk = converter.convertOpenAIChunkToGemini({
        id: "chunk-param-1",
        object: "chat.completion.chunk",
        created: 7100,
        model: "minimax/minimax-m2",
        choices: [
          {
            index: 0,
            delta: {
              content: "</parameter></invoke></tool_call>Continuing with task.",
            },
            finish_reason: "stop",
          },
        ],
      } as unknown as OpenAI.Chat.ChatCompletionChunk);

      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const textPart = parts.find(
        (part) =>
          typeof part === "object" && "text" in part && part.text?.length,
      ) as { text?: string } | undefined;

      expect(textPart?.text).toContain("Continuing with task.");
      expect(textPart?.text).not.toContain("parameter");
      expect(textPart?.text).not.toContain("invoke");
      expect(textPart?.text).not.toContain("tool_call");
    });
  });
});
