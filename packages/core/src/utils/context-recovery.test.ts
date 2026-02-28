/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import type { Content } from "@google/genai";
import { compressToolResults } from "./context-recovery.js";

describe("context-recovery", () => {
  it("compresses mixed functionResponse turns that include non-function parts", () => {
    const longText = "A".repeat(700);
    const history: Content[] = [
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: "call-1",
              name: "read_image",
              response: { output: "ok" },
            },
          },
          { text: longText },
          {
            inlineData: {
              mimeType: "image/png",
              data: "base64-image",
            },
          },
        ],
      },
    ];

    const compressed = compressToolResults(history);
    const textPart = compressed[0]?.parts?.find((part) => "text" in part);

    expect(textPart).toBeDefined();
    expect((textPart as { text?: string }).text).toContain(
      "Tool Result Summary",
    );
  });
});
