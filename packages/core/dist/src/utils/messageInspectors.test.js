/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { hasFunctionResponse, isFunctionResponse } from "./messageInspectors.js";
describe("messageInspectors", () => {
    it("detects pure function response turns", () => {
        const content = {
            role: "user",
            parts: [
                {
                    functionResponse: {
                        id: "call-1",
                        name: "tool",
                        response: { output: "ok" },
                    },
                },
            ],
        };
        expect(hasFunctionResponse(content)).toBe(true);
        expect(isFunctionResponse(content)).toBe(true);
    });
    it("detects mixed tool response turns with media payloads", () => {
        const content = {
            role: "user",
            parts: [
                {
                    functionResponse: {
                        id: "call-2",
                        name: "read_image",
                        response: { output: "done" },
                    },
                },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: "base64data",
                    },
                },
            ],
        };
        expect(hasFunctionResponse(content)).toBe(true);
        expect(isFunctionResponse(content)).toBe(true);
    });
    it("does not misclassify normal user text turns", () => {
        const content = {
            role: "user",
            parts: [{ text: "hello" }],
        };
        expect(hasFunctionResponse(content)).toBe(false);
        expect(isFunctionResponse(content)).toBe(false);
    });
});
//# sourceMappingURL=messageInspectors.test.js.map