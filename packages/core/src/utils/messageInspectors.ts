/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from "@google/genai";

export function hasFunctionResponse(content: Content): boolean {
  return (
    content.role === "user" &&
    !!content.parts &&
    content.parts.some((part) => !!part.functionResponse)
  );
}

export function isFunctionResponse(content: Content): boolean {
  return hasFunctionResponse(content);
}

export function isFunctionCall(content: Content): boolean {
  return (
    content.role === "model" &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionCall)
  );
}
