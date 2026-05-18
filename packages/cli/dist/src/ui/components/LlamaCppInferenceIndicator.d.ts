/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
interface LlamaCppInferenceProgress {
    phase: "processing" | "generating";
    value: number;
    total?: number;
    tokensPerSec?: number;
    message?: string;
}
interface LlamaCppInferenceIndicatorProps {
    progress: LlamaCppInferenceProgress;
}
/**
 * Visual indicator for llama.cpp inference progress, mirroring LM Studio's
 * "Processing xx%" (context encoding) and "Generating xx tok" (token generation)
 * displays.
 *
 * Shows a filled progress bar for the processing phase and a token counter
 * for the generating phase.
 */
export declare const LlamaCppInferenceIndicator: React.FC<LlamaCppInferenceIndicatorProps>;
export {};
