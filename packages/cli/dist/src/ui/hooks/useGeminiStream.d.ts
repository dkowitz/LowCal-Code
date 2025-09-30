/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config, GeminiClient, EditorType, ThoughtSummary } from "@qwen-code/qwen-code-core";
import { type PartListUnion } from "@google/genai";
import type { HistoryItem, HistoryItemWithoutId, SlashCommandProcessorResult } from "../types.js";
import { StreamingState } from "../types.js";
import type { UseHistoryManagerReturn } from "./useHistoryManager.js";
/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export declare const useGeminiStream: (geminiClient: GeminiClient, history: HistoryItem[], addItem: UseHistoryManagerReturn["addItem"], config: Config, onDebugMessage: (message: string) => void, handleSlashCommand: (cmd: PartListUnion) => Promise<SlashCommandProcessorResult | false>, shellModeActive: boolean, getPreferredEditor: () => EditorType | undefined, onAuthError: () => void, performMemoryRefresh: () => Promise<void>, modelSwitchedFromQuotaError: boolean, setModelSwitchedFromQuotaError: React.Dispatch<React.SetStateAction<boolean>>, onEditorClose: () => void, onCancelSubmit: () => void, visionModelPreviewEnabled: boolean, onVisionSwitchRequired?: (query: PartListUnion) => Promise<{
    modelOverride?: string;
    persistSessionModel?: string;
    showGuidance?: boolean;
}>) => {
    streamingState: StreamingState;
    submitQuery: (query: PartListUnion, options?: {
        isContinuation: boolean;
    }, prompt_id?: string) => Promise<void>;
    initError: string | null;
    pendingHistoryItems: HistoryItemWithoutId[];
    thought: ThoughtSummary | null;
    cancelOngoingRequest: () => void;
};
