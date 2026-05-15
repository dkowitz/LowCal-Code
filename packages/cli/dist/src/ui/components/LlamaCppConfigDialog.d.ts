/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from "react";
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
export declare const LLAMA_CPP_PRESETS: LlamaCppPreset[];
interface LlamaCppConfigDialogProps {
    /** Currently saved preset name (if any) */
    currentPreset?: string;
    onSubmit: (preset: LlamaCppPreset) => void;
    onCancel: () => void;
}
export declare function LlamaCppConfigDialog({ currentPreset, onSubmit, onCancel, }: LlamaCppConfigDialogProps): React.JSX.Element;
export default LlamaCppConfigDialog;
