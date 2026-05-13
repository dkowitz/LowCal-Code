/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from "./types.js";
import { fetchOpenAICompatibleModels, getOpenAIAvailableModelFromEnv, } from "../models/availableModels.js";
/**
 * Fetch OpenRouter models using stored credentials.
 */
async function getOpenRouterModels(context) {
    const auth = context.services.settings.merged.security?.auth;
    const providers = auth?.providers || {};
    const openrouter = providers.openrouter;
    const baseUrl = openrouter?.baseUrl?.trim() || process.env["OPENAI_BASE_URL"]?.trim();
    const apiKey = openrouter?.apiKey?.trim() || process.env["OPENAI_API_KEY"];
    if (!baseUrl || !apiKey) {
        return [];
    }
    const models = await fetchOpenAICompatibleModels(baseUrl, apiKey, { forceLmStudio: false });
    const openAIModel = getOpenAIAvailableModelFromEnv();
    if (openAIModel && !models.find((m) => m.id === openAIModel.id)) {
        models.push(openAIModel);
    }
    return models;
}
export const compressModelCommand = {
    name: "compress-model",
    description: "Select the OpenRouter model for auto-compression",
    kind: CommandKind.BUILT_IN,
    action: async (context) => {
        // Check if OpenRouter is configured
        const auth = context.services.settings.merged.security?.auth;
        const providers = auth?.providers || {};
        const openrouter = providers.openrouter;
        const hasApiKey = !!openrouter?.apiKey || !!process.env["OPENAI_API_KEY"];
        if (!hasApiKey) {
            return {
                type: "message",
                messageType: "error",
                content: "OpenRouter API key not configured. Set it via /auth → OpenRouter first, then use this command to pick a compression model.",
            };
        }
        // Fetch available models from OpenRouter
        const models = await getOpenRouterModels(context);
        if (models.length === 0) {
            return {
                type: "message",
                messageType: "error",
                content: "Could not fetch OpenRouter model list. Check your API key and connection, or set the model manually in settings.json under model.chatCompression.openRouterModel.",
            };
        }
        // Trigger compress-model dialog with fetched models
        return {
            type: "dialog",
            dialog: "compress-model",
        };
    },
};
//# sourceMappingURL=compressModelCommand.js.map