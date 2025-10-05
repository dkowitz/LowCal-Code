/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export const MAINLINE_VLM = 'vision-model';
export const MAINLINE_CODER = 'coder-model';
export const AVAILABLE_MODELS_QWEN = [
    { id: MAINLINE_CODER, label: MAINLINE_CODER },
    { id: MAINLINE_VLM, label: MAINLINE_VLM, isVision: true },
];
/**
 * Get available Qwen models filtered by vision model preview setting
 */
export function getFilteredQwenModels(visionModelPreviewEnabled) {
    if (visionModelPreviewEnabled) {
        return AVAILABLE_MODELS_QWEN;
    }
    return AVAILABLE_MODELS_QWEN.filter((model) => !model.isVision);
}
/**
 * Currently we use the single model of `OPENAI_MODEL` in the env.
 * In the future, after settings.json is updated, we will allow users to configure this themselves.
 */
export function getOpenAIAvailableModelFromEnv() {
    const id = process.env['OPENAI_MODEL']?.trim();
    return id ? { id, label: id } : null;
}
/**
 * Query an OpenAI-compatible server for available models (/v1/models).
 * Returns an array of AvailableModel or empty on error.
 */
export async function fetchOpenAICompatibleModels(baseUrl, apiKey) {
    try {
        const isLMStudio = baseUrl.includes('127.0.0.1:1234') || baseUrl.includes('localhost:1234');
        // Normalize the base URL to avoid double /v1 paths
        // If baseUrl already ends with /v1, don't add another /v1
        let url;
        if (isLMStudio) {
            url = baseUrl.replace(/\/v1\/?$/, '') + '/api/v0/models';
        }
        else if (baseUrl.endsWith('/v1')) {
            url = baseUrl + '/models';
        }
        else {
            url = baseUrl.replace(/\/*$/, '') + '/v1/models';
        }
        const headers = {
            'Content-Type': 'application/json',
        };
        if (apiKey)
            headers['Authorization'] = `Bearer ${apiKey}`;
        const resp = await fetch(url, { headers, method: 'GET' });
        if (!resp.ok)
            return [];
        const data = await resp.json();
        // OpenAI responses typically have "data" array with id fields
        const models = Array.isArray(data?.data) ? data.data : [];
        if (isLMStudio) {
            return models
                .map((m) => ({
                id: m.id || m.name,
                label: m.id || m.name,
                contextLength: m.max_context_length,
            }))
                .filter((m) => !!m.id);
        }
        return models
            .map((m) => ({
            id: m.id || m.name,
            label: m.id || m.name,
            // OpenRouter includes pricing and context_length in the model object
            // pricing.prompt is for input tokens, pricing.completion is for output tokens
            inputPrice: typeof m.pricing?.prompt === 'string' ? m.pricing.prompt : undefined,
            outputPrice: typeof m.pricing?.completion === 'string'
                ? m.pricing.completion
                : undefined,
            contextLength: typeof m.context_length === 'number'
                ? m.context_length
                : typeof m.top_provider?.context_length === 'number'
                    ? m.top_provider.context_length
                    : undefined,
        }))
            .filter((m) => !!m.id);
    }
    catch (e) {
        // swallow errors and return empty list
        return [];
    }
}
/**
 * Query LM Studio for the currently loaded model.
 * Returns the model id or null if not found.
 */
export async function getLMStudioLoadedModel(baseUrl) {
    try {
        // LM Studio endpoint is /api/v0/models, not /v1
        const url = baseUrl.replace(/\/v1\/?$/, '') + '/api/v0/models';
        const resp = await fetch(url, { method: 'GET' });
        if (!resp.ok) {
            return null;
        }
        const data = await resp.json();
        const models = Array.isArray(data?.data) ? data.data : [];
        const loadedModel = models.find((m) => m.state === 'loaded');
        return loadedModel?.id || null;
    }
    catch (e) {
        // swallow errors and return null
        return null;
    }
}
/**
/**
 * Hard code the default vision model as a string literal,
 * until our coding model supports multimodal.
 */
export function getDefaultVisionModel() {
    return MAINLINE_VLM;
}
export function isVisionModel(modelId) {
    return AVAILABLE_MODELS_QWEN.some((model) => model.id === modelId && model.isVision);
}
//# sourceMappingURL=availableModels.js.map