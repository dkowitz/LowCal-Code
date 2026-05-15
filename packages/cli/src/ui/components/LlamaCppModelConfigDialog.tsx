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
import { RadioButtonSelect, type RadioSelectItem } from "./shared/RadioButtonSelect.js";

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
    },
    { isActive: true },
  );

  // KV quant radio group — only this one gets focus
  const kvItems: RadioSelectItem<KvCacheQuantType>[] = KV_CACHE_TYPES.map((t) => ({
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
      <Box flexDirection="column" marginTop={2}>
        <Text bold>Context Length: {nCtx.toLocaleString()} tokens</Text>
        <Text color={Colors.Gray}>
          Max from GGUF metadata: {ctxMax.toLocaleString()} tokens (default)
        </Text>
        <Box marginTop={1}>
          <Text color={Colors.Gray}>{'['}</Text>
          <Text color={Colors.AccentBlue}>{sliderBar}</Text>
          <Text color={Colors.Gray}>{']'}</Text>
        </Box>
        <Text color={Colors.Gray}>
          ← → to adjust (step: {CTX_STEP.toLocaleString()} tokens)
        </Text>
      </Box>

      {/* GPU Layers */}
      <Box flexDirection="column" marginTop={2}>
        <Text bold>GPU Layers: {nGpuLayers === -1 ? "All (full offload)" : nGpuLayers === 0 ? "None (CPU only)" : nGpuLayers}</Text>
        <RadioButtonSelect
          items={GPU_LAYER_PRESETS.map((p) => ({
            label: `${p.label} — ${p.desc}`,
            value: p.value,
          }))}
          initialIndex={Math.max(0, GPU_LAYER_PRESETS.findIndex((p) => p.value === nGpuLayers))}
          onSelect={(value) => setNGpuLayers(value)}
          isFocused
        />
      </Box>

      {/* KV Cache Quantization */}
      <Box flexDirection="column" marginTop={2}>
        <Text bold>KV Cache Quantization:</Text>
        <RadioButtonSelect
          items={kvItems}
          initialIndex={initialKvIndex}
          onSelect={(value) => setKvCacheType(value)}
        />
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
