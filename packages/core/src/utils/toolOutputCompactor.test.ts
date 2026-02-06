/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import type { Content, Part } from "@google/genai";
import {
  compactHistoryFunctionResponses,
  compactPartListUnion,
  compactToolOutputText,
} from "./toolOutputCompactor.js";

describe("toolOutputCompactor", () => {
  describe("compactToolOutputText", () => {
    it("returns original text when under the limit", () => {
      const text = "short output";
      const result = compactToolOutputText("read_file", text, {
        maxChars: 100,
      });

      expect(result.wasCompacted).toBe(false);
      expect(result.value).toBe(text);
    });

    it("truncates text that exceeds the limit", () => {
      const longText = "A".repeat(600) + "B".repeat(600);
      const result = compactToolOutputText("read_file", longText, {
        maxChars: 900,
        previewChars: 600,
        callId: "call-123",
      });

      expect(result.wasCompacted).toBe(true);
      expect(result.value).toContain("TOOL OUTPUT TRUNCATED");
      expect(result.value).toContain("call-123");
      expect(result.value).toContain("1,200 characters");
      expect(result.value).toContain("--- OUTPUT PREVIEW ---");
      expect(result.value).toContain("A".repeat(20));
      expect(result.value).toContain("... [truncated to preserve context]");
    });

    it("recognizes already-compacted strings", () => {
      const truncated =
        "TOOL OUTPUT TRUNCATED\n• Tool: read_file\n--- OUTPUT PREVIEW ---\npreview";
      const result = compactToolOutputText("read_file", truncated, {
        maxChars: 10,
      });

      expect(result.wasCompacted).toBe(false);
      expect(result.value).toBe(truncated);
    });
  });

  describe("compactPartListUnion", () => {
    it("compacts functionResponse outputs that are too large", () => {
      const longOutput = "X".repeat(1_500);
      const part: Part = {
        functionResponse: {
          id: "tool-1",
          name: "read_file",
          response: { output: longOutput },
        },
      };

      const result = compactPartListUnion("read_file", part, {
        maxChars: 600,
        previewChars: 600,
      });

      expect(result.wasCompacted).toBe(true);
      const updated = result.value as Part;
      const output =
        updated.functionResponse?.response &&
        (updated.functionResponse.response as Record<string, unknown>)[
          "output"
        ];

      expect(typeof output).toBe("string");
      expect(output).toContain("TOOL OUTPUT TRUNCATED");
      expect(output).toContain("tool-1");
    });
  });

  describe("compactHistoryFunctionResponses", () => {
    it("compacts oversized tool outputs inside chat history", () => {
      const part: Part = {
        functionResponse: {
          id: "tool-2",
          name: "find_files",
          response: { output: "Z".repeat(2_000) },
        },
      };
      const history: Content[] = [
        { role: "user", parts: [{ text: "request" }] },
        { role: "model", parts: [{ text: "response" }] },
        { role: "tool", parts: [part] },
      ];

      const { history: compacted, compactionCount } =
        compactHistoryFunctionResponses(history, {
          maxChars: 800,
          previewChars: 600,
        });

      expect(compactionCount).toBe(1);
      const toolEntry = compacted[2]?.parts?.[0] as Part;
      const output =
        toolEntry.functionResponse?.response &&
        (toolEntry.functionResponse.response as Record<string, unknown>)[
          "output"
        ];
      expect(typeof output).toBe("string");
      expect(output).toContain("TOOL OUTPUT TRUNCATED");
      expect(output).toContain("tool-2");
    });
  });
});
