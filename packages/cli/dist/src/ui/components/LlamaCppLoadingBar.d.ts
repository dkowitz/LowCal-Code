/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
interface LlamaCppLoadingBarProps {
    phase: string;
    elapsedMs: number;
    message?: string;
}
/** Animated progress bar for llama.cpp model loading with self-updating timer. */
export declare const LlamaCppLoadingBar: React.FC<LlamaCppLoadingBarProps>;
export {};
