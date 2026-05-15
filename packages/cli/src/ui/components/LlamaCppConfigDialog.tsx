/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { RadioButtonSelect, type RadioSelectItem } from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";

/**
 * Preset configurations for llama.cpp server startup.
 */
export interface LlamaCppPreset {
  name: string;
  description: string;
  nGpuLayers?: number;
  nCtx?: number;
  nThreads?: number;
  nThreadsBatch?: number;
  nBatch?: number;
  nUBatch?: number;
  flashAttn?: boolean;
}

/** Built-in presets */
export const LLAMA_CPP_PRESETS: LlamaCppPreset[] = [
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

interface LlamaCppConfigDialogProps {
  /** Currently saved preset name (if any) */
  currentPreset?: string;
  onSubmit: (preset: LlamaCppPreset) => void;
  onCancel: () => void;
}

export function LlamaCppConfigDialog({
  currentPreset,
  onSubmit,
  onCancel,
}: LlamaCppConfigDialogProps): React.JSX.Element {
  const [selectedName] = useState<string>(
    currentPreset || "balanced",
  );

  useKeypress(
    (key) => {
      if (key.name === "escape") {
        onCancel();
      }
    },
    { isActive: true },
  );

  const items: RadioSelectItem<string>[] = LLAMA_CPP_PRESETS.map((p) => ({
    label: `${p.name} — ${p.description}`,
    value: p.name,
  }));

  const initialIndex = Math.max(0, items.findIndex((i) => i.value === selectedName));

  const handleSelect = (name: string) => {
    const preset = LLAMA_CPP_PRESETS.find((p) => p.name === name);
    if (preset) {
      onSubmit(preset);
    }
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        llama.cpp Inference Preset
      </Text>
      <Box marginTop={1}>
        <Text>
          Choose a preset for server startup parameters. You can customize{" "}
          {" "}
          these later via settings.json under{" "}
          {Colors.AccentBlue}security.auth.providers.llamacpp.preset{""}.
        </Text>
      </Box>

      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialIndex}
          onSelect={handleSelect}
          isFocused
        />
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>Press Enter to confirm, Esc to cancel</Text>
      </Box>
    </Box>
  );
}

export default LlamaCppConfigDialog;
