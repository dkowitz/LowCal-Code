/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export type AvailableModel = {
    id: string;
    label: string;
    /**
     * Optional price per input/prompt token (in USD). Only populated for OpenRouter models.
     */
    inputPrice?: string;
    /**
     * Optional price per output/completion token (in USD). Only populated for OpenRouter models.
     */
    outputPrice?: string;
    /**
     * Legacy single context length field (kept for compatibility). Prefer using
     * configuredContextLength and maxContextLength when available.
     */
    contextLength?: number;
    /**
     * Context window size configured by the user in LM Studio JSON files.
     */
    configuredContextLength?: number;
    /**
     * Max/context length reported by the provider (LM Studio REST API).
     */
    maxContextLength?: number;
    /** Original configured filename-derived model id (if from filesystem) */
    configuredName?: string;
    /** True if we couldn't find a matching REST id for this configured model */
    unmatched?: boolean;
    /** If matched, the REST provider id we matched to */
    matchedRestId?: string;
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
 * Read LM Studio user model configuration files from the user's home directory.
 * We traverse ~/.lmstudio/.internal/user-concrete-model-default-config/ recursively
 * and parse JSON files looking for the configured context length at key
 * "llm.load.contextLength" (commonly found under load.fields entries).
 * Only models with an explicit configured contextLength are returned.
 */
export declare function getLMStudioConfiguredModels(): Promise<AvailableModel[]>;
export declare function getLMStudioLoadedModel(baseUrl: string): Promise<string | null>;
/**
/**
 * Hard code the default vision model as a string literal,
 * until our coding model supports multimodal.
 */
export declare function getDefaultVisionModel(): string;
export declare function isVisionModel(modelId: string): boolean;
