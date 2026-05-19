/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
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
export declare function LlamaCppModelConfigDialog({ modelPath, maxContextLength, previousSettings, onSubmit, onCancel, }: LlamaCppModelConfigDialogProps): React.JSX.Element;
export default LlamaCppModelConfigDialog;
