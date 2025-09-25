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
        const url = baseUrl.replace(/\/*$/, '') + '/v1/models';
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
        return models
            .map((m) => ({ id: m.id || m.name, label: m.id || m.name }))
            .filter((m) => !!m.id);
    }
    catch (e) {
        // swallow errors and return empty list
        return [];
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