/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { compactHistoryMediaPayloads, compactHistoryFunctionResponses, compactPartListUnion, compactToolOutputText, } from "./toolOutputCompactor.js";
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
            const truncated = "TOOL OUTPUT TRUNCATED\n• Tool: read_file\n--- OUTPUT PREVIEW ---\npreview";
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
            const part = {
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
            const updated = result.value;
            const output = updated.functionResponse?.response &&
                updated.functionResponse.response["output"];
            expect(typeof output).toBe("string");
            expect(output).toContain("TOOL OUTPUT TRUNCATED");
            expect(output).toContain("tool-1");
        });
    });
    describe("compactHistoryFunctionResponses", () => {
        it("compacts oversized tool outputs inside chat history", () => {
            const part = {
                functionResponse: {
                    id: "tool-2",
                    name: "find_files",
                    response: { output: "Z".repeat(2_000) },
                },
            };
            const history = [
                { role: "user", parts: [{ text: "request" }] },
                { role: "model", parts: [{ text: "response" }] },
                { role: "tool", parts: [part] },
            ];
            const { history: compacted, compactionCount } = compactHistoryFunctionResponses(history, {
                maxChars: 800,
                previewChars: 600,
            });
            expect(compactionCount).toBe(1);
            const toolEntry = compacted[2]?.parts?.[0];
            const output = toolEntry.functionResponse?.response &&
                toolEntry.functionResponse.response["output"];
            expect(typeof output).toBe("string");
            expect(output).toContain("TOOL OUTPUT TRUNCATED");
            expect(output).toContain("tool-2");
        });
    });
    describe("compactHistoryMediaPayloads", () => {
        it("compacts binary payloads in older entries while preserving recent media", () => {
            const oldImagePart = {
                inlineData: {
                    mimeType: "image/png",
                    data: "old-image-base64",
                },
            };
            const recentImagePart = {
                inlineData: {
                    mimeType: "image/png",
                    data: "recent-image-base64",
                },
            };
            const history = [
                {
                    role: "user",
                    parts: [
                        {
                            functionResponse: {
                                id: "call-old",
                                name: "read_image",
                                response: { output: "Binary content of type image/png." },
                            },
                        },
                        oldImagePart,
                    ],
                },
                {
                    role: "model",
                    parts: [{ text: "Processed the first image." }],
                },
                {
                    role: "user",
                    parts: [
                        {
                            functionResponse: {
                                id: "call-recent",
                                name: "read_image",
                                response: { output: "Binary content of type image/png." },
                            },
                        },
                        recentImagePart,
                    ],
                },
            ];
            const { history: compacted, compactionCount } = compactHistoryMediaPayloads(history, { retainRecentMediaEntries: 1 });
            expect(compactionCount).toBe(1);
            expect(compacted[0]?.parts?.[0]).toEqual(history[0]?.parts?.[0]); // Keep functionResponse
            expect((compacted[0]?.parts?.[1]).text).toContain("Binary payload omitted from earlier history");
            expect((compacted[0]?.parts?.[1]).text).toContain("image/png");
            expect(compacted[2]?.parts?.[1]).toEqual(recentImagePart); // Keep latest media
        });
        it("can compact all media entries when retention is zero", () => {
            const history = [
                {
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: "first",
                            },
                        },
                    ],
                },
                {
                    role: "user",
                    parts: [
                        {
                            fileData: {
                                mimeType: "application/pdf",
                                fileUri: "file:///tmp/doc.pdf",
                            },
                        },
                    ],
                },
            ];
            const { history: compacted, compactionCount } = compactHistoryMediaPayloads(history, { retainRecentMediaEntries: 0 });
            expect(compactionCount).toBe(2);
            expect((compacted[0]?.parts?.[0]).text).toContain("image/jpeg");
            expect((compacted[1]?.parts?.[0]).text).toContain("application/pdf");
        });
    });
});
//# sourceMappingURL=toolOutputCompactor.test.js.map