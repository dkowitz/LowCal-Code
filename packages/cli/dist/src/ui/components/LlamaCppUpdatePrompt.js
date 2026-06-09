import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";
/**
 * Interactive prompt shown when a llama.cpp update is available.
 * Lets the user choose: Update Now, Remind Later, or Don't Ask Again.
 */
export function LlamaCppUpdatePrompt({ latestTag, currentTag, backend, assetName, releaseUrl, onAction, }) {
    const options = ["update", "release", "later", "dismiss"];
    const [selected, setSelected] = useState(options.indexOf("later"));
    useInput((input, key) => {
        if (key.upArrow || key.leftArrow) {
            setSelected((s) => (s > 0 ? s - 1 : s));
            return true;
        }
        if (key.downArrow || key.rightArrow) {
            setSelected((s) => (s < options.length - 1 ? s + 1 : s));
            return true;
        }
        if (input.includes("\n") || input.includes("\r")) {
            onAction(options[selected]);
            return true;
        }
        if (key.escape) {
            onAction("later");
            return true;
        }
        // Number shortcuts: 1=update, 2=release notes, 3=later, 4=dismiss
        if (input === "1") {
            onAction("update");
            return true;
        }
        if (input === "2") {
            onAction("release");
            return true;
        }
        if (input === "3") {
            onAction("later");
            return true;
        }
        if (input === "4") {
            onAction("dismiss");
            return true;
        }
        return false;
    });
    const optionLabels = [
        { key: "1", label: "Update Now", color: Colors.AccentGreen },
        { key: "2", label: "View Release Notes", color: Colors.AccentBlue },
        { key: "3", label: "Remind Later", color: Colors.Gray },
        { key: "4", label: "Don't Ask Again", color: Colors.Gray },
    ];
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentYellow, flexDirection: "column", paddingX: 1, paddingY: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentYellow, children: "\uD83D\uDD04 llama.cpp Update Available" }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { color: Colors.Foreground, children: ["A new version of llama.cpp is available:", " ", _jsx(Text, { bold: true, color: Colors.AccentBlue, children: latestTag })] }) }), (backend || currentTag || assetName) && (_jsx(Box, { marginTop: 0.5, children: _jsxs(Text, { color: Colors.Gray, children: [backend ? `Backend: ${backend}` : "", currentTag ? `  Current: ${currentTag}` : "", assetName ? `  Asset: ${assetName}` : ""] }) })), _jsx(Box, { marginTop: 0.5, children: _jsxs(Text, { color: Colors.Gray, wrap: "truncate-end", children: ["View release notes: ", releaseUrl] }) }), _jsx(Box, { flexDirection: "column", marginTop: 1, children: optionLabels.map((opt, i) => (_jsx(Box, { flexDirection: "row", marginBottom: i < optionLabels.length - 1 ? 0.5 : 0, children: _jsxs(Text, { color: selected === i ? opt.color : Colors.Gray, children: [selected === i ? "▸ " : "  ", "[", opt.key, "] ", opt.label] }) }, i))) }), _jsx(Box, { marginTop: 0.5, children: _jsx(Text, { color: Colors.Gray, children: "\u2191\u2193 select \u00B7 Enter confirm \u00B7 Esc skip \u00B7 2 = release notes" }) })] }));
}
export default LlamaCppUpdatePrompt;
//# sourceMappingURL=LlamaCppUpdatePrompt.js.map