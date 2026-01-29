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
   * Legacy single context length field (kept for compatibility).
   */
  contextLength?: number;
  /**
   * Max/context length reported by the provider (LM Studio REST API).
   */
  maxContextLength?: number;
  /**
   * Optional quantization string (primarily for LM Studio models).
   */
  quantization?: string;
  /**
   * Provider-reported model type (e.g., "llm", "vlm", "embeddings").
   */
  modelType?: string;
  /**
   * Provider-reported capabilities (e.g., "tool_use").
   */
  capabilities?: string[];
  /**
   * Provider-reported model state (e.g., "loaded").
   */
  state?: string;
  isVision?: boolean;
};

export const MAINLINE_VLM = "vision-model";
export const MAINLINE_CODER = "coder-model";

export const AVAILABLE_MODELS_QWEN: AvailableModel[] = [
  { id: MAINLINE_CODER, label: MAINLINE_CODER },
  { id: MAINLINE_VLM, label: MAINLINE_VLM, isVision: true },
];

export const AVAILABLE_MODELS_GEMINI: AvailableModel[] = [
  { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
  { id: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite" },
  { id: "gemini-2.0-flash", label: "gemini-2.0-flash" },
  { id: "gemini-1.5-pro", label: "gemini-1.5-pro" },
  { id: "gemini-1.5-flash", label: "gemini-1.5-flash" },
];

export function getFilteredGeminiModels(
  currentModel?: string,
): AvailableModel[] {
  const models = [...AVAILABLE_MODELS_GEMINI];
  if (currentModel && !models.find((m) => m.id === currentModel)) {
    models.unshift({ id: currentModel, label: currentModel });
  }
  return models;
}

/**
 * Get available Qwen models filtered by vision model preview setting
 */
export function getFilteredQwenModels(
  visionModelPreviewEnabled: boolean,
): AvailableModel[] {
  if (visionModelPreviewEnabled) {
    return AVAILABLE_MODELS_QWEN;
  }
  return AVAILABLE_MODELS_QWEN.filter((model) => !model.isVision);
}

/**
 * Currently we use the single model of `OPENAI_MODEL` in the env.
 * In the future, after settings.json is updated, we will allow users to configure this themselves.
 */
export function getOpenAIAvailableModelFromEnv(): AvailableModel | null {
  const id = process.env["OPENAI_MODEL"]?.trim();
  return id ? { id, label: id } : null;
}

/**
 * Query an OpenAI-compatible server for available models (/v1/models).
 * Returns an array of AvailableModel or empty on error.
 */
export async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey?: string,
  options?: { forceLmStudio?: boolean },
): Promise<AvailableModel[]> {
  try {
    const isLMStudio =
      options?.forceLmStudio === true ||
      baseUrl.includes("127.0.0.1:1234") ||
      baseUrl.includes("localhost:1234");

    // Normalize the base URL to avoid double /v1 paths
    // If baseUrl already ends with /v1, don't add another /v1
    let url: string;
    if (isLMStudio) {
      url = baseUrl.replace(/\/v1\/?$/, "") + "/api/v0/models";
    } else if (baseUrl.endsWith("/v1")) {
      url = baseUrl + "/models";
    } else {
      url = baseUrl.replace(/\/*$/, "") + "/v1/models";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(url, { headers, method: "GET" as const });
    if (!resp.ok) return [];
    const data = await resp.json();
    // OpenAI responses typically have "data" array with id fields
    const models: any[] = Array.isArray(data?.data) ? data.data : [];

    if (isLMStudio) {
      return models
        .map((m) => ({
          id: m.id || m.name,
          label: m.id || m.name,
          maxContextLength: toNumber(
            m.max_context_length ??
              m.loaded_context_length ??
              m.context_length ??
              m.context_window ??
              m.context_size,
          ),
          quantization: extractQuantization(m),
          modelType: typeof m.type === "string" ? m.type : undefined,
          capabilities: Array.isArray(m.capabilities)
            ? m.capabilities.filter((cap: unknown) => typeof cap === "string")
            : undefined,
          state: typeof m.state === "string" ? m.state : undefined,
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
        inputPrice:
          typeof m.pricing?.prompt === "string" ? m.pricing.prompt : undefined,
        outputPrice:
          typeof m.pricing?.completion === "string"
            ? m.pricing.completion
            : undefined,
        contextLength:
          typeof m.context_length === "number"
            ? m.context_length
            : typeof m.top_provider?.context_length === "number"
              ? m.top_provider.context_length
              : undefined,
      }))
      .filter((m) => !!m.id);

    // If provider reported explicit context lengths (e.g., OpenRouter), register them
    try {
      const core = await import("@qwen-code/qwen-code-core");
      const setLimit = core.setModelContextLimit as (
        model: string,
        limit?: number,
      ) => void;
      for (const mm of mapped) {
        if (
          typeof mm.contextLength === "number" &&
          Number.isFinite(mm.contextLength) &&
          mm.contextLength > 0
        ) {
          try {
            setLimit(mm.id, mm.contextLength as number);
          } catch (e) {
            // ignore per-model set failures
          }
        }
      }
    } catch (e) {
      // ignore dynamic set failures
    }

    return mapped;
  } catch (e) {
    // swallow errors and return empty list
    return [];
  }
}

/**
 * Query the Gemini API for available models.
 * Returns an array of AvailableModel or empty on error.
 */
export async function fetchGeminiModels(
  apiKey: string,
  baseUrl = "https://generativelanguage.googleapis.com/v1beta",
): Promise<AvailableModel[]> {
  try {
    if (!apiKey) return [];
    const url = `${baseUrl.replace(/\/+$/, "")}/models?key=${encodeURIComponent(
      apiKey,
    )}`;
    const resp = await fetch(url, { method: "GET" as const });
    if (!resp.ok) return [];
    const data = await resp.json();
    const models: any[] = Array.isArray(data?.models) ? data.models : [];
    return models
      .map((m) => {
        const rawName = typeof m.name === "string" ? m.name : "";
        const id = rawName.startsWith("models/")
          ? rawName.slice("models/".length)
          : rawName;
        const label =
          typeof m.displayName === "string" && m.displayName.trim()
            ? `${m.displayName} (${id})`
            : id;
        const methods = Array.isArray(m.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        const isVision = methods.some(
          (method: unknown) =>
            typeof method === "string" &&
            method.toLowerCase().includes("image"),
        );
        if (!id) return null;
        const item: AvailableModel = isVision ? { id, label, isVision } : { id, label };
        return item;
      })
      .filter((m): m is AvailableModel => !!m);
  } catch (e) {
    return [];
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractQuantization(model: Record<string, unknown>): string | undefined {
  const direct = model["quantization"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  if (direct && typeof direct === "object") {
    const obj = direct as Record<string, unknown>;
    const name = obj["name"];
    const id = obj["id"];
    const label = obj["label"];
    const format = obj["format"];
    const candidates = [name, id, label, format];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  const altKeys = ["quant", "quantization_type", "quant_type"];
  for (const key of altKeys) {
    const val = model[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }

  return undefined;
}

/**
 * Read LM Studio user model configuration files from the user's home directory.
 * We traverse ~/.lmstudio/.internal/user-concrete-model-default-config/ recursively
 * and parse JSON files looking for the configured context length at key
 * "llm.load.contextLength" (commonly found under load.fields entries).
 * Only models with an explicit configured contextLength are returned.
 */
export async function getLMStudioLoadedModel(
  baseUrl: string,
): Promise<string | null> {
  try {
    // LM Studio endpoint is /api/v0/models, not /v1
    const url = baseUrl.replace(/\/v1\/?$/, "") + "/api/v0/models";
    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    const models: any[] = Array.isArray(data?.data) ? data.data : [];
    const loadedModel = models.find((m) => m.state === "loaded");
    return loadedModel?.id || null;
  } catch (e) {
    return null;
  }
}

/**
/**
 * Hard code the default vision model as a string literal,
 * until our coding model supports multimodal.
 */
export function getDefaultVisionModel(): string {
  return MAINLINE_VLM;
}

export function isVisionModel(modelId: string): boolean {
  return AVAILABLE_MODELS_QWEN.some(
    (model) => model.id === modelId && model.isVision,
  );
}
