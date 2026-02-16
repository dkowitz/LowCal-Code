/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOpenAICompatibleModels,
  getLMStudioLoadedModel,
} from "./availableModels.js";

global.fetch = vi.fn();

describe("availableModels LM Studio discovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers /api/v1/models and expands variants into selectable models", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              key: "qwen3-coder-next",
              display_name: "Qwen3 Coder Next",
              type: "llm",
              quantization: { name: "Q8_K_M" },
              capabilities: { tools: true, vision: false },
              loaded_instances: [
                {
                  id: "qwen3-coder-next@q8_k_m",
                  config: { context_length: 131072 },
                },
              ],
              variants: [
                "qwen3-coder-next@q4_k_m",
                "qwen3-coder-next@q6_k",
                "qwen3-coder-next@q8_k_m",
              ],
              selected_variant: "qwen3-coder-next@q4_k_m",
            },
          ],
        }),
      ),
    );

    const models = await fetchOpenAICompatibleModels(
      "http://127.0.0.1:1234/v1",
      "lmstudio-local-key",
      { forceLmStudio: true },
    );

    expect(models).toEqual([
      {
        id: "qwen3-coder-next@q4_k_m",
        label: "Qwen3 Coder Next",
        maxContextLength: 131072,
        quantization: "q4_k_m",
        modelType: "llm",
        capabilities: ["tools"],
        state: "not-loaded",
      },
      {
        id: "qwen3-coder-next@q6_k",
        label: "Qwen3 Coder Next",
        maxContextLength: 131072,
        quantization: "q6_k",
        modelType: "llm",
        capabilities: ["tools"],
        state: "not-loaded",
      },
      {
        id: "qwen3-coder-next@q8_k_m",
        label: "Qwen3 Coder Next",
        maxContextLength: 131072,
        quantization: "q8_k_m",
        modelType: "llm",
        capabilities: ["tools"],
        state: "loaded",
      },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:1234/api/v1/models",
    );
  });

  it("falls back to /api/v0/models when /api/v1/models is unavailable", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "qwen3-coder-next-q6_k",
                name: "qwen3-coder-next-q6_k",
                max_context_length: 65536,
                quantization: "q6_k",
                state: "loaded",
                capabilities: ["tools"],
              },
            ],
          }),
        ),
      );

    const models = await fetchOpenAICompatibleModels(
      "http://localhost:1234/v1",
      "lmstudio-local-key",
      { forceLmStudio: true },
    );

    expect(models).toEqual([
      {
        id: "qwen3-coder-next-q6_k",
        label: "qwen3-coder-next-q6_k",
        maxContextLength: 65536,
        quantization: "q6_k",
        modelType: undefined,
        capabilities: ["tools"],
        state: "loaded",
      },
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe(
      "http://localhost:1234/api/v1/models",
    );
    expect(vi.mocked(global.fetch).mock.calls[1]?.[0]).toBe(
      "http://localhost:1234/api/v0/models",
    );
  });
});

describe("getLMStudioLoadedModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the loaded instance id from /api/v1/models when available", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              key: "qwen3-coder-next@q8_k_m",
              loaded_instances: [{ id: "qwen3-coder-next@q8_k_m" }],
            },
          ],
        }),
      ),
    );

    const loaded = await getLMStudioLoadedModel("http://127.0.0.1:1234/v1");

    expect(loaded).toBe("qwen3-coder-next@q8_k_m");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to /api/v0/models when /api/v1/models fails", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: "qwen3-coder-next-q4", state: "loaded" }],
          }),
        ),
      );

    const loaded = await getLMStudioLoadedModel("http://localhost:1234/v1");

    expect(loaded).toBe("qwen3-coder-next-q4");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(global.fetch).mock.calls[0]?.[0]).toBe(
      "http://localhost:1234/api/v1/models",
    );
    expect(vi.mocked(global.fetch).mock.calls[1]?.[0]).toBe(
      "http://localhost:1234/api/v0/models",
    );
  });
});
