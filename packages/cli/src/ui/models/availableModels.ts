/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";

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

// ---------------------------------------------------------------------------
// llama.cpp GGUF model discovery (filesystem-based)
// ---------------------------------------------------------------------------

/**
 * Directory fingerprint — quick check to see if anything changed.
 * Collects mtime + size of every file under the root, hashes the result.
 * Fast enough for large model directories (stat-only, no reads).
 */
function getDirectoryFingerprint(root: string): string {
  const entries: string[] = [];
  const walk = (dir: string) => {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item.name);
      try {
        const stat = fs.statSync(full);
        entries.push(`${full}|${stat.mtimeMs}|${stat.size}`);
        if (item.isDirectory()) walk(full);
      } catch {
        // skip permission errors, etc.
      }
    }
  };
  walk(root);
  entries.sort();
  return crypto.createHash("md5").update(entries.join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// Persistent GGUF model cache — disk-backed via ~/.qwen/gguf-cache/
// ---------------------------------------------------------------------------

/** Cached model discovery results keyed by directory path. */
interface ModelCacheEntry {
  version: number;
  fingerprint: string;
  models: AvailableModel[];
  timestamp: number;
}

const CACHE_DIR_NAME = "gguf-cache";
const MODEL_CACHE_VERSION = 2;
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — models rarely change
const _modelDiscoveryCache = new Map<string, ModelCacheEntry>();

/**
 * Get the path to the disk cache file for a given models directory.
 * Uses a short hash of the directory path as the filename to avoid filesystem issues with long paths.
 */
function _getGgufCachePath(modelsDir: string): string {
  const dirHash = crypto.createHash("md5").update(modelsDir).digest("hex").slice(0, 16);
  const cacheDir = path.join(os.homedir(), ".qwen", CACHE_DIR_NAME);
  return path.join(cacheDir, `${dirHash}.json`);
}

/**
 * Read the disk cache for a given models directory. Returns null if invalid or missing.
 */
function _readDiskCache(modelsDir: string): ModelCacheEntry | null {
  try {
    const cachePath = _getGgufCachePath(modelsDir);
    const raw = fs.readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<ModelCacheEntry>;
    // Validate structure and schema version
    if (
      parsed.version === MODEL_CACHE_VERSION &&
      typeof parsed.fingerprint === "string" &&
      Array.isArray(parsed.models) &&
      typeof parsed.timestamp === "number"
    ) {
      return parsed as ModelCacheEntry;
    }
  } catch {
    // File doesn't exist or is corrupt — that's fine
  }
  return null;
}

/**
 * Write the cache to disk. Silently ignores errors to avoid breaking the UI.
 */
function _writeDiskCache(modelsDir: string, entry: ModelCacheEntry): void {
  try {
    const cachePath = _getGgufCachePath(modelsDir);
    const cacheDir = path.dirname(cachePath);
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(entry), "utf-8");
  } catch {
    // Best effort — don't crash if we can't write cache
  }
}

/**
 * Recursively discover GGUF model files in a directory tree.
 * Uses a fingerprint-based disk cache with in-memory fastpath.
 * Groups sharded models (e.g., file-00001-of-00003.gguf) into single entries.
 * Returns AvailableModel[] suitable for display in the model selection dialog.
 */
export function discoverGgufModels(modelsDir: string): AvailableModel[] {
  try {
    if (!fs.existsSync(modelsDir) || !fs.statSync(modelsDir).isDirectory()) {
      return [];
    }

    const currentFp = getDirectoryFingerprint(modelsDir);

    // 1. Check in-memory cache (instant for repeated calls within the same session)
    const inMem = _modelDiscoveryCache.get(modelsDir);
    if (inMem && inMem.fingerprint === currentFp && Date.now() - inMem.timestamp < MODEL_CACHE_TTL_MS) {
      return inMem.models;
    }

    // 2. Check disk cache (instant across session restarts)
    const diskCache = _readDiskCache(modelsDir);
    if (diskCache && diskCache.fingerprint === currentFp) {
      // Promote to in-memory cache for fast repeated access
      _modelDiscoveryCache.set(modelsDir, diskCache);
      // Still respect TTL — but disk cache is always valid if fingerprint matches
      return diskCache.models;
    }

    // 3. Cache miss — do the full scan
    const models = _discoverGgufModelsImpl(modelsDir);

    const entry: ModelCacheEntry = {
      version: MODEL_CACHE_VERSION,
      fingerprint: currentFp,
      models,
      timestamp: Date.now(),
    };
    _modelDiscoveryCache.set(modelsDir, entry);
    _writeDiskCache(modelsDir, entry);

    return models;
  } catch {
    return [];
  }
}

/** Internal implementation — does the actual recursive scan. */
function _discoverGgufModelsImpl(modelsDir: string): AvailableModel[] {
  // Collect all .gguf files recursively
  const ggufFiles: string[] = [];
  _scanGgufFiles(modelsDir, ggufFiles);

  if (ggufFiles.length === 0) {
    return [];
  }

  // Group sharded models by their base name
  const shardGroups = new Map<string, { primaryFile: string; files: string[] }>();

  for (const filePath of ggufFiles) {
    const fileName = path.basename(filePath);
    const shardMatch = fileName.match(/^(.+)-(\d{5})-of-(\d{5})\.gguf$/);

    if (shardMatch) {
      const [, baseName] = shardMatch;
      const key = `${path.dirname(filePath)}${path.sep}${baseName}`;
      if (!shardGroups.has(key)) {
        shardGroups.set(key, { primaryFile: filePath, files: [] });
      }
      shardGroups.get(key)!.files.push(filePath);
    } else {
      const key = filePath;
      if (!shardGroups.has(key)) {
        shardGroups.set(key, { primaryFile: filePath, files: [filePath] });
      }
    }
  }

  // Build AvailableModel[] from groups
  const models: AvailableModel[] = [];

  for (const [, group] of shardGroups) {
    const fileName = path.basename(group.primaryFile);
    const dirName = path.dirname(group.primaryFile).replace(modelsDir + path.sep, "");

    const quantMatch = fileName.match(/-(Q[0-9]+_[KSMB]|F[13]2|BF16|MXFP[45])\.gguf$/);
    const quantization = quantMatch ? quantMatch[1] : undefined;

    const isMmproj = fileName.startsWith("mmproj");

    const baseNameMatch = fileName.match(/^(.+)-(Q[0-9]+_[KSMB]|F[13]2|BF16|MXFP[45])\.gguf$/);
    const baseFileName = baseNameMatch ? baseNameMatch[1] : fileName.replace(/\.gguf$/, "");

    const parts = dirName.split(path.sep);
    let label: string;
    if (parts.length >= 2) {
      label = `${parts[0]}/${parts.slice(1).join("/")}/${baseFileName}`;
    } else if (dirName) {
      label = `${dirName}/${baseFileName}`;
    } else {
      label = baseFileName;
    }

    const shardCount = group.files.length > 1 ? ` (${group.files.length} shards)` : "";
    const typeTag = isMmproj ? " [mmproj]" : "";

    label += quantization ? ` [${quantization}]` : "";
    label += shardCount;
    label += typeTag;

    let maxContextLength: number | undefined;
    const meta = readGgufMetadata(group.primaryFile);
    if (meta?.contextLength && Number.isFinite(meta.contextLength)) {
      maxContextLength = meta.contextLength;
    }

    // Append context length to label if available
    if (maxContextLength) {
      const ctxK = maxContextLength >= 1024 * 1024
        ? `${(maxContextLength / (1024 * 1024)).toFixed(0)}M`
        : `${Math.round(maxContextLength / 1024)}K`;
      label += ` [${ctxK} ctx]`;
    }

    models.push({
      id: group.primaryFile,
      label,
      quantization,
      modelType: isMmproj ? "embeddings" : "llm",
      maxContextLength,
    });
  }

  models.sort((a, b) => {
    if (a.modelType === "llm" && b.modelType !== "llm") return -1;
    if (a.modelType !== "llm" && b.modelType === "llm") return 1;
    return a.label.localeCompare(b.label);
  });

  return models.filter((m) => m.modelType !== "embeddings");
}

/** Recursively collect all .gguf file paths. */
function _scanGgufFiles(dir: string, result: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      _scanGgufFiles(full, result);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".gguf")) {
      result.push(full);
    }
  }
}

// ---------------------------------------------------------------------------
// GGUF metadata parsing
// ---------------------------------------------------------------------------

enum GgufValueType {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

export interface GgufMetadata {
  architecture?: string;
  modelName?: string;
  contextLength?: number;
  ropeScaling?: { type: string; factor: number; originalContextLength: number };
  attentionHeadCount?: number;
  attentionHeadCountKv?: number;
  embeddingLength?: number;
  blockCount?: number;
  feedForwardLength?: number;
}

class GgufCursor {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readU8(): number {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readI8(): number {
    const value = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readU16(): number {
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readI16(): number {
    const value = this.buffer.readInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readU32(): number {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readI32(): number {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readU64(): number {
    const value = Number(this.buffer.readBigUInt64LE(this.offset));
    this.offset += 8;
    return value;
  }

  readI64(): number {
    const value = Number(this.buffer.readBigInt64LE(this.offset));
    this.offset += 8;
    return value;
  }

  readF32(): number {
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  readF64(): number {
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }

  readString(): string {
    const len = this.readU64();
    const value = this.buffer.toString("utf8", this.offset, this.offset + len);
    this.offset += len;
    return value;
  }

  skipBytes(count: number): void {
    this.offset += count;
  }

  getOffset(): number {
    return this.offset;
  }
}

export function readGgufMetadata(filePath: string): GgufMetadata | null {
  try {
    // Read a large enough prefix to cover metadata for modern GGUFs with big tokenizer arrays.
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(64 * 1024 * 1024);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      const cursor = new GgufCursor(buf.subarray(0, bytesRead));

      // Header
      if (cursor.readU32() !== 0x46554747) {
        return null;
      }
      const version = cursor.readU32();
      if (version < 2 || version > 3) {
        return null;
      }
      cursor.readU64(); // tensor_count
      const metadataKvCount = cursor.readU64();

      const result: GgufMetadata = {};
      const allKeys: Array<{ key: string; value: string | number | boolean | null }> = [];

      for (let i = 0; i < metadataKvCount; i++) {
        const key = cursor.readString();
        const valueType = cursor.readU32();
        const value = _readGgufValue(cursor, valueType);
        allKeys.push({ key, value });
      }

      for (const { key, value } of allKeys) {
        if (key === "general.architecture" && typeof value === "string") {
          result.architecture = value;
        } else if (key === "general.name" && typeof value === "string") {
          result.modelName = value;
        }
      }

      const arch = result.architecture;
      for (const { key, value } of allKeys) {
        if (typeof value !== "number") {
          continue;
        }

        if (
          (key === "llama.context_length" || key === `${arch}.context_length`) &&
          !result.contextLength
        ) {
          result.contextLength = value;
        } else if (
          (key === "llama.attention.head_count" ||
            key === `${arch}.attention.head_count`) &&
          !result.attentionHeadCount
        ) {
          result.attentionHeadCount = value;
        } else if (
          (key === "llama.attention.head_count_kv" ||
            key === `${arch}.attention.head_count_kv`) &&
          !result.attentionHeadCountKv
        ) {
          result.attentionHeadCountKv = value;
        } else if (
          (key === "llama.embedding_length" ||
            key === `${arch}.embedding_length`) &&
          !result.embeddingLength
        ) {
          result.embeddingLength = value;
        } else if (
          (key === "llama.block_count" || key === `${arch}.block_count`) &&
          !result.blockCount
        ) {
          result.blockCount = value;
        } else if (
          (key === "llama.feed_forward_length" ||
            key === `${arch}.feed_forward_length`) &&
          !result.feedForwardLength
        ) {
          result.feedForwardLength = value;
        }
      }

      return result;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function _skipGgufValue(cursor: GgufCursor, type: number): void {
  switch (type) {
    case GgufValueType.UINT8:
    case GgufValueType.INT8:
    case GgufValueType.BOOL:
      cursor.skipBytes(1);
      return;
    case GgufValueType.UINT16:
    case GgufValueType.INT16:
      cursor.skipBytes(2);
      return;
    case GgufValueType.UINT32:
    case GgufValueType.INT32:
    case GgufValueType.FLOAT32:
      cursor.skipBytes(4);
      return;
    case GgufValueType.UINT64:
    case GgufValueType.INT64:
    case GgufValueType.FLOAT64:
      cursor.skipBytes(8);
      return;
    case GgufValueType.STRING: {
      const len = cursor.readU64();
      cursor.skipBytes(len);
      return;
    }
    case GgufValueType.ARRAY: {
      const elType = cursor.readU32();
      const count = cursor.readU64();
      for (let i = 0; i < count; i++) {
        _skipGgufValue(cursor, elType);
      }
      return;
    }
    default:
      return;
  }
}

function _readGgufValue(cursor: GgufCursor, type: number): string | number | boolean | null {
  switch (type) {
    case GgufValueType.UINT8:
      return cursor.readU8();
    case GgufValueType.INT8:
      return cursor.readI8();
    case GgufValueType.UINT16:
      return cursor.readU16();
    case GgufValueType.INT16:
      return cursor.readI16();
    case GgufValueType.UINT32:
      return cursor.readU32();
    case GgufValueType.INT32:
      return cursor.readI32();
    case GgufValueType.FLOAT32:
      return cursor.readF32();
    case GgufValueType.BOOL:
      return cursor.readU8() !== 0;
    case GgufValueType.STRING:
      return cursor.readString();
    case GgufValueType.UINT64:
      return cursor.readU64();
    case GgufValueType.INT64:
      return cursor.readI64();
    case GgufValueType.FLOAT64:
      return cursor.readF64();
    case GgufValueType.ARRAY: {
      const elType = cursor.readU32();
      const count = cursor.readU64();
      if (count === 0) {
        return null;
      }
      const first = _readGgufValue(cursor, elType);
      for (let i = 1; i < count; i++) {
        _skipGgufValue(cursor, elType);
      }
      return first;
    }
    default:
      return null;
  }
}
