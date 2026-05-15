import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";
/** Animated progress bar for llama.cpp model loading with self-updating timer. */
export const LlamaCppLoadingBar = ({ phase, elapsedMs: callbackElapsedMs, message, }) => {
    // Local timer that updates every 200ms between callbacks for smooth animation
    const [localElapsed, setLocalElapsed] = useState(callbackElapsedMs);
    useEffect(() => {
        // Reset local timer when callback gives new value
        setLocalElapsed(callbackElapsedMs);
    }, [callbackElapsedMs]);
    useEffect(() => {
        // If server is already healthy, don't animate
        if (phase === "healthy")
            return;
        const timer = setInterval(() => {
            setLocalElapsed((prev) => prev + 200);
        }, 200);
        return () => clearInterval(timer);
    }, [phase]);
    // Indeterminate progress — pulsing bar
    const barWidth = 30;
    const filled = Math.min(barWidth, Math.floor((localElapsed % 10000) / 10000 * barWidth) + 1);
    const empty = barWidth - filled;
    const phaseLabel = phase === "spawning"
        ? "Starting server"
        : phase === "healthy"
            ? "Model ready"
            : "Loading model";
    const elapsedSec = (localElapsed / 1000).toFixed(1);
    return (_jsxs(Box, { flexDirection: "column", alignItems: "center", paddingY: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: theme.text.secondary, children: "\u23F3 " }), _jsxs(Text, { color: theme.text.accent, children: [phaseLabel, "..."] }), _jsxs(Text, { color: theme.text.secondary, children: [" (", elapsedSec, "s)"] })] }), _jsxs(Box, { children: [_jsx(Text, { color: theme.ui.symbol, children: "[" }), _jsx(Text, { color: theme.status.success, children: "█".repeat(filled) }), _jsx(Text, { color: theme.text.secondary, children: "░".repeat(empty) }), _jsx(Text, { color: theme.ui.symbol, children: "]" })] }), message && message !== "Loading model..." && (_jsx(Box, { marginTop: 0, children: _jsx(Text, { color: theme.text.secondary, wrap: "truncate-end", children: message.length > 80 ? message.slice(0, 80) + "…" : message }) }))] }));
};
//# sourceMappingURL=LlamaCppLoadingBar.js.map