import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
function fitLine(line, width) {
    if (line.length <= width) {
        return line;
    }
    return line.slice(0, Math.max(0, width - 1));
}
/**
 * Layout is strictly fixed-height to prevent Ink re-render artifacts:
 *   Row 1: Title bar (Terminal id: name ............ running)
 *   Row 2: Info bar  (cwd ......................... 80x24)
 *   Rows 3..N: Terminal body (fixed count, padded if short)
 *
 * Scroll state is NOT shown inside the panel — it lives in the conversation
 * status bar below. This keeps the terminal looking like a real terminal window.
 */
export const HEADER_ROWS = 2;
export const LiveTerminalPanel = ({ snapshot, height, width, scrollOffset, }) => {
    const bodyHeight = Math.max(1, height - HEADER_ROWS);
    const bodyWidth = Math.max(10, width - 4);
    // Parse all lines from the terminal screen buffer.
    const allLines = React.useMemo(() => {
        return snapshot.screen ? snapshot.screen.split("\n") : [""];
    }, [snapshot.screen]);
    const totalLines = allLines.length;
    // Clamp scrollOffset to valid range: 0 (bottom) .. maxScrollUp
    const maxScrollUp = Math.max(0, totalLines - bodyHeight);
    const clampedOffset = Math.min(scrollOffset, maxScrollUp);
    // Compute visible window: slice from (totalLines - bodyHeight - offset) to end of that window.
    const startLine = Math.max(0, totalLines - bodyHeight - clampedOffset);
    const visibleLines = React.useMemo(() => {
        const sliced = allLines.slice(startLine, startLine + bodyHeight);
        // Pad with empty lines if content is shorter than viewport — keeps Ink box stable.
        while (sliced.length < bodyHeight) {
            sliced.push(" ");
        }
        return sliced;
    }, [allLines, startLine, bodyHeight]);
    const statusColor = snapshot.running ? Colors.AccentGreen : Colors.Gray;
    // Show a visible cursor block at the end of the last line for running PTY sessions in follow mode.
    const showCursor = snapshot.running &&
        snapshot.backend === "pty" &&
        clampedOffset === 0;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: snapshot.running ? Colors.AccentCyan : Colors.Gray, paddingX: 1, width: width, height: height, flexShrink: 0, children: [_jsxs(Box, { justifyContent: "space-between", width: "100%", children: [_jsxs(Text, { bold: true, color: Colors.AccentCyan, wrap: "truncate", children: ["Terminal ", snapshot.id, ": ", snapshot.name] }), _jsx(Text, { color: statusColor, children: snapshot.running ? "running" : "exited" })] }), _jsxs(Box, { justifyContent: "space-between", width: "100%", children: [_jsx(Text, { color: Colors.Gray, wrap: "truncate", children: snapshot.cwd }), _jsxs(Text, { color: Colors.Gray, children: [snapshot.cols, "x", snapshot.rows] })] }), _jsx(Box, { flexDirection: "column", height: bodyHeight, width: "100%", children: visibleLines.map((line, index) => {
                    const isLastLine = index === visibleLines.length - 1;
                    if (showCursor && isLastLine) {
                        return (_jsxs(Text, { wrap: "truncate", children: [fitLine(line, bodyWidth), _jsx(Text, { color: Colors.AccentCyan, bold: true, children: "\u2588" })] }, `${snapshot.outputVersion}-${index}`));
                    }
                    return (_jsx(Text, { wrap: "truncate", children: fitLine(line, bodyWidth) || " " }, `${snapshot.outputVersion}-${index}`));
                }) })] }));
};
//# sourceMappingURL=LiveTerminalPanel.js.map