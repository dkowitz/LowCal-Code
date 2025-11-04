import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { render } from "ink-testing-library";
import { describe, it, expect } from "vitest";
import { RenderInline } from "./InlineMarkdownRenderer.js";
describe("RenderInline", () => {
    it("strips <think> tags and preserves multiline content", () => {
        const multilineThink = "<think>Line one of reasoning\nLine two of reasoning</think>";
        const { lastFrame } = render(_jsx(RenderInline, { text: multilineThink }));
        const output = lastFrame();
        expect(output).not.toContain("<think>");
        expect(output).not.toContain("</think>");
        expect(output).toContain("💭 Line one of reasoning");
        expect(output).toContain("Line two of reasoning");
    });
    it("strips <thinking> tags and preserves multiline content", () => {
        const multilineThinking = "<thinking>Subject line\nMore detailed reasoning here</thinking>";
        const { lastFrame } = render(_jsx(RenderInline, { text: multilineThinking }));
        const output = lastFrame();
        expect(output).not.toContain("<thinking>");
        expect(output).not.toContain("</thinking>");
        expect(output).toContain("💭 Subject line");
    });
    it("omits standalone closing </think> tags", () => {
        const { lastFrame } = render(_jsx(RenderInline, { text: "</think>" }));
        expect(lastFrame()).toBe("");
    });
    it("omits standalone closing </thinking> tags", () => {
        const { lastFrame } = render(_jsx(RenderInline, { text: "</thinking>" }));
        expect(lastFrame()).toBe("");
    });
});
//# sourceMappingURL=InlineMarkdownRenderer.test.js.map