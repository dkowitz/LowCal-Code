/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type LlamaCppBackend = "auto" | "vulkan" | "rocm" | "cpu" | "custom";

export const LLAMA_CPP_BACKENDS: LlamaCppBackend[] = [
  "auto",
  "vulkan",
  "rocm",
  "cpu",
  "custom",
];

export function normalizeLlamaCppBackend(value: unknown): LlamaCppBackend {
  if (typeof value !== "string") {
    return "auto";
  }
  const normalized = value.trim().toLowerCase();
  return LLAMA_CPP_BACKENDS.includes(normalized as LlamaCppBackend)
    ? (normalized as LlamaCppBackend)
    : "auto";
}

export function getDefaultLlamaCppBackend(
  platform = process.platform,
): LlamaCppBackend {
  if (platform === "linux") {
    return "vulkan";
  }
  if (platform === "win32") {
    return "cpu";
  }
  return "auto";
}

export function getEffectiveLlamaCppBackend(
  backend?: LlamaCppBackend,
  platform = process.platform,
): LlamaCppBackend {
  const normalized = normalizeLlamaCppBackend(backend);
  if (normalized === "auto") {
    return getDefaultLlamaCppBackend(platform);
  }
  return normalized;
}

export function getLlamaCppBackendAssetName(
  tag: string,
  backend: LlamaCppBackend,
  platform = process.platform,
  arch = process.arch,
): string | null {
  const effectiveBackend = getEffectiveLlamaCppBackend(backend, platform);

  if (platform === "linux") {
    if (arch === "arm64") {
      if (effectiveBackend === "vulkan") {
        return `llama-${tag}-bin-ubuntu-vulkan-arm64.tar.gz`;
      }
      if (effectiveBackend === "cpu") {
        return `llama-${tag}-bin-ubuntu-arm64.tar.gz`;
      }
      return null;
    }

    if (arch !== "x64") {
      return null;
    }

    if (effectiveBackend === "rocm") {
      return `llama-${tag}-bin-ubuntu-rocm-7.2-x64.tar.gz`;
    }
    if (effectiveBackend === "vulkan") {
      return `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz`;
    }
    if (effectiveBackend === "cpu") {
      return `llama-${tag}-bin-ubuntu-x64.tar.gz`;
    }
    return null;
  }

  if (platform === "darwin") {
    if (effectiveBackend === "rocm" || effectiveBackend === "vulkan") {
      return null;
    }
    if (arch === "arm64") {
      return `llama-${tag}-bin-macos-arm64.tar.gz`;
    }
    if (arch === "x64") {
      return `llama-${tag}-bin-macos-x64.tar.gz`;
    }
    return null;
  }

  if (platform === "win32") {
    if (arch !== "x64") {
      return effectiveBackend === "cpu"
        ? `llama-${tag}-bin-win-cpu-arm64.zip`
        : null;
    }
    if (effectiveBackend === "rocm") {
      return `llama-${tag}-bin-win-hip-radeon-x64.zip`;
    }
    if (effectiveBackend === "vulkan") {
      return `llama-${tag}-bin-win-vulkan-x64.zip`;
    }
    if (effectiveBackend === "cpu") {
      return `llama-${tag}-bin-win-cpu-x64.zip`;
    }
  }

  return null;
}
