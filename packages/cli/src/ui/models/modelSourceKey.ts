/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from "@qwen-code/qwen-code-core";

interface ModelSourceDescriptor {
  authType?: AuthType;
  providerId?: string;
  baseUrl?: string;
}

function normalizeBaseUrl(url?: string): string {
  if (!url) return "";
  // Remove any trailing slashes to avoid treating equivalent URLs as different
  return url.replace(/\/+$/, "");
}

export function createModelSourceKey(
  descriptor: ModelSourceDescriptor,
): string {
  const authType = descriptor.authType ?? "unknown";
  const providerId = descriptor.providerId ?? "unscoped";

  if (authType === AuthType.USE_OPENAI) {
    const baseUrl = normalizeBaseUrl(descriptor.baseUrl);
    return `${authType}|${providerId}|${baseUrl}`;
  }

  return `${authType}|${providerId}`;
}
