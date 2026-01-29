import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";
export function GeminiKeyPrompt({ onSubmit, onCancel, prepopulatedApiKey, }) {
    const [apiKey, setApiKey] = useState(prepopulatedApiKey || "");
    useInput((input, key) => {
        let cleanInput = (input || "")
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
            .replace(/\[200~/g, "")
            .replace(/\[201~/g, "")
            .replace(/^\[|~$/g, "");
        cleanInput = cleanInput
            .split("")
            .filter((ch) => ch.charCodeAt(0) >= 32)
            .join("");
        if (cleanInput.length > 0) {
            setApiKey((prev) => prev + cleanInput);
            return;
        }
        if (input.includes("\n") || input.includes("\r")) {
            if (apiKey.trim()) {
                onSubmit(apiKey.trim());
            }
            return;
        }
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.backspace || key.delete) {
            setApiKey((prev) => prev.slice(0, -1));
            return;
        }
    });
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentBlue, children: "Google Gemini API Key" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "Enter your Gemini API key to continue." }) }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 12, children: _jsx(Text, { color: Colors.AccentBlue, children: "API Key:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: ["> ", apiKey || " "] }) })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to continue, Esc to cancel" }) })] }));
}
//# sourceMappingURL=GeminiKeyPrompt.js.map