/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export type AvailableModel = {
    id: string;
    label: string;
    isVision?: boolean;
};
export declare const MAINLINE_VLM = "vision-model";
export declare const MAINLINE_CODER = "coder-model";
export declare const AVAILABLE_MODELS_QWEN: AvailableModel[];
/**
 * Get available Qwen models filtered by vision model preview setting
 */
export declare function getFilteredQwenModels(visionModelPreviewEnabled: boolean): AvailableModel[];
/**
 * Currently we use the single model of `OPENAI_MODEL` in the env.
 * In the future, after settings.json is updated, we will allow users to configure this themselves.
 */
export declare function getOpenAIAvailableModelFromEnv(): AvailableModel | null;
/**
 * Query an OpenAI-compatible server for available models (/v1/models).
 * Returns an array of AvailableModel or empty on error.
 */
export declare function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<AvailableModel[]>;
/**
 * Query LM Studio for the currently loaded model.
 * Returns the model id or null if not found.
 */
export declare function getLMStudioLoadedModel(baseUrl: string): Promise<string | null>;
/**
/**
 * Hard code the default vision model as a string literal,
 * until our coding model supports multimodal.
 */
export declare function getDefaultVisionModel(): string;
export declare function isVisionModel(modelId: string): boolean;
