import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";
/**
 * Visual indicator for llama.cpp inference progress, mirroring LM Studio's
 * "Processing xx%" (context encoding) and "Generating xx tok" (token generation)
 * displays.
 *
 * Shows a filled progress bar for the processing phase and a token counter
 * for the generating phase.
 */
export const LlamaCppInferenceIndicator = ({ progress }) => {
    const { phase, value, total, tokensPerSec, message } = progress;
    // Spinner that advances over time regardless of token count changes
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const [spinnerIndex, setSpinnerIndex] = useState(0);
    // Smooth tokens: interpolate using tokensPerSec between updates (hooks stay at top level)
    const lastValueRef = useRef(value);
    const lastTsRef = useRef(Date.now());
    const displayedValueRef = useRef(value);
    useEffect(() => {
        const id = setInterval(() => setSpinnerIndex((i) => (i + 1) % spinnerFrames.length), 70);
        return () => clearInterval(id);
    }, []);
    useEffect(() => {
        const now = Date.now();
        displayedValueRef.current = value;
        lastValueRef.current = value;
        lastTsRef.current = now;
    }, [value]);
    if (phase === "processing") {
        // Determinate progress bar — shows context encoding percentage
        const pct = Math.min(100, Math.max(0, value));
        const barWidth = 30;
        const filled = Math.round((pct / 100) * barWidth);
        const empty = barWidth - filled;
        return (_jsxs(Box, { flexDirection: "column", alignItems: "center", paddingY: 0, children: [_jsxs(Box, { children: [_jsx(Text, { color: theme.text.secondary, children: "\u2699 " }), _jsxs(Text, { color: theme.text.accent, children: ["Processing ", pct, "%"] }), total && (_jsxs(Text, { color: theme.text.secondary, children: [" (", Math.round((pct / 100) * total), "/", total, " tokens)"] }))] }), _jsxs(Box, { children: [_jsx(Text, { color: theme.ui.symbol, children: "[" }), _jsx(Text, { color: theme.status.success, children: "█".repeat(filled) }), _jsx(Text, { color: theme.text.secondary, children: "░".repeat(empty) }), _jsx(Text, { color: theme.ui.symbol, children: "]" })] }), message && (_jsx(Box, { marginTop: 0, children: _jsx(Text, { color: theme.text.secondary, wrap: "truncate-end", children: message.length > 80 ? message.slice(0, 80) + "…" : message }) }))] }));
    }
    // Generating phase — show cumulative tokens (with smoothing) and a live spinner
    const spinner = spinnerFrames[spinnerIndex];
    let smoothedValue = displayedValueRef.current;
    if (tokensPerSec !== undefined) {
        const now = Date.now();
        const dtSec = Math.max(0, (now - lastTsRef.current) / 1000);
        smoothedValue = Math.max(value, Math.floor(lastValueRef.current + tokensPerSec * dtSec));
    }
    return (_jsxs(Box, { flexDirection: "column", alignItems: "center", paddingY: 0, children: [_jsxs(Box, { children: [_jsx(Text, { color: theme.text.secondary, children: "\uD83D\uDCE4 " }), _jsxs(Text, { color: theme.status.success, children: ["Generating ", smoothedValue, " tok"] }), total && (_jsxs(Text, { color: theme.text.secondary, children: [" / ", total] })), tokensPerSec !== undefined && (_jsxs(Text, { color: theme.text.secondary, children: [" (", tokensPerSec.toFixed(1), " tok/s)"] }))] }), _jsx(Box, { children: _jsx(Text, { color: theme.status.success, children: spinner }) }), message && (_jsx(Box, { marginTop: 0, children: _jsx(Text, { color: theme.text.secondary, wrap: "truncate-end", children: message.length > 80 ? message.slice(0, 80) + "…" : message }) }))] }));
};
//# sourceMappingURL=LlamaCppInferenceIndicator.js.map