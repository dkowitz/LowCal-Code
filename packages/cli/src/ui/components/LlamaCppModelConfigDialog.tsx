/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";

/**
 * Per-model llama.cpp inference settings.
 */
export interface LlamaCppModelSettings {
  /** Context length in tokens (max = GGUF file's context_length) */
  nCtx: number;
  /** Number of GPU layers to offload (-1 = all, 0 = CPU only) */
  nGpuLayers: number;
  /** KV cache quantization type — "none" means no quantization (full precision) */
  kvCacheType: KvCacheQuantType;
  /** Enable llama.cpp prompt/KV cache reuse across requests. */
  cachePrompt: boolean;
  /** Sampling temperature. */
  temperature: number;
  /** Nucleus sampling top-p. */
  topP: number;
  /** Repetition penalty. */
  repeatPenalty: number;
  /** Speculative decoding draft n-max (MTP). Only used for MTP-tagged models. */
  specDraftNMax?: number;
}

/** Supported KV cache quantization types (llama.cpp --kv-cache-type) */
export type KvCacheQuantType = "none" | "f16" | "bf16" | "f8_e4m3" | "f8_e5m2";

const KV_CACHE_TYPES: Array<{ value: KvCacheQuantType; label: string }> = [
  { value: "none", label: "None (full precision, default)" },
  { value: "f16", label: "f16 (highest precision)" },
  { value: "bf16", label: "bf16 (good balance)" },
  { value: "f8_e4m3", label: "f8_e4m3 (aggressive quantization)" },
  { value: "f8_e5m2", label: "f8_e5m2 (most aggressive)" },
];

/** GPU layer offload presets */
const GPU_LAYER_PRESETS: Array<{ value: number; label: string; desc: string }> = [
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

interface LlamaCppModelConfigDialogProps {
  /** Model path (full path to GGUF file) */
  modelPath: string;
  /** Max context length from GGUF metadata (undefined if unreadable) */
  maxContextLength?: number;
  /** Previously saved settings for this model (if any) */
  previousSettings?: Partial<LlamaCppModelSettings>;
  onSubmit: (settings: LlamaCppModelSettings) => void;
  onCancel: () => void;
}

export function LlamaCppModelConfigDialog({
  modelPath,
  maxContextLength = 32768,
  previousSettings,
  onSubmit,
  onCancel,
}: LlamaCppModelConfigDialogProps): React.JSX.Element {
  const [focusedSection, setFocusedSection] = useState<"ctx" | "gpu" | "kv" | "sampling">("ctx");
  type SamplingField = "cachePrompt" | "temperature" | "topP" | "repeatPenalty" | "specDraftNMax";
  const [samplingFocus, setSamplingFocus] = useState<SamplingField>("cachePrompt");
  // Default to the model's max context length (user always runs at max)
  const [nCtx, setNCtx] = useState<number>(
    () => previousSettings?.nCtx ?? Math.max(4096, maxContextLength),
  );

  // GPU layers — default to -1 (all layers on GPU) for speed
  const [nGpuLayers, setNGpuLayers] = useState<number>(
    () => previousSettings?.nGpuLayers ?? -1,
  );

  // KV quant — default to "none" (full precision)
  const [kvCacheType, setKvCacheType] = useState<KvCacheQuantType>(
    () => {
      const saved = previousSettings?.kvCacheType;
      if (saved && KV_CACHE_TYPES.some((t) => t.value === saved)) return saved;
      return "none";
    },
  );

  const gpuLayerIndex = Math.max(0, GPU_LAYER_PRESETS.findIndex((p) => p.value === nGpuLayers));
  const kvIndex = Math.max(0, KV_CACHE_TYPES.findIndex((t) => t.value === kvCacheType));

  const [cachePrompt, setCachePrompt] = useState<boolean>(
    () => previousSettings?.cachePrompt ?? true,
  );
  const [temperature, setTemperature] = useState<number>(
    () => previousSettings?.temperature ?? 0.7,
  );
  const [topP, setTopP] = useState<number>(
    () => previousSettings?.topP ?? 0.95,
  );
  const [repeatPenalty, setRepeatPenalty] = useState<number>(
    () => previousSettings?.repeatPenalty ?? 1.05,
  );

  const isMtpModel = modelPath.toLowerCase().includes("mtp");
  const [specDraftNMax, setSpecDraftNMax] = useState<number>(
    () => previousSettings?.specDraftNMax ?? 4,
  );

  // Context length slider range
  const ctxMin = CTX_STEP;
  const ctxMax = maxContextLength > 0 ? maxContextLength : 32768;
  const ctxSteps = Math.floor(ctxMax / CTX_STEP);
  const currentStep = Math.min(Math.max(1, Math.round(nCtx / CTX_STEP)), ctxSteps);

  // Custom key handling for context length slider (← →) and submit (Ctrl+Enter).
  // Up/Down are NOT intercepted here — they go to the focused RadioButtonSelect.
  useKeypress(
    (key) => {
      if (key.name === "escape") {
        onCancel();
        return;
      }

      // Switch focused section
      if (key.name === "tab") {
        setFocusedSection((prev) => {
          if (prev === "ctx") return "gpu";
          if (prev === "gpu") return "kv";
          if (prev === "kv") return "sampling";
          return "ctx";
        });
        return;
      }
      if (key.name === "up" && key.shift) {
        setFocusedSection((prev) => {
          if (prev === "sampling") return "kv";
          if (prev === "kv") return "gpu";
          if (prev === "gpu") return "ctx";
          return "sampling";
        });
        return;
      }
      if (key.name === "down" && key.shift) {
        setFocusedSection((prev) => {
          if (prev === "ctx") return "gpu";
          if (prev === "gpu") return "kv";
          if (prev === "kv") return "sampling";
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
          specDraftNMax: isMtpModel ? specDraftNMax : undefined,
        });
        return;
      }

      if (focusedSection === "sampling") {
        if (key.name === "up" || key.name === "down") {
          setSamplingFocus((prev) => {
            const order: Array<typeof samplingFocus> = isMtpModel
              ? ["cachePrompt", "temperature", "topP", "repeatPenalty", "specDraftNMax"]
              : ["cachePrompt", "temperature", "topP", "repeatPenalty"];
            const idx = order.indexOf(prev);
            const next = key.name === "up" ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
            return order[next]!;
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
          if (isMtpModel && samplingFocus === "specDraftNMax") {
            const next = Math.max(1, Math.min(16, specDraftNMax + dir));
            setSpecDraftNMax(next);
            return;
          }
        }
      }

      if (focusedSection === "gpu" && (key.name === "left" || key.name === "right")) {
        const dir = key.name === "left" ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(GPU_LAYER_PRESETS.length - 1, gpuLayerIndex + dir));
        setNGpuLayers(GPU_LAYER_PRESETS[nextIndex]!.value);
        return;
      }

      if (focusedSection === "kv" && (key.name === "left" || key.name === "right")) {
        const dir = key.name === "left" ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(KV_CACHE_TYPES.length - 1, kvIndex + dir));
        setKvCacheType(KV_CACHE_TYPES[nextIndex]!.value);
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

      if (isMtpModel && samplingFocus === "specDraftNMax") {
        if (key.name === "left") {
          setSpecDraftNMax((v) => Math.max(1, v - 1));
          return;
        }
        if (key.name === "right") {
          setSpecDraftNMax((v) => Math.min(16, v + 1));
          return;
        }
      }
    },
    { isActive: true },
  );

  // Build slider bar visual
  const sliderBar = Array.from({ length: ctxSteps }, (_, i) => {
    const step = (i + 1) * CTX_STEP;
    const filled = step <= nCtx;
    return filled ? "█" : "░";
  }).join("");

  // Format model display name from path
  const modelName = modelPath.split("/").pop()?.replace(".gguf", "") ?? "unknown";

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        {modelName} — Inference Settings
      </Text>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          {modelPath}
        </Text>
      </Box>

      {/* Context Length Slider */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusedSection === "ctx"} color={focusedSection === "ctx" ? Colors.AccentGreen : Colors.AccentBlue}>
          {focusedSection === "ctx" ? "> " : "  "}Context Length: {nCtx.toLocaleString()} tokens
        </Text>
        <Text color={Colors.Gray}>
          Max from GGUF metadata: {ctxMax.toLocaleString()} tokens
        </Text>
        <Box marginTop={0}>
          <Text color={Colors.Gray}>{'['}</Text>
          <Text color={Colors.AccentBlue}>{sliderBar}</Text>
          <Text color={Colors.Gray}>{']'}</Text>
        </Box>
        <Text color={Colors.Gray}>
          ← → to adjust · Tab to next section
        </Text>
      </Box>

      {/* GPU Layers */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusedSection === "gpu"} color={focusedSection === "gpu" ? Colors.AccentGreen : Colors.AccentBlue}>
          {focusedSection === "gpu" ? "> " : "  "}GPU Layers: {GPU_LAYER_PRESETS[gpuLayerIndex]?.label ?? "Custom"}
        </Text>
        <Text color={Colors.Gray}>
          {GPU_LAYER_PRESETS[gpuLayerIndex]?.desc ?? ""}
        </Text>
        <Text color={Colors.Gray}>← → change · Tab next section</Text>
      </Box>

      {/* KV Cache Quantization */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusedSection === "kv"} color={focusedSection === "kv" ? Colors.AccentGreen : Colors.AccentBlue}>
          {focusedSection === "kv" ? "> " : "  "}KV Cache Quantization: {KV_CACHE_TYPES[kvIndex]?.label ?? kvCacheType}
        </Text>
        <Text color={Colors.Gray}>← → change · Tab next section</Text>
      </Box>

      {/* Sampling */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusedSection === "sampling"} color={focusedSection === "sampling" ? Colors.AccentGreen : Colors.AccentBlue}>
          {focusedSection === "sampling" ? "> " : "  "}Sampling
        </Text>
        <Text color={samplingFocus === "cachePrompt" ? Colors.AccentGreen : Colors.Foreground}>
          {samplingFocus === "cachePrompt" ? "> " : "  "}Cache prompt: {cachePrompt ? "On" : "Off"}
        </Text>
        <Text color={samplingFocus === "temperature" ? Colors.AccentGreen : Colors.Foreground}>
          {samplingFocus === "temperature" ? "> " : "  "}Temperature: {temperature.toFixed(2)}
        </Text>
        <Text color={samplingFocus === "topP" ? Colors.AccentGreen : Colors.Foreground}>
          {samplingFocus === "topP" ? "> " : "  "}Top-p: {topP.toFixed(2)}
        </Text>
        <Text color={samplingFocus === "repeatPenalty" ? Colors.AccentGreen : Colors.Foreground}>
          {samplingFocus === "repeatPenalty" ? "> " : "  "}Repeat penalty: {repeatPenalty.toFixed(2)}
        </Text>
        {isMtpModel && (
          <Text color={samplingFocus === "specDraftNMax" ? Colors.AccentGreen : Colors.Foreground}>
            {samplingFocus === "specDraftNMax" ? "> " : "  "}Spec draft n-max: {specDraftNMax}
          </Text>
        )}
        <Text color={Colors.Gray}>llama.cpp only. Up/Down moves, Left/Right changes values.</Text>
      </Box>

      {/* Summary */}
      <Box flexDirection="column" marginTop={2} paddingX={1}>
        <Text bold>Summary:</Text>
        <Text color={Colors.Gray}>
          Context: {nCtx.toLocaleString()} / {ctxMax.toLocaleString()} tokens | GPU Layers: {nGpuLayers === -1 ? "all" : nGpuLayers} | KV: {kvCacheType}
        </Text>
      </Box>

      {/* Submit */}
      <Box marginTop={2} flexDirection="column">
        <Text color={Colors.AccentBlue}>
          Space to load model, ← → adjust context
        </Text>
        <Text color={Colors.Gray}>
          Esc to cancel. Settings are saved for this model.
        </Text>
      </Box>
    </Box>
  );
}

export default LlamaCppModelConfigDialog;
