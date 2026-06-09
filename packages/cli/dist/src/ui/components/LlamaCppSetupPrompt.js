import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { LLAMA_CPP_BACKENDS, normalizeLlamaCppBackend, } from "@qwen-code/qwen-code-core";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";
const BACKEND_LABELS = {
    auto: "Auto",
    vulkan: "Vulkan",
    rocm: "ROCm",
    cpu: "CPU",
    custom: "Custom binary",
};
const FIELDS = ["modelsDir", "port", "backend", "binaryPath"];
function nextField(field) {
    const index = FIELDS.indexOf(field);
    return FIELDS[(index + 1) % FIELDS.length];
}
function previousField(field) {
    const index = FIELDS.indexOf(field);
    return FIELDS[(index + FIELDS.length - 1) % FIELDS.length];
}
export function LlamaCppSetupPrompt({ prepopulatedModelsDir, prepopulatedPort, prepopulatedBackend, prepopulatedBinaryPath, onSubmit, onCancel, }) {
    const [modelsDir, setModelsDir] = useState(prepopulatedModelsDir || "");
    const [port, setPort] = useState(prepopulatedPort || "8080");
    const [backend, setBackend] = useState(normalizeLlamaCppBackend(prepopulatedBackend || process.env["LLAMA_CPP_BACKEND"]));
    const [binaryPath, setBinaryPath] = useState(prepopulatedBinaryPath || process.env["LLAMA_CPP_BINARY"] || "");
    const [currentField, setCurrentField] = useState(!prepopulatedModelsDir ? "modelsDir" : "port");
    const cycleBackend = (direction) => {
        setBackend((current) => {
            const index = LLAMA_CPP_BACKENDS.indexOf(current);
            const nextIndex = (index + direction + LLAMA_CPP_BACKENDS.length) %
                LLAMA_CPP_BACKENDS.length;
            return LLAMA_CPP_BACKENDS[nextIndex];
        });
    };
    useInput((input, key) => {
        let cleanInput = (input || "")
            // eslint-disable-next-line no-control-regex
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
            .replace(/\[200~/g, "")
            .replace(/\[201~/g, "")
            .replace(/^\[|~$/g, "");
        cleanInput = cleanInput
            .split("")
            .filter((ch) => ch.charCodeAt(0) >= 32)
            .join("");
        if (cleanInput.length > 0) {
            if (currentField === "modelsDir") {
                setModelsDir((p) => p + cleanInput);
            }
            else if (currentField === "port") {
                setPort((p) => p + cleanInput);
            }
            else if (currentField === "binaryPath") {
                setBinaryPath((p) => p + cleanInput);
            }
            return;
        }
        if (input.includes("\n") || input.includes("\r")) {
            if (currentField === "binaryPath") {
                onSubmit(modelsDir.trim(), port.trim(), backend, binaryPath.trim());
            }
            else {
                setCurrentField(nextField(currentField));
            }
            return;
        }
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.tab || key.upArrow || key.downArrow) {
            setCurrentField((c) => (key.upArrow ? previousField(c) : nextField(c)));
            return;
        }
        if (currentField === "backend" && (key.leftArrow || key.rightArrow)) {
            cycleBackend(key.leftArrow ? -1 : 1);
            return;
        }
        if (key.backspace || key.delete) {
            if (currentField === "modelsDir") {
                setModelsDir((p) => p.slice(0, -1));
            }
            else if (currentField === "port") {
                setPort((p) => p.slice(0, -1));
            }
            else if (currentField === "binaryPath") {
                setBinaryPath((p) => p.slice(0, -1));
            }
            return;
        }
    });
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentBlue, children: "llama.cpp Setup" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "Configure your GGUF models directory, server port, and llama.cpp backend." }) }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 17, children: _jsx(Text, { color: currentField === "modelsDir" ? Colors.AccentBlue : Colors.Gray, children: "Models Directory:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "modelsDir" ? "> " : "  ", modelsDir || " /path/to/your/gguf/models"] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 17, children: _jsx(Text, { color: currentField === "port" ? Colors.AccentBlue : Colors.Gray, children: "Server Port:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "port" ? "> " : "  ", port || "8080"] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 17, children: _jsx(Text, { color: currentField === "backend" ? Colors.AccentBlue : Colors.Gray, children: "Backend:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "backend" ? "> " : "  ", BACKEND_LABELS[backend], " (", backend, ")"] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 17, children: _jsx(Text, { color: currentField === "binaryPath" ? Colors.AccentBlue : Colors.Gray, children: "Custom Binary:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "binaryPath" ? "> " : "  ", binaryPath || " bundled backend binary"] }) })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "ROCm uses upstream ubuntu-rocm-7.2 x64 builds. Custom sets LLAMA_CPP_BINARY." }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Enter to continue, Tab/\u2191\u2193 to navigate, \u2190\u2192 to change backend, Esc to cancel" }) })] }));
}
export default LlamaCppSetupPrompt;
//# sourceMappingURL=LlamaCppSetupPrompt.js.map