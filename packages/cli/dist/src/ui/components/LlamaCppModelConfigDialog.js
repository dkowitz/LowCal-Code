import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { RadioButtonSelect } from "./shared/RadioButtonSelect.js";
const KV_CACHE_TYPES = [
    { value: "none", label: "None (full precision, default)" },
    { value: "f16", label: "f16 (highest precision)" },
    { value: "bf16", label: "bf16 (good balance)" },
    { value: "f8_e4m3", label: "f8_e4m3 (aggressive quantization)" },
    { value: "f8_e5m2", label: "f8_e5m2 (most aggressive)" },
];
/** GPU layer offload presets */
const GPU_LAYER_PRESETS = [
    { value: -1, label: "All layers (GPU only)", desc: "Fastest — requires enough VRAM" },
    { value: 0, label: "CPU only", desc: "Slow — no GPU offloading" },
    { value: 10, label: "10 layers", desc: "Minimal GPU offload" },
    { value: 20, label: "20 layers", desc: "Partial offload" },
    { value: 35, label: "35 layers", desc: "Most layers on GPU" },
    { value: 50, label: "50 layers", desc: "Heavy offload — needs ~10GB VRAM" },
    { value: 80, label: "80 layers", desc: "Nearly full — needs ~16GB VRAM" },
];
/** Context length step size — increments of 1024 tokens */
const CTX_STEP = 1024;
export function LlamaCppModelConfigDialog({ modelPath, maxContextLength = 32768, previousSettings, onSubmit, onCancel, }) {
    // Default to the model's max context length (user always runs at max)
    const [nCtx, setNCtx] = useState(() => previousSettings?.nCtx ?? Math.max(4096, maxContextLength));
    // GPU layers — default to -1 (all layers on GPU) for speed
    const [nGpuLayers, setNGpuLayers] = useState(() => previousSettings?.nGpuLayers ?? -1);
    // KV quant — default to "none" (full precision)
    const [kvCacheType, setKvCacheType] = useState(() => {
        const saved = previousSettings?.kvCacheType;
        if (saved && KV_CACHE_TYPES.some((t) => t.value === saved))
            return saved;
        return "none";
    });
    // Context length slider range
    const ctxMin = CTX_STEP;
    const ctxMax = maxContextLength > 0 ? maxContextLength : 32768;
    const ctxSteps = Math.floor(ctxMax / CTX_STEP);
    const currentStep = Math.min(Math.max(1, Math.round(nCtx / CTX_STEP)), ctxSteps);
    // Custom key handling for context length slider (← →) and submit (Ctrl+Enter).
    // Up/Down are NOT intercepted here — they go to the focused RadioButtonSelect.
    useKeypress((key) => {
        if (key.name === "escape") {
            onCancel();
            return;
        }
        // Submit: Space (reliable in all terminals) or Ctrl+Enter / Ctrl+J
        if (key.name === "space" ||
            (key.name === "return" && key.ctrl) ||
            (key.name === "j" && key.ctrl)) {
            onSubmit({ nCtx, nGpuLayers, kvCacheType });
            return;
        }
        // Left/Right arrows adjust context length only
        if (key.name === "left") {
            const newStep = Math.max(ctxMin / CTX_STEP, currentStep - 1);
            setNCtx(newStep * CTX_STEP);
            return;
        }
        if (key.name === "right") {
            const newStep = Math.min(ctxSteps, currentStep + 1);
            setNCtx(newStep * CTX_STEP);
            return;
        }
    }, { isActive: true });
    // KV quant radio group — only this one gets focus
    const kvItems = KV_CACHE_TYPES.map((t) => ({
        label: t.label,
        value: t.value,
    }));
    const initialKvIndex = Math.max(0, kvItems.findIndex((i) => i.value === kvCacheType));
    // Build slider bar visual
    const sliderBar = Array.from({ length: ctxSteps }, (_, i) => {
        const step = (i + 1) * CTX_STEP;
        const filled = step <= nCtx;
        return filled ? "█" : "░";
    }).join("");
    // Format model display name from path
    const modelName = modelPath.split("/").pop()?.replace(".gguf", "") ?? "unknown";
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsxs(Text, { bold: true, color: Colors.AccentBlue, children: [modelName, " \u2014 Inference Settings"] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: modelPath }) }), _jsxs(Box, { flexDirection: "column", marginTop: 2, children: [_jsxs(Text, { bold: true, children: ["Context Length: ", nCtx.toLocaleString(), " tokens"] }), _jsxs(Text, { color: Colors.Gray, children: ["Max from GGUF metadata: ", ctxMax.toLocaleString(), " tokens (default)"] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: '[' }), _jsx(Text, { color: Colors.AccentBlue, children: sliderBar }), _jsx(Text, { color: Colors.Gray, children: ']' })] }), _jsxs(Text, { color: Colors.Gray, children: ["\u2190 \u2192 to adjust (step: ", CTX_STEP.toLocaleString(), " tokens)"] })] }), _jsxs(Box, { flexDirection: "column", marginTop: 2, children: [_jsxs(Text, { bold: true, children: ["GPU Layers: ", nGpuLayers === -1 ? "All (full offload)" : nGpuLayers === 0 ? "None (CPU only)" : nGpuLayers] }), _jsx(RadioButtonSelect, { items: GPU_LAYER_PRESETS.map((p) => ({
                            label: `${p.label} — ${p.desc}`,
                            value: p.value,
                        })), initialIndex: Math.max(0, GPU_LAYER_PRESETS.findIndex((p) => p.value === nGpuLayers)), onSelect: (value) => setNGpuLayers(value), isFocused: true })] }), _jsxs(Box, { flexDirection: "column", marginTop: 2, children: [_jsx(Text, { bold: true, children: "KV Cache Quantization:" }), _jsx(RadioButtonSelect, { items: kvItems, initialIndex: initialKvIndex, onSelect: (value) => setKvCacheType(value) })] }), _jsxs(Box, { flexDirection: "column", marginTop: 2, paddingX: 1, children: [_jsx(Text, { bold: true, children: "Summary:" }), _jsxs(Text, { color: Colors.Gray, children: ["Context: ", nCtx.toLocaleString(), " / ", ctxMax.toLocaleString(), " tokens | GPU Layers: ", nGpuLayers === -1 ? "all" : nGpuLayers, " | KV: ", kvCacheType] })] }), _jsxs(Box, { marginTop: 2, flexDirection: "column", children: [_jsx(Text, { color: Colors.AccentBlue, children: "Space to load model, \u2190 \u2192 adjust context" }), _jsx(Text, { color: Colors.Gray, children: "Esc to cancel. Settings are saved for this model." })] })] }));
}
export default LlamaCppModelConfigDialog;
//# sourceMappingURL=LlamaCppModelConfigDialog.js.map