/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  GEMINI_CONFIG_DIR as GEMINI_DIR,
} from "@qwen-code/qwen-code-core";
import { loadEnvironment } from "./settings.js";

export const LM_STUDIO_DUMMY_KEY = "lmstudio-local-key";
export const LLAMA_CPP_DUMMY_KEY = "llamacpp-local-key";

export type AuthSettingsForValidation = {
  selectedType?: string | AuthType;
  providerId?: string;
  providers?: Record<
    string,
    {
      apiKey?: string;
      baseUrl?: string;
      modelsDir?: string;
    }
  >;
};

export function isLocalOpenAIPlaceholderKey(
  apiKey: string | undefined,
): boolean {
  const trimmed = apiKey?.trim();
  return trimmed === LM_STUDIO_DUMMY_KEY || trimmed === LLAMA_CPP_DUMMY_KEY;
}

export function getRemoteOpenAIApiKey(
  ...candidates: Array<string | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && !isLocalOpenAIPlaceholderKey(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

export function isLmStudioOpenAIEnvironment(
  apiKey = process.env["OPENAI_API_KEY"],
  baseUrl = process.env["OPENAI_BASE_URL"],
): boolean {
  const trimmedBaseUrl = baseUrl?.trim().toLowerCase() || "";
  return (
    apiKey?.trim() === LM_STUDIO_DUMMY_KEY &&
    (trimmedBaseUrl.includes("127.0.0.1:1234") ||
      trimmedBaseUrl.includes("localhost:1234") ||
      trimmedBaseUrl.includes("lmstudio"))
  );
}

export function normalizeAuthType(
  authMethod: string | AuthType | undefined,
): AuthType | undefined {
  if (!authMethod) {
    return undefined;
  }

  const value = authMethod as string;
  if (value === "openrouter" || value === "lmstudio") {
    return AuthType.USE_OPENAI;
  }

  if (value === "llamacpp") {
    return AuthType.USE_LLAMACPP;
  }

  if (Object.values(AuthType).includes(value as AuthType)) {
    return value as AuthType;
  }

  return undefined;
}

export const validateAuthMethod = (
  authMethod: string | AuthType | undefined,
  authSettings?: AuthSettingsForValidation,
): string | null => {
  loadEnvironment();
  const normalizedAuthType = normalizeAuthType(authMethod);

  if (!normalizedAuthType) {
    return "Invalid auth method selected.";
  }

  if (
    normalizedAuthType === AuthType.LOGIN_WITH_GOOGLE ||
    normalizedAuthType === AuthType.CLOUD_SHELL
  ) {
    return null;
  }

  if (normalizedAuthType === AuthType.USE_GEMINI) {
    const geminiApiKey =
      authSettings?.providers?.["gemini"]?.apiKey ||
      process.env["GEMINI_API_KEY"];
    if (!geminiApiKey) {
      return "GEMINI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!";
    }
    return null;
  }

  if (normalizedAuthType === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env["GOOGLE_CLOUD_PROJECT"] &&
      !!process.env["GOOGLE_CLOUD_LOCATION"];
    const hasGoogleApiKey = !!process.env["GOOGLE_API_KEY"];
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        "When using Vertex AI, you must specify either:\n" +
        "• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n" +
        "• GOOGLE_API_KEY environment variable (if using express mode).\n" +
        "Update your environment and try again (no reload needed if using .env)!"
      );
    }
    return null;
  }

  if (normalizedAuthType === AuthType.USE_OPENAI) {
    const providerValue = authMethod as string | undefined;
    const providerId = authSettings?.providerId || providerValue;
    const providerSettings = providerId
      ? authSettings?.providers?.[providerId]
      : undefined;
    if (
      providerId === "lmstudio" ||
      providerValue === "lmstudio" ||
      isLmStudioOpenAIEnvironment(
        providerSettings?.apiKey || process.env["OPENAI_API_KEY"],
        providerSettings?.baseUrl || process.env["OPENAI_BASE_URL"],
      )
    ) {
      return null;
    }

    if (
      !getRemoteOpenAIApiKey(
        providerSettings?.apiKey,
        process.env["OPENAI_API_KEY"],
      )
    ) {
      return "OPENAI_API_KEY environment variable not found. You can enter it interactively or add it to your .env file.";
    }
    return null;
  }

  if (normalizedAuthType === AuthType.QWEN_OAUTH) {
    // Qwen OAuth doesn't require any environment variables for basic setup
    // The OAuth flow will handle authentication
    return null;
  }

  if (normalizedAuthType === AuthType.USE_LLAMACPP) {
    // llama.cpp requires a models directory to be configured.
    // We check for the LLAMA_CPP_MODELS_DIR env var or settings-based config.
    // The binary itself is checked at server start time, not here — we allow
    // the user to configure it through the auth dialog first.
    const modelsDir =
      authSettings?.providers?.["llamacpp"]?.modelsDir ||
      process.env["LLAMA_CPP_MODELS_DIR"];
    if (!modelsDir) {
      return "llama.cpp requires a models directory. Configure it below or set LLAMA_CPP_MODELS_DIR.";
    }
    return null;
  }

  return "Invalid auth method selected.";
};

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";

function getEnvFilePath(): string {
  // Search upward from cwd for a project .env or .qwen/.env, otherwise use home fallback.
  let currentDir = path.resolve(process.cwd());
  while (true) {
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, ".env");
    const geminiDirPath = path.join(currentDir, GEMINI_DIR);
    // Prefer a project-level GEMINI_DIR/.env if the GEMINI_DIR exists in the
    // workspace even if the .env file hasn't been created yet. This makes the
    // CLI write credentials into the workspace-scoped .qwen/.env when the
    // workspace is present.
    if (fs.existsSync(geminiEnvPath) || fs.existsSync(geminiDirPath))
      return geminiEnvPath;
    const envPath = path.join(currentDir, ".env");
    if (fs.existsSync(envPath)) return envPath;
    const parent = path.dirname(currentDir);
    if (!parent || parent === currentDir) break;
    currentDir = parent;
  }

  // Fallbacks in home directory
  const homeGeminiEnv = path.join(homedir(), GEMINI_DIR, ".env");
  if (fs.existsSync(homeGeminiEnv)) return homeGeminiEnv;
  const homeEnv = path.join(homedir(), ".env");
  return homeEnv;
}

function setEnvVarAndPersist(key: string, value: string): string {
  process.env[key] = value;
  const envPath = getEnvFilePath();
  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  }
  let found = false;
  const newLines = lines.map((line) => {
    if (line.startsWith(key + "=")) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    newLines.push(`${key}=${value}`);
  }
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, newLines.filter(Boolean).join("\n"), "utf-8");
  return envPath;
}

export const setOpenAIApiKey = (apiKey: string): string =>
  setEnvVarAndPersist("OPENAI_API_KEY", apiKey);

export const setOpenAIBaseUrl = (baseUrl: string): string =>
  setEnvVarAndPersist("OPENAI_BASE_URL", baseUrl);

export const setOpenAIModel = (model: string): string =>
  setEnvVarAndPersist("OPENAI_MODEL", model);

export const setGeminiApiKey = (apiKey: string): string =>
  setEnvVarAndPersist("GEMINI_API_KEY", apiKey);

// llama.cpp-specific env helpers
export const setLlamaCppModelsDir = (modelsDir: string): string =>
  setEnvVarAndPersist("LLAMA_CPP_MODELS_DIR", modelsDir);

export const setLlamaCppPort = (port: string): string =>
  setEnvVarAndPersist("LLAMA_CPP_PORT", port);

export const setLlamaCppModel = (model: string): string =>
  setEnvVarAndPersist("LLAMA_CPP_MODEL", model);

export const setLlamaCppBinaryPath = (binaryPath: string): string =>
  setEnvVarAndPersist("LLAMA_CPP_BINARY", binaryPath);

export const setLlamaCppBackend = (backend: string): string =>
  setEnvVarAndPersist("LLAMA_CPP_BACKEND", backend);
