/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type ContentGeneratorConfig,
} from "../core/contentGenerator.js";
import type { Config } from "../config/config.js";

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  try {
    const parsed = new URL(
      baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`,
    );
    return parsed.host;
  } catch {
    return baseUrl;
  }
}

function providerFromBaseUrl(
  config: ContentGeneratorConfig,
): string | undefined {
  const host = normalizeBaseUrl(config.baseUrl);
  if (!host) {
    return undefined;
  }
  if (host.includes("openrouter.ai")) {
    return "openrouter";
  }
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return "lmstudio";
  }
  if (host.includes("ollama")) {
    return "ollama";
  }
  return host;
}

/**
 * Derive a concise provider tag for telemetry and logging purposes.
 */
export function getProviderTelemetryTag(config: Config): string {
  const generatorConfig = config.getContentGeneratorConfig();
  if (!generatorConfig) {
    return "unknown";
  }

  switch (generatorConfig.authType) {
    case AuthType.LOGIN_WITH_GOOGLE:
      return "google-oauth";
    case AuthType.USE_GEMINI:
      return "gemini-api-key";
    case AuthType.USE_VERTEX_AI:
      return "vertex-ai";
    case AuthType.CLOUD_SHELL:
      return "cloud-shell";
    case AuthType.QWEN_OAUTH:
      return "qwen-oauth";
    case AuthType.USE_OPENAI: {
      return providerFromBaseUrl(generatorConfig) ?? "openai-compatible";
    }
    default:
      return generatorConfig.authType ?? "unknown";
  }
}
