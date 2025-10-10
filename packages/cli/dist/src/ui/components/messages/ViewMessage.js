import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { Box, Text, useInput } from "ink";
import { MarkdownDisplay } from "../../utils/MarkdownDisplay.js";
export const ViewMessage = ({ text, filePath, tokenCount, onExit, isActive, scrollOffset, maxHeight, onScroll, terminalWidth, }) => {
    useInput((input, key) => {
        if (!isActive) {
            return;
        }
        if (key.upArrow || input === "k") {
            onScroll("up");
        }
        else if (key.downArrow || input === "j") {
            onScroll("down");
        }
        else if (input === "q" || key.escape) {
            onExit();
        }
    }, { isActive });
    const lines = text.split("\n");
    const visibleLines = lines.slice(scrollOffset, scrollOffset + maxHeight);
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "single", children: [_jsxs(Text, { bold: true, children: ["Viewing file content for ", filePath, " - ", tokenCount ?? "Unknown", " tokens (scroll with \u2191/\u2193 or q to exit)"] }), _jsx(Box, { flexDirection: "column", height: maxHeight, children: _jsx(MarkdownDisplay, { text: visibleLines.join("\n"), isPending: false, availableTerminalHeight: maxHeight, terminalWidth: (terminalWidth ?? Math.max(80, filePath.length)) }) })] }));
};
//# sourceMappingURL=ViewMessage.js.map