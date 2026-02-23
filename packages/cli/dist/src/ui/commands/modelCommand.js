import { AuthType } from "@qwen-code/qwen-code-core";
import { CommandKind } from "./types.js";
import { AVAILABLE_MODELS_QWEN, fetchGeminiModels, fetchOpenAICompatibleModels, getFilteredGeminiModels, getOpenAIAvailableModelFromEnv, } from "../models/availableModels.js";
async function getAvailableModelsForAuthType(authType, context) {
    switch (authType) {
        case AuthType.QWEN_OAUTH:
            return AVAILABLE_MODELS_QWEN;
        case AuthType.USE_GEMINI:
        case AuthType.USE_VERTEX_AI: {
            const currentModel = context.services.config?.getModel();
            const apiKey = process.env["GEMINI_API_KEY"]?.trim();
            const fetched = apiKey ? await fetchGeminiModels(apiKey) : [];
            const fallback = getFilteredGeminiModels(currentModel);
            return fetched.length > 0 ? fetched : fallback;
        }
        case AuthType.USE_OPENAI: {
            // Use provider-specific settings from config
            const { providerId, providers } = context.services.settings.merged.security?.auth || {};
            const provider = providers?.[providerId];
            const baseUrl = provider?.baseUrl?.trim() || process.env["OPENAI_BASE_URL"]?.trim();
            const providerApiKey = provider &&
                "apiKey" in provider &&
                typeof provider.apiKey === "string"
                ? provider.apiKey.trim()
                : undefined;
            const apiKey = providerApiKey || process.env["OPENAI_API_KEY"]?.trim();
            let models = [];
            if (baseUrl) {
                models = await fetchOpenAICompatibleModels(baseUrl, apiKey, {
                    forceLmStudio: providerId === "lmstudio",
                });
            }
            const openAIModel = getOpenAIAvailableModelFromEnv();
            if (openAIModel && !models.find((m) => m.id === openAIModel.id)) {
                models.push(openAIModel);
            }
            return models;
        }
        default:
            // For other auth types, return empty array for now
            return [];
    }
}
export const modelCommand = {
    name: "model",
    description: "Switch the model for this session",
    kind: CommandKind.BUILT_IN,
    action: async (context) => {
        const { services } = context;
        const { config } = services;
        if (!config) {
            return {
                type: "message",
                messageType: "error",
                content: "Configuration not available.",
            };
        }
        const contentGeneratorConfig = config.getContentGeneratorConfig();
        if (!contentGeneratorConfig) {
            return {
                type: "message",
                messageType: "error",
                content: "Content generator configuration not available.",
            };
        }
        const authType = contentGeneratorConfig.authType;
        if (!authType) {
            return {
                type: "message",
                messageType: "error",
                content: "Authentication type not available.",
            };
        }
        const availableModels = await getAvailableModelsForAuthType(authType, context);
        if (availableModels.length === 0) {
            return {
                type: "message",
                messageType: "error",
                content: `No models available for the current authentication type (${authType}).`,
            };
        }
        // Trigger model selection dialog
        return {
            type: "dialog",
            dialog: "model",
        };
    },
};
//# sourceMappingURL=modelCommand.js.map