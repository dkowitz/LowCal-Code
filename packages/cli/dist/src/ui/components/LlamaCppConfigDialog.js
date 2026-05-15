import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { RadioButtonSelect } from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";
/** Built-in presets */
export const LLAMA_CPP_PRESETS = [
    {
        name: "balanced",
        description: "Good defaults for most GPU setups (full offload, 8K ctx)",
        nGpuLayers: -1,
        nCtx: 8192,
        nThreads: 4,
        nBatch: 512,
        flashAttn: true,
    },
    {
        name: "max-quality",
        description: "Max context (32K), full GPU offload, conservative sampling",
        nGpuLayers: -1,
        nCtx: 32768,
        nThreads: 4,
        nBatch: 512,
        flashAttn: true,
    },
    {
        name: "speed",
        description: "Smaller context (4K), optimized for fast responses",
        nGpuLayers: -1,
        nCtx: 4096,
        nThreads: 8,
        nBatch: 2048,
        flashAttn: true,
    },
    {
        name: "cpu-only",
        description: "CPU inference only (no GPU), auto thread count",
        nGpuLayers: 0,
        nCtx: 8192,
        nThreads: undefined, // let OS decide
        nBatch: 512,
    },
    {
        name: "low-ram",
        description: "Minimal memory usage (2K ctx, small batch)",
        nGpuLayers: -1,
        nCtx: 2048,
        nThreads: 2,
        nBatch: 256,
    },
];
export function LlamaCppConfigDialog({ currentPreset, onSubmit, onCancel, }) {
    const [selectedName] = useState(currentPreset || "balanced");
    useKeypress((key) => {
        if (key.name === "escape") {
            onCancel();
        }
    }, { isActive: true });
    const items = LLAMA_CPP_PRESETS.map((p) => ({
        label: `${p.name} — ${p.description}`,
        value: p.name,
    }));
    const initialIndex = Math.max(0, items.findIndex((i) => i.value === selectedName));
    const handleSelect = (name) => {
        const preset = LLAMA_CPP_PRESETS.find((p) => p.name === name);
        if (preset) {
            onSubmit(preset);
        }
    };
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentBlue, children: "llama.cpp Inference Preset" }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: ["Choose a preset for server startup parameters. You can customize", " ", " ", "these later via settings.json under", " ", Colors.AccentBlue, "security.auth.providers.llamacpp.preset", "", "."] }) }), _jsx(Box, { marginTop: 1, children: _jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: handleSelect, isFocused: true }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to confirm, Esc to cancel" }) })] }));
}
export default LlamaCppConfigDialog;
//# sourceMappingURL=LlamaCppConfigDialog.js.map