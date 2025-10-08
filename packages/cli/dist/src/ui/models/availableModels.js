/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
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
                maxContextLength: m.max_context_length,
            }))
                .filter((m) => !!m.id);
        }
        // Map provider model objects into our AvailableModel shape
        const mapped = models
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
        // If provider reported explicit context lengths (e.g., OpenRouter), register them
        try {
            const core = await import('@qwen-code/qwen-code-core');
            const setLimit = core.setModelContextLimit;
            for (const mm of mapped) {
                if (typeof mm.contextLength === 'number' && Number.isFinite(mm.contextLength) && mm.contextLength > 0) {
                    try {
                        setLimit(mm.id, mm.contextLength);
                    }
                    catch (e) {
                        // ignore per-model set failures
                    }
                }
            }
        }
        catch (e) {
            // ignore dynamic set failures
        }
        return mapped;
    }
    catch (e) {
        // swallow errors and return empty list
        return [];
    }
}
/**
 * Read LM Studio user model configuration files from the user's home directory.
 * We traverse ~/.lmstudio/.internal/user-concrete-model-default-config/ recursively
 * and parse JSON files looking for the configured context length at key
 * "llm.load.contextLength" (commonly found under load.fields entries).
 * Only models with an explicit configured contextLength are returned.
 */
export async function getLMStudioConfiguredModels() {
    const configDir = path.join(os.homedir(), '.lmstudio', '.internal', 'user-concrete-model-default-config');
    try {
        // Check dir exists
        const stat = await fs.stat(configDir).catch(() => null);
        if (!stat || !stat.isDirectory())
            return [];
        const files = [];
        async function walk(dir) {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    await walk(full);
                }
                else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
                    files.push(full);
                }
            }
        }
        await walk(configDir);
        const results = [];
        // load any persisted mappings
        let mappings = {};
        try {
            // dynamic import to avoid circular deps in runtime bundle
            const storage = await import('./modelMappingStorage.js');
            mappings = await storage.loadMappings();
        }
        catch (e) {
            mappings = {};
        }
        for (const filePath of files) {
            try {
                const raw = await fs.readFile(filePath, { encoding: 'utf8' });
                const obj = JSON.parse(raw);
                const ctx = extractContextLengthFromConfig(obj);
                if (typeof ctx === 'number' && Number.isFinite(ctx) && ctx > 0) {
                    // derive model id/label from filename
                    const base = path.basename(filePath, '.json');
                    // remove trailing .gguf or -GGUF variants if present
                    const cleaned = base.replace(/(\.gguf|-gguf)$/i, '');
                    const mapped = mappings[cleaned];
                    const model = { id: cleaned, label: cleaned, configuredName: cleaned, configuredContextLength: ctx };
                    if (mapped) {
                        model.matchedRestId = mapped;
                        model.id = mapped;
                        model.label = mapped;
                    }
                    results.push(model);
                }
            }
            catch (e) {
                // ignore parse/read errors for individual files
                continue;
            }
        }
        return results;
    }
    catch (e) {
        return [];
    }
}
function extractContextLengthFromConfig(obj) {
    // Common LM Studio schema: obj.load.fields is array of {key, value}
    if (obj && obj.load && Array.isArray(obj.load.fields)) {
        for (const f of obj.load.fields) {
            if (f && (f.key === 'llm.load.contextLength' || f.key === 'llm.load.contextlength')) {
                const v = f.value;
                if (typeof v === 'number')
                    return v;
                const n = Number(v);
                if (!Number.isNaN(n))
                    return n;
            }
        }
    }
    // Fallback: deep search for property name 'llm.load.contextLength'
    let found;
    function recurse(o) {
        if (found !== undefined)
            return;
        if (o && typeof o === 'object') {
            for (const k of Object.keys(o)) {
                if (k === 'llm.load.contextLength' || k === 'llm.load.contextlength') {
                    const v = o[k];
                    if (typeof v === 'number') {
                        found = v;
                        return;
                    }
                    const n = Number(v);
                    if (!Number.isNaN(n)) {
                        found = n;
                        return;
                    }
                }
                const val = o[k];
                if (val && typeof val === 'object')
                    recurse(val);
            }
        }
    }
    recurse(obj);
    return found;
}
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