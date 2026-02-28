/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { compressToolResults } from "./context-recovery.js";
describe("context-recovery", () => {
    it("compresses mixed functionResponse turns that include non-function parts", () => {
        const longText = "A".repeat(700);
        const history = [
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
        expect(textPart.text).toContain("Tool Result Summary");
    });
});
//# sourceMappingURL=context-recovery.test.js.map