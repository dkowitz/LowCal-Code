import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
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
    const [focusedSection, setFocusedSection] = useState("ctx");
    const [samplingFocus, setSamplingFocus] = useState("cachePrompt");
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
    const gpuLayerIndex = Math.max(0, GPU_LAYER_PRESETS.findIndex((p) => p.value === nGpuLayers));
    const kvIndex = Math.max(0, KV_CACHE_TYPES.findIndex((t) => t.value === kvCacheType));
    const [cachePrompt, setCachePrompt] = useState(() => previousSettings?.cachePrompt ?? true);
    const [temperature, setTemperature] = useState(() => previousSettings?.temperature ?? 0.7);
    const [topP, setTopP] = useState(() => previousSettings?.topP ?? 0.95);
    const [repeatPenalty, setRepeatPenalty] = useState(() => previousSettings?.repeatPenalty ?? 1.05);
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
        // Switch focused section
        if (key.name === "tab") {
            setFocusedSection((prev) => {
                if (prev === "ctx")
                    return "gpu";
                if (prev === "gpu")
                    return "kv";
                if (prev === "kv")
                    return "sampling";
                return "ctx";
            });
            return;
        }
        if (key.name === "up" && key.shift) {
            setFocusedSection((prev) => {
                if (prev === "sampling")
                    return "kv";
                if (prev === "kv")
                    return "gpu";
                if (prev === "gpu")
                    return "ctx";
                return "sampling";
            });
            return;
        }
        if (key.name === "down" && key.shift) {
            setFocusedSection((prev) => {
                if (prev === "ctx")
                    return "gpu";
                if (prev === "gpu")
                    return "kv";
                if (prev === "kv")
                    return "sampling";
                return "ctx";
            });
            return;
        }
        // Submit: Space (reliable in all terminals) or Ctrl+Enter / Ctrl+J
        if (key.name === "space" ||
            (key.name === "return" && key.ctrl) ||
            (key.name === "j" && key.ctrl)) {
            onSubmit({
                nCtx,
                nGpuLayers,
                kvCacheType,
                cachePrompt,
                temperature,
                topP,
                repeatPenalty,
            });
            return;
        }
        if (focusedSection === "sampling") {
            if (key.name === "up" || key.name === "down") {
                setSamplingFocus((prev) => {
                    const order = ["cachePrompt", "temperature", "topP", "repeatPenalty"];
                    const idx = order.indexOf(prev);
                    const next = key.name === "up" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
                    return order[next];
                });
                return;
            }
            if (key.name === "left" || key.name === "right") {
                const dir = key.name === "left" ? -1 : 1;
                if (samplingFocus === "cachePrompt") {
                    setCachePrompt((v) => !v);
                    return;
                }
                if (samplingFocus === "temperature") {
                    const next = Math.max(0, Math.min(2, Math.round((temperature + dir * 0.1) * 10) / 10));
                    setTemperature(next);
                    return;
                }
                if (samplingFocus === "topP") {
                    const next = Math.max(0, Math.min(1, Math.round((topP + dir * 0.05) * 100) / 100));
                    setTopP(next);
                    return;
                }
                if (samplingFocus === "repeatPenalty") {
                    const next = Math.max(1, Math.min(2, Math.round((repeatPenalty + dir * 0.05) * 100) / 100));
                    setRepeatPenalty(next);
                    return;
                }
            }
        }
        if (focusedSection === "gpu" && (key.name === "left" || key.name === "right")) {
            const dir = key.name === "left" ? -1 : 1;
            const nextIndex = Math.max(0, Math.min(GPU_LAYER_PRESETS.length - 1, gpuLayerIndex + dir));
            setNGpuLayers(GPU_LAYER_PRESETS[nextIndex].value);
            return;
        }
        if (focusedSection === "kv" && (key.name === "left" || key.name === "right")) {
            const dir = key.name === "left" ? -1 : 1;
            const nextIndex = Math.max(0, Math.min(KV_CACHE_TYPES.length - 1, kvIndex + dir));
            setKvCacheType(KV_CACHE_TYPES[nextIndex].value);
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
    // Build slider bar visual
    const sliderBar = Array.from({ length: ctxSteps }, (_, i) => {
        const step = (i + 1) * CTX_STEP;
        const filled = step <= nCtx;
        return filled ? "█" : "░";
    }).join("");
    // Format model display name from path
    const modelName = modelPath.split("/").pop()?.replace(".gguf", "") ?? "unknown";
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsxs(Text, { bold: true, color: Colors.AccentBlue, children: [modelName, " \u2014 Inference Settings"] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: modelPath }) }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { bold: focusedSection === "ctx", color: focusedSection === "ctx" ? Colors.AccentGreen : Colors.AccentBlue, children: [focusedSection === "ctx" ? "> " : "  ", "Context Length: ", nCtx.toLocaleString(), " tokens"] }), _jsxs(Text, { color: Colors.Gray, children: ["Max from GGUF metadata: ", ctxMax.toLocaleString(), " tokens"] }), _jsxs(Box, { marginTop: 0, children: [_jsx(Text, { color: Colors.Gray, children: '[' }), _jsx(Text, { color: Colors.AccentBlue, children: sliderBar }), _jsx(Text, { color: Colors.Gray, children: ']' })] }), _jsx(Text, { color: Colors.Gray, children: "\u2190 \u2192 to adjust \u00B7 Tab to next section" })] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { bold: focusedSection === "gpu", color: focusedSection === "gpu" ? Colors.AccentGreen : Colors.AccentBlue, children: [focusedSection === "gpu" ? "> " : "  ", "GPU Layers: ", GPU_LAYER_PRESETS[gpuLayerIndex]?.label ?? "Custom"] }), _jsx(Text, { color: Colors.Gray, children: GPU_LAYER_PRESETS[gpuLayerIndex]?.desc ?? "" }), _jsx(Text, { color: Colors.Gray, children: "\u2190 \u2192 change \u00B7 Tab next section" })] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { bold: focusedSection === "kv", color: focusedSection === "kv" ? Colors.AccentGreen : Colors.AccentBlue, children: [focusedSection === "kv" ? "> " : "  ", "KV Cache Quantization: ", KV_CACHE_TYPES[kvIndex]?.label ?? kvCacheType] }), _jsx(Text, { color: Colors.Gray, children: "\u2190 \u2192 change \u00B7 Tab next section" })] }), _jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Text, { bold: focusedSection === "sampling", color: focusedSection === "sampling" ? Colors.AccentGreen : Colors.AccentBlue, children: [focusedSection === "sampling" ? "> " : "  ", "Sampling"] }), _jsxs(Text, { color: samplingFocus === "cachePrompt" ? Colors.AccentGreen : Colors.Foreground, children: [samplingFocus === "cachePrompt" ? "> " : "  ", "Cache prompt: ", cachePrompt ? "On" : "Off"] }), _jsxs(Text, { color: samplingFocus === "temperature" ? Colors.AccentGreen : Colors.Foreground, children: [samplingFocus === "temperature" ? "> " : "  ", "Temperature: ", temperature.toFixed(2)] }), _jsxs(Text, { color: samplingFocus === "topP" ? Colors.AccentGreen : Colors.Foreground, children: [samplingFocus === "topP" ? "> " : "  ", "Top-p: ", topP.toFixed(2)] }), _jsxs(Text, { color: samplingFocus === "repeatPenalty" ? Colors.AccentGreen : Colors.Foreground, children: [samplingFocus === "repeatPenalty" ? "> " : "  ", "Repeat penalty: ", repeatPenalty.toFixed(2)] }), _jsx(Text, { color: Colors.Gray, children: "llama.cpp only. Up/Down moves, Left/Right changes values." })] }), _jsxs(Box, { flexDirection: "column", marginTop: 2, paddingX: 1, children: [_jsx(Text, { bold: true, children: "Summary:" }), _jsxs(Text, { color: Colors.Gray, children: ["Context: ", nCtx.toLocaleString(), " / ", ctxMax.toLocaleString(), " tokens | GPU Layers: ", nGpuLayers === -1 ? "all" : nGpuLayers, " | KV: ", kvCacheType] })] }), _jsxs(Box, { marginTop: 2, flexDirection: "column", children: [_jsx(Text, { color: Colors.AccentBlue, children: "Space to load model, \u2190 \u2192 adjust context" }), _jsx(Text, { color: Colors.Gray, children: "Esc to cancel. Settings are saved for this model." })] })] }));
}
export default LlamaCppModelConfigDialog;
//# sourceMappingURL=LlamaCppModelConfigDialog.js.map