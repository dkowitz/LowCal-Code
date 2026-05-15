import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";
export function LlamaCppSetupPrompt({ prepopulatedModelsDir, prepopulatedPort, onSubmit, onCancel, }) {
    const [modelsDir, setModelsDir] = useState(prepopulatedModelsDir || "");
    const [port, setPort] = useState(prepopulatedPort || "8080");
    const [currentField, setCurrentField] = useState(!prepopulatedModelsDir ? "modelsDir" : "port");
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
            if (currentField === "modelsDir")
                setModelsDir((p) => p + cleanInput);
            else
                setPort((p) => p + cleanInput);
            return;
        }
        if (input.includes("\n") || input.includes("\r")) {
            if (currentField === "modelsDir")
                setCurrentField("port");
            else
                onSubmit(modelsDir.trim(), port.trim());
            return;
        }
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.tab || key.upArrow || key.downArrow) {
            setCurrentField((c) => (c === "modelsDir" ? "port" : "modelsDir"));
            return;
        }
        if (key.backspace || key.delete) {
            if (currentField === "modelsDir")
                setModelsDir((p) => p.slice(0, -1));
            else
                setPort((p) => p.slice(0, -1));
            return;
        }
    });
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentBlue, children: "llama.cpp Setup" }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: ["Configure the path to your GGUF models directory and the server port.", "\n", "The llama-server binary will be searched for on PATH, or you can set", " ", Colors.AccentBlue, "LLAMA_CPP_BINARY", "", " env var."] }) }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 14, children: _jsx(Text, { color: currentField === "modelsDir" ? Colors.AccentBlue : Colors.Gray, children: "Models Directory:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "modelsDir" ? "> " : "  ", modelsDir || " /path/to/your/gguf/models"] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 14, children: _jsx(Text, { color: currentField === "port" ? Colors.AccentBlue : Colors.Gray, children: "Server Port:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "port" ? "> " : "  ", port || "8080"] }) })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to continue, Tab/\u2191\u2193 to navigate, Esc to cancel" }) })] }));
}
export default LlamaCppSetupPrompt;
//# sourceMappingURL=LlamaCppSetupPrompt.js.map