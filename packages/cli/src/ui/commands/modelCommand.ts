import { AuthType, normalizeLlamaCppBackend } from "@qwen-code/qwen-code-core";
import type {
  SlashCommand,
  CommandContext,
  OpenDialogActionReturn,
  MessageActionReturn,
} from "./types.js";
import { CommandKind } from "./types.js";
import {
  AVAILABLE_MODELS_QWEN,
  fetchGeminiModels,
  fetchOpenAICompatibleModels,
  getFilteredGeminiModels,
  getOpenAIAvailableModelFromEnv,
  discoverGgufModels,
  type AvailableModel,
} from "../models/availableModels.js";
import { getRemoteOpenAIApiKey } from "../../config/auth.js";

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

function resolveOpenRouterBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return OPENROUTER_DEFAULT_BASE_URL;
  }

  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/u, "");
    if (parsed.hostname === "openrouter.ai" && normalizedPath !== "/api/v1") {
      return OPENROUTER_DEFAULT_BASE_URL;
    }
  } catch {
    return OPENROUTER_DEFAULT_BASE_URL;
  }

  return trimmed;
}

async function getAvailableModelsForAuthType(
  authType: AuthType,
  context: CommandContext,
): Promise<AvailableModel[]> {
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
    case AuthType.USE_LLAMACPP: {
      // Use filesystem-based GGUF discovery — llama.cpp's /v1/models only
      // returns loaded models from the LRU cache, not all available files.
      const settings = context.services.settings;
      if (!settings) return [];

      const llamacppConfig =
        (
          settings.merged.security?.auth?.providers as
            | Record<string, { modelsDir?: string }>
            | undefined
        )?.["llamacpp"] || {};
      const modelsDir =
        llamacppConfig.modelsDir || process.env["LLAMA_CPP_MODELS_DIR"] || "";

      if (!modelsDir) {
        return [];
      }

      // Discover GGUF files from the filesystem
      const ggufModels = discoverGgufModels(modelsDir);

      // If we found models, return them. Otherwise fall back to server query
      // as a health check (in case the server is running and has loaded models).
      if (ggufModels.length > 0) {
        return ggufModels;
      }

      // Fallback: try querying the server — useful for detecting if it's healthy
      const port = process.env["LLAMA_CPP_PORT"] || "8080";
      const baseUrl = `http://127.0.0.1:${port}/v1`;

      if (!baseUrl) {
        return [];
      }

      const models: AvailableModel[] = await fetchOpenAICompatibleModels(
        baseUrl,
        undefined,
        {},
      );

      // If no models returned, server may be unhealthy — try recovery-aware restart
      if (models.length === 0 && modelsDir) {
        try {
          const { LlamaCppProcessManager } = await import(
            "@qwen-code/qwen-code-core"
          );
          const manager = LlamaCppProcessManager.instance;

          if (!(await manager.isHealthy())) {
            console.log(
              "[llama.cpp] Server not healthy — attempting restart...",
            );
            const port = parseInt(process.env["LLAMA_CPP_PORT"] || "8080", 10);
            await manager.swapModel({
              modelsDir,
              port,
              binaryPath: process.env["LLAMA_CPP_BINARY"] || undefined,
              backend: normalizeLlamaCppBackend(
                process.env["LLAMA_CPP_BACKEND"],
              ),
            });
          }
        } catch (err) {
          console.error(
            `[llama.cpp] Failed to restart server: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      return models;
    }
    case AuthType.USE_OPENAI: {
      // Use provider-specific settings from config
      const { providerId, providers } =
        context.services.settings.merged.security?.auth || {};
      const provider =
        providers?.[providerId as "openrouter" | "lmstudio" | "openai"];
      const providerApiKey =
        provider && "apiKey" in provider && typeof provider.apiKey === "string"
          ? provider.apiKey.trim()
          : undefined;
      let baseUrl =
        provider?.baseUrl?.trim() || process.env["OPENAI_BASE_URL"]?.trim();
      let apiKey =
        providerId === "lmstudio"
          ? providerApiKey || process.env["OPENAI_API_KEY"]?.trim()
          : getRemoteOpenAIApiKey(
              providerApiKey,
              process.env["OPENAI_API_KEY"],
            );

      if (providerId === "openrouter") {
        const envBaseUrl = process.env["OPENAI_BASE_URL"]?.includes(
          "openrouter",
        )
          ? process.env["OPENAI_BASE_URL"]
          : undefined;
        baseUrl = resolveOpenRouterBaseUrl(provider?.baseUrl || envBaseUrl);
        apiKey = getRemoteOpenAIApiKey(
          providerApiKey,
          process.env["OPENROUTER_API_KEY"],
          process.env["OPENAI_API_KEY"],
        );
      }

      let models: AvailableModel[] = [];
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

export const modelCommand: SlashCommand = {
  name: "model",
  description: "Switch the model for this session",
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<OpenDialogActionReturn | MessageActionReturn> => {
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

    // For llama.cpp, check that models directory is configured
    if (authType === AuthType.USE_LLAMACPP) {
      const settings = services.settings;
      if (settings) {
        const llamacppConfig =
          (
            settings.merged.security?.auth?.providers as
              | Record<string, { modelsDir?: string }>
              | undefined
          )?.["llamacpp"] || {};
        const modelsDir =
          llamacppConfig.modelsDir || process.env["LLAMA_CPP_MODELS_DIR"] || "";

        if (!modelsDir) {
          return {
            type: "message",
            messageType: "error",
            content:
              "llama.cpp models directory not configured. Run /auth to configure llama.cpp first.",
          };
        }
      }
    }

    const availableModels = await getAvailableModelsForAuthType(
      authType,
      context,
    );

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
