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
export const LiveTerminalPanel = ({ snapshot, height, width, }) => {
    const bodyHeight = Math.max(1, height - 4);
    const bodyWidth = Math.max(10, width - 4);
    const screenLines = React.useMemo(() => {
        const lines = snapshot.screen ? snapshot.screen.split("\n") : [""];
        return lines.slice(Math.max(0, lines.length - bodyHeight));
    }, [snapshot.screen, bodyHeight]);
    const status = snapshot.running ? "running" : "exited";
    const statusColor = snapshot.running ? Colors.AccentGreen : Colors.Gray;
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: snapshot.running ? Colors.AccentCyan : Colors.Gray, paddingX: 1, width: width, height: height, marginBottom: 1, children: [_jsxs(Box, { justifyContent: "space-between", width: "100%", children: [_jsxs(Text, { bold: true, color: Colors.AccentCyan, wrap: "truncate", children: ["Terminal ", snapshot.id, ": ", snapshot.name] }), _jsx(Text, { color: statusColor, children: status })] }), _jsxs(Box, { justifyContent: "space-between", width: "100%", children: [_jsx(Text, { color: Colors.Gray, wrap: "truncate", children: snapshot.cwd }), _jsxs(Text, { color: Colors.Gray, children: [snapshot.cols, "x", snapshot.rows] })] }), _jsx(Box, { flexDirection: "column", height: bodyHeight, width: "100%", children: screenLines.map((line, index) => (_jsx(Text, { wrap: "truncate", children: fitLine(line, bodyWidth) || " " }, `${snapshot.outputVersion}-${index}`))) })] }));
};
//# sourceMappingURL=LiveTerminalPanel.js.map