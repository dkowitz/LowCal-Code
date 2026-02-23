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
    if (baseUrl.endsWith("/v1")) {
      url = baseUrl + "/models";
    } else {
      url = baseUrl.replace(/\/*$/, "") + "/v1/models";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    if (isLMStudio) {
      const lmStudioBaseUrl = baseUrl
        .replace(/\/v1\/?$/, "")
        .replace(/\/*$/, "");

      // Prefer modern LM Studio manage API schema; fallback to /api/v0 for older versions.
      const v1Models = await fetchLMStudioV1Models(lmStudioBaseUrl, headers);
      if (v1Models.length > 0) return v1Models;

      return fetchLMStudioV0Models(lmStudioBaseUrl, headers);
    }

    const resp = await fetch(url, { headers, method: "GET" as const });
    if (!resp.ok) return [];
    const data = await resp.json();
    // OpenAI responses typically have "data" array with id fields
    const models = getModelArray(data);

    // Map provider model objects into our AvailableModel shape
    const mapped: AvailableModel[] = [];
    for (const model of models) {
      const id = firstString(model["id"], model["name"]);
      if (!id) {
        continue;
      }

      const pricing = toRecord(model["pricing"]);
      const topProvider = toRecord(model["top_provider"]);

      mapped.push({
        id,
        label: id,
        // OpenRouter includes pricing and context_length in the model object
        // pricing.prompt is for input tokens, pricing.completion is for output tokens
        inputPrice: firstString(pricing?.["prompt"]),
        outputPrice: firstString(pricing?.["completion"]),
        contextLength: toNumber(
          model["context_length"] ?? topProvider?.["context_length"],
        ),
      });
    }

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
            setLimit(mm.id, mm.contextLength);
          } catch {
            // ignore per-model set failures
          }
        }
      }
    } catch {
      // ignore dynamic set failures
    }

    return mapped;
  } catch {
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
    const models = getModelArray(data);
    return models
      .map((model) => {
        const rawName = firstString(model["name"]) ?? "";
        const id = rawName.startsWith("models/")
          ? rawName.slice("models/".length)
          : rawName;
        const displayName = firstString(model["displayName"]);
        const label = displayName ? `${displayName} (${id})` : id;
        const methods = toStringArray(model["supportedGenerationMethods"]);
        const isVision = methods.some(
          (method) => method.toLowerCase().includes("image"),
        );
        if (!id) return null;
        const maxContextLength = toNumber(
          model["inputTokenLimit"] ??
            model["input_token_limit"] ??
            model["contextWindow"] ??
            model["context_window"] ??
            model["contextLength"] ??
            model["context_length"],
        );
        const item: AvailableModel = {
          id,
          label,
          isVision: isVision || undefined,
          maxContextLength,
        };
        return item;
      })
      .filter((m): m is AvailableModel => !!m);
  } catch {
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

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toRecord(item))
    .filter((item): item is Record<string, unknown> => !!item);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function getModelArray(data: unknown): Array<Record<string, unknown>> {
  const asRecord = toRecord(data);
  if (!asRecord) return [];

  const dataModels = toRecordArray(asRecord["data"]);
  if (dataModels.length > 0) return dataModels;

  return toRecordArray(asRecord["models"]);
}

function extractCapabilityNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  const record = toRecord(value);
  if (!record) return [];

  return Object.entries(record)
    .filter(([, enabled]) => enabled === true)
    .map(([name]) => name);
}

function mergeCapabilities(...sources: unknown[]): string[] | undefined {
  const merged = new Set<string>();
  for (const source of sources) {
    for (const cap of extractCapabilityNames(source)) {
      merged.add(cap);
    }
  }
  return merged.size > 0 ? Array.from(merged) : undefined;
}

function mapLMStudioModelFromV1(
  model: Record<string, unknown>,
): AvailableModel[] {
  const loadedInstances = toRecordArray(model["loaded_instances"]);
  const baseId = firstString(
    model["key"],
    model["id"],
    model["name"],
    model["identifier"],
  );
  if (!baseId) return [];

  const loaded = loadedInstances[0];
  const loadedConfig = toRecord(loaded?.["config"]);
  const loadedContextLength = toNumber(
    loadedConfig?.["context_length"] ??
      loadedConfig?.["contextLength"] ??
      loaded?.["context_length"] ??
      loaded?.["contextLength"],
  );

  const variants = toStringArray(model["variants"]);
  const selectedVariant = firstString(model["selected_variant"]);

  const variantIds = Array.from(
    new Set(
      variants.length > 0
        ? [...variants, ...(selectedVariant ? [selectedVariant] : [])]
        : [baseId],
    ),
  );

  const loadedVariantIds = new Set<string>();
  for (const instance of loadedInstances) {
    const instanceVariant = firstString(
      instance["id"],
      instance["model"],
      instance["model_key"],
      instance["key"],
      instance["identifier"],
    );
    if (instanceVariant) loadedVariantIds.add(instanceVariant);
  }
  if (
    loadedVariantIds.size === 0 &&
    loadedInstances.length > 0 &&
    selectedVariant
  ) {
    loadedVariantIds.add(selectedVariant);
  }

  return variantIds.map((variantId) => {
    const state = loadedVariantIds.size
      ? loadedVariantIds.has(variantId)
        ? "loaded"
        : "not-loaded"
      : (firstString(model["state"]) ?? undefined);

    return {
      id: variantId,
      label:
        firstString(model["display_name"], model["name"], baseId) ?? baseId,
      maxContextLength: toNumber(
        loadedContextLength ??
          model["max_context_length"] ??
          model["loaded_context_length"] ??
          model["context_length"] ??
          model["context_window"] ??
          model["context_size"],
      ),
      quantization:
        extractQuantizationFromId(variantId) ?? extractQuantization(model),
      modelType: firstString(model["type"]),
      capabilities: mergeCapabilities(model["capabilities"], model["compat"]),
      state,
    };
  });
}

function mapLMStudioModelFromV0(
  model: Record<string, unknown>,
): AvailableModel | null {
  const id = firstString(
    model["id"],
    model["key"],
    model["model_key"],
    model["identifier"],
    model["name"],
  );
  if (!id) return null;

  return {
    id,
    label: firstString(model["display_name"], model["name"], id) ?? id,
    maxContextLength: toNumber(
      model["max_context_length"] ??
        model["loaded_context_length"] ??
        model["context_length"] ??
        model["context_window"] ??
        model["context_size"],
    ),
    quantization: extractQuantization(model),
    modelType: firstString(model["type"]),
    capabilities: mergeCapabilities(model["capabilities"], model["compat"]),
    state: firstString(model["state"]) ?? undefined,
  };
}

async function fetchLMStudioV1Models(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<AvailableModel[]> {
  try {
    const resp = await fetch(`${baseUrl}/api/v1/models`, {
      headers,
      method: "GET" as const,
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return getModelArray(data)
      .flatMap(mapLMStudioModelFromV1)
      .filter((model) => !!model.id);
  } catch {
    return [];
  }
}

async function fetchLMStudioV0Models(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<AvailableModel[]> {
  try {
    const resp = await fetch(`${baseUrl}/api/v0/models`, {
      headers,
      method: "GET" as const,
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return getModelArray(data)
      .map(mapLMStudioModelFromV0)
      .filter((model): model is AvailableModel => !!model);
  } catch {
    return [];
  }
}

function extractQuantization(
  model: Record<string, unknown>,
): string | undefined {
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

  // If quantization isn't in metadata, try to extract from model ID
  // Common patterns: qwen3-coder-next-q4, qwen3-coder-next-Q6_K_M, etc.
  const id = firstString(
    model["key"],
    model["id"],
    model["model_key"],
    model["identifier"],
  );
  return extractQuantizationFromId(id);
}

function extractQuantizationFromId(id?: string): string | undefined {
  if (!id) return undefined;

  // Match patterns like -q4, @Q6, -q8_K_M, -Q2_0, etc.
  const match = id.match(/[@-](q[0-9]+[a-z0-9_]*)/i);
  if (match) {
    return match[1].toLowerCase();
  }

  return undefined;
}

/**
 * Resolve the currently loaded LM Studio model id.
 * Prefers /api/v1/models (new schema) and falls back to /api/v0/models.
 */
export async function getLMStudioLoadedModel(
  baseUrl: string,
): Promise<string | null> {
  try {
    const normalizedBaseUrl = baseUrl
      .replace(/\/v1\/?$/, "")
      .replace(/\/*$/, "");

    // Prefer /api/v1/models (new LM Studio schema), fallback to /api/v0/models.
    const v1Resp = await fetch(`${normalizedBaseUrl}/api/v1/models`, {
      method: "GET",
    });
    if (v1Resp.ok) {
      const data = await v1Resp.json();
      const models = getModelArray(data);
      for (const model of models) {
        const loadedInstances = toRecordArray(model["loaded_instances"]);
        if (loadedInstances.length > 0) {
          const loaded = loadedInstances[0];
          return (
            firstString(
              loaded?.["id"],
              model["key"],
              model["id"],
              model["name"],
            ) ?? null
          );
        }
        if (firstString(model["state"]) === "loaded") {
          return firstString(model["key"], model["id"], model["name"]) ?? null;
        }
      }
    }

    const v0Resp = await fetch(`${normalizedBaseUrl}/api/v0/models`, {
      method: "GET",
    });
    if (!v0Resp.ok) return null;

    const data = await v0Resp.json();
    const models = getModelArray(data);
    const loadedModel = models.find(
      (m) => firstString(m["state"]) === "loaded",
    );
    if (!loadedModel) return null;

    return (
      firstString(
        loadedModel["id"],
        loadedModel["key"],
        loadedModel["model_key"],
        loadedModel["name"],
      ) ?? null
    );
  } catch {
    return null;
  }
}

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
