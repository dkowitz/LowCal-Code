import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { Box, Text, useInput } from "ink";
import { MarkdownDisplay } from "../utils/MarkdownDisplay.js";
export const ViewOverlay = ({ item, height, width, scrollOffset, onScroll, onExit, }) => {
    const lines = item.text.split("\n");
    const maxHeight = Math.max(4, height - 3); // reserve space for header
    const visible = lines.slice(scrollOffset, scrollOffset + maxHeight);
    useInput((input, key) => {
        if (key.upArrow || input === "k")
            onScroll("up");
        else if (key.downArrow || input === "j")
            onScroll("down");
        else if (input === "q" || key.escape)
            onExit();
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", width: width, height: Math.min(height, maxHeight + 3), padding: 1, marginBottom: 1, children: [_jsx(Box, { children: _jsxs(Text, { bold: true, children: ["Viewing file content for ", item.filePath, " - ", item.tokenCount ?? "Unknown", " tokens (scroll with \u2191/\u2193 or q to exit)"] }) }), _jsx(Box, { flexDirection: "column", height: maxHeight, children: _jsx(MarkdownDisplay, { text: visible.join("\n"), isPending: false, availableTerminalHeight: maxHeight, terminalWidth: width }) })] }));
};
//# sourceMappingURL=ViewOverlay.js.map