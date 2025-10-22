/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return actual;
});

import { promptCommand } from "./promptCommand.js";

describe("promptCommand", () => {
  it("should have the correct name and description", () => {
    expect(promptCommand.name).toBe("prompt");
    expect(promptCommand.description).toBe(
      "Create, manage, and use custom system prompts",
    );
  });

  it("should have an action function", () => {
    expect(promptCommand.action).toBeDefined();
    expect(typeof promptCommand.action).toBe("function");
  });
});
