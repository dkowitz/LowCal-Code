/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { type PartListUnion } from "@google/genai";
import { AuthType, type Config } from "@qwen-code/qwen-code-core";
import { VisionSwitchOutcome } from "../components/ModelSwitchDialog.js";
import type { UseHistoryManagerReturn } from "./useHistoryManager.js";
/**
 * Determines if we should offer vision switch for the given parts, auth type, and current model
 */
export declare function shouldOfferVisionSwitch(parts: PartListUnion, authType: AuthType, currentModel: string, visionModelPreviewEnabled?: boolean): boolean;
/**
 * Interface for vision switch result
 */
export interface VisionSwitchResult {
    modelOverride?: string;
    persistSessionModel?: string;
    showGuidance?: boolean;
}
/**
 * Processes the vision switch outcome and returns the appropriate result
 */
export declare function processVisionSwitchOutcome(outcome: VisionSwitchOutcome): VisionSwitchResult;
/**
 * Gets the guidance message for when vision switch is disallowed
 */
export declare function getVisionSwitchGuidanceMessage(): string;
/**
 * Interface for vision switch handling result
 */
export interface VisionSwitchHandlingResult {
    shouldProceed: boolean;
    originalModel?: string;
}
/**
 * Custom hook for handling vision model auto-switching
 */
export declare function useVisionAutoSwitch(config: Config, addItem: UseHistoryManagerReturn["addItem"], visionModelPreviewEnabled?: boolean, onVisionSwitchRequired?: (query: PartListUnion) => Promise<{
    modelOverride?: string;
    persistSessionModel?: string;
    showGuidance?: boolean;
}>): {
    handleVisionSwitch: (query: PartListUnion, userMessageTimestamp: number, isContinuation: boolean) => Promise<VisionSwitchHandlingResult>;
    restoreOriginalModel: () => Promise<void>;
};
