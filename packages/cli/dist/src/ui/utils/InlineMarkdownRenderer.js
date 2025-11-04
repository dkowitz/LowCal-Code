import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { Text } from "ink";
import { Colors } from "../colors.js";
import stringWidth from "string-width";
// Constants for Markdown parsing
const BOLD_MARKER_LENGTH = 2; // For "**"
const ITALIC_MARKER_LENGTH = 1; // For "*" or "_"
const STRIKETHROUGH_MARKER_LENGTH = 2; // For "~~"
const INLINE_CODE_MARKER_LENGTH = 1; // For "`"
const UNDERLINE_TAG_START_LENGTH = 3; // For "<u>"
const UNDERLINE_TAG_END_LENGTH = 4; // For "</u>"
// Added support for <think>/<thinking> tags – treated as italic without showing the tags
const THINK_START_PLACEHOLDER = "\u0000";
const THINK_END_PLACEHOLDER = "\u0001";
function normalizeThinkTags(value) {
    return value
        .replace(/<thinking>/g, THINK_START_PLACEHOLDER)
        .replace(/<\/thinking>/g, THINK_END_PLACEHOLDER)
        .replace(/<think>/g, THINK_START_PLACEHOLDER)
        .replace(/<\/think>/g, THINK_END_PLACEHOLDER);
}
function stripThinkPlaceholders(value) {
    return value
        .replaceAll(THINK_START_PLACEHOLDER, "")
        .replaceAll(THINK_END_PLACEHOLDER, "");
}
const RenderInlineInternal = ({ text }) => {
    // Early return for plain text without markdown or URLs
    if (!/[*_~`<[https?:]/.test(text)) {
        return _jsx(Text, { children: text });
    }
    const normalizedText = normalizeThinkTags(text);
    const nodes = [];
    let lastIndex = 0;
    const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|\[.*?\]\(.*?\)|`+.+?`+|<u>.*?<\/u>|[\u0000][\s\S]*?[\u0001]|https?:\/\/\S+)/g;
    let match;
    while ((match = inlineRegex.exec(normalizedText)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(_jsx(Text, { children: stripThinkPlaceholders(normalizedText.slice(lastIndex, match.index)) }, `t-${lastIndex}`));
        }
        const fullMatch = match[0];
        let renderedNode = null;
        const key = `m-${match.index}`;
        try {
            if (fullMatch.startsWith("**") &&
                fullMatch.endsWith("**") &&
                fullMatch.length > BOLD_MARKER_LENGTH * 2) {
                renderedNode = (_jsx(Text, { bold: true, children: fullMatch.slice(BOLD_MARKER_LENGTH, -BOLD_MARKER_LENGTH) }, key));
            }
            else if (fullMatch.length > ITALIC_MARKER_LENGTH * 2 &&
                ((fullMatch.startsWith("*") && fullMatch.endsWith("*")) ||
                    (fullMatch.startsWith("_") && fullMatch.endsWith("_"))) &&
                !/\w/.test(text.substring(match.index - 1, match.index)) &&
                !/\w/.test(text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 1)) &&
                !/\S[./\\]/.test(text.substring(match.index - 2, match.index)) &&
                !/[./\\]\S/.test(text.substring(inlineRegex.lastIndex, inlineRegex.lastIndex + 2))) {
                renderedNode = (_jsx(Text, { italic: true, children: fullMatch.slice(ITALIC_MARKER_LENGTH, -ITALIC_MARKER_LENGTH) }, key));
            }
            else if (fullMatch.startsWith("~~") &&
                fullMatch.endsWith("~~") &&
                fullMatch.length > STRIKETHROUGH_MARKER_LENGTH * 2) {
                renderedNode = (_jsx(Text, { strikethrough: true, children: fullMatch.slice(STRIKETHROUGH_MARKER_LENGTH, -STRIKETHROUGH_MARKER_LENGTH) }, key));
            }
            else if (fullMatch.startsWith("`") &&
                fullMatch.endsWith("`") &&
                fullMatch.length > INLINE_CODE_MARKER_LENGTH) {
                const codeMatch = fullMatch.match(/^(`+)(.+?)\1$/s);
                if (codeMatch && codeMatch[2]) {
                    renderedNode = (_jsx(Text, { color: Colors.AccentPurple, children: codeMatch[2] }, key));
                }
            }
            else if (fullMatch.startsWith("[") &&
                fullMatch.includes("](") &&
                fullMatch.endsWith(")")) {
                const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/);
                if (linkMatch) {
                    const linkText = linkMatch[1];
                    const url = linkMatch[2];
                    renderedNode = (_jsxs(Text, { children: [linkText, _jsxs(Text, { color: Colors.AccentBlue, children: [" (", url, ")"] })] }, key));
                }
            }
            else if (fullMatch.startsWith("<u>") &&
                fullMatch.endsWith("</u>") &&
                fullMatch.length >
                    UNDERLINE_TAG_START_LENGTH + UNDERLINE_TAG_END_LENGTH - 1 // -1 because length is compared to combined length of start and end tags
            ) {
                renderedNode = (_jsx(Text, { underline: true, children: fullMatch.slice(UNDERLINE_TAG_START_LENGTH, -UNDERLINE_TAG_END_LENGTH) }, key));
            }
            else if (fullMatch.startsWith(THINK_START_PLACEHOLDER) &&
                fullMatch.endsWith(THINK_END_PLACEHOLDER)) {
                const innerText = stripThinkPlaceholders(fullMatch.slice(THINK_START_PLACEHOLDER.length, -THINK_END_PLACEHOLDER.length));
                const formattedText = innerText.trim().length > 0 ? innerText : innerText.trimEnd();
                renderedNode = (_jsxs(Text, { children: [_jsx(Text, { color: Colors.Gray, children: "\uD83D\uDCAD " }), _jsx(Text, { italic: true, color: Colors.Gray, children: formattedText })] }, key));
            }
            else if (fullMatch.match(/^https?:\/\//)) {
                renderedNode = (_jsx(Text, { color: Colors.AccentBlue, children: fullMatch }, key));
            }
        }
        catch (e) {
            console.error("Error parsing inline markdown part:", fullMatch, e);
            renderedNode = null;
        }
        nodes.push(renderedNode ?? (_jsx(Text, { children: stripThinkPlaceholders(fullMatch) }, key)));
        lastIndex = inlineRegex.lastIndex;
    }
    if (lastIndex < normalizedText.length) {
        nodes.push(_jsx(Text, { children: stripThinkPlaceholders(normalizedText.slice(lastIndex)) }, `t-${lastIndex}`));
    }
    return _jsx(_Fragment, { children: nodes.filter((node) => node !== null) });
};
export const RenderInline = React.memo(RenderInlineInternal);
/**
 * Utility function to get the plain text length of a string with markdown formatting
 * This is useful for calculating column widths in tables
 */
export const getPlainTextLength = (text) => {
    const cleanText = text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/_(.*?)_/g, "$1")
        .replace(/~~(.*?)~~/g, "$1")
        .replace(/`(.*?)`/g, "$1")
        .replace(/<u>(.*?)<\/u>/g, "$1")
        .replace(/<think>([\s\S]*?)<\/think>/g, "$1")
        .replace(/<thinking>([\s\S]*?)<\/thinking>/g, "$1")
        .replace(/<\/?think>/g, "")
        .replace(/<\/?thinking>/g, "")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1");
    return stringWidth(cleanText);
};
//# sourceMappingURL=InlineMarkdownRenderer.js.map