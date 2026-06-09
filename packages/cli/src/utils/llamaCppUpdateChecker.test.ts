/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import type { LlamaCppBackend } from "@qwen-code/qwen-code-core";
import type { LlamaCppUpdateInfo } from "./llamaCppUpdateChecker.js";

vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@qwen-code/qwen-code-core")>();
  const backends = ["auto", "vulkan", "rocm", "cpu", "custom"];
  const normalizeLlamaCppBackend = (value: unknown): LlamaCppBackend => {
    if (typeof value !== "string") return "auto";
    const normalized = value.trim().toLowerCase();
    return backends.includes(normalized)
      ? (normalized as LlamaCppBackend)
      : "auto";
  };
  const getDefaultLlamaCppBackend = (platform = process.platform) => {
    if (platform === "linux") return "vulkan";
    if (platform === "win32") return "cpu";
    return "auto";
  };
  const getEffectiveLlamaCppBackend = (
    backend?: LlamaCppBackend,
    platform = process.platform,
  ) => {
    const normalized = normalizeLlamaCppBackend(backend);
    return normalized === "auto"
      ? getDefaultLlamaCppBackend(platform)
      : normalized;
  };
  const getLlamaCppBackendAssetName = (
    tag: string,
    backend: LlamaCppBackend,
    platform = process.platform,
    arch = process.arch,
  ) => {
    const effectiveBackend = getEffectiveLlamaCppBackend(backend, platform);
    if (platform === "linux" && arch === "x64") {
      if (effectiveBackend === "rocm") {
        return `llama-${tag}-bin-ubuntu-rocm-7.2-x64.tar.gz`;
      }
      if (effectiveBackend === "vulkan") {
        return `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz`;
      }
      if (effectiveBackend === "cpu") {
        return `llama-${tag}-bin-ubuntu-x64.tar.gz`;
      }
    }
    if (platform === "darwin" && arch === "x64") {
      return `llama-${tag}-bin-macos-x64.tar.gz`;
    }
    return null;
  };

  return {
    ...actual,
    getEffectiveLlamaCppBackend,
    getLlamaCppBackendAssetName,
    normalizeLlamaCppBackend,
  };
});

let checkForLlamaCppUpdate: (
  force?: boolean,
  requestedBackend?: LlamaCppBackend,
) => Promise<LlamaCppUpdateInfo | null>;

const realCache = path.resolve(
  os.homedir(),
  ".qwen/llama-cpp-update-cache.json",
);
let tempBinDir: string;

function markerPath(): string {
  return path.join(tempBinDir, ".llama-cpp-version");
}

function cleanupFiles() {
  try {
    if (tempBinDir) {
      fs.rmSync(tempBinDir, { recursive: true, force: true });
    }
  } catch {
    // Best effort cleanup.
  }
  try {
    fs.unlinkSync(realCache);
  } catch {
    // Best effort cleanup.
  }
}

describe("checkForLlamaCppUpdate", () => {
  beforeEach(async () => {
    cleanupFiles();
    tempBinDir = fs.mkdtempSync(path.join(os.tmpdir(), "llamacpp-bin-test-"));
    process.env["LLAMA_CPP_BIN_DIR"] = tempBinDir;
    // default platform
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "x64",
      writable: true,
      configurable: true,
    });

    // default fetch mock
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          tag_name: "b9200",
          html_url: "https://github.com/ggml-org/llama.cpp/releases/tag/b9200",
          assets: [
            { name: "llama-b9200-bin-ubuntu-vulkan-x64.tar.gz" },
            { name: "llama-b9200-bin-ubuntu-rocm-7.2-x64.tar.gz" },
            { name: "llama-b9200-bin-macos-x64.tar.gz" },
          ],
        }),
      }) as Response;

    ({ checkForLlamaCppUpdate } = await import("./llamaCppUpdateChecker.js"));
  });

  afterEach(() => {
    cleanupFiles();
    delete process.env["LLAMA_CPP_BIN_DIR"];
  });

  it("should return null for custom backend", async () => {
    const result = await checkForLlamaCppUpdate(false, "custom");
    expect(result).toBeNull();
  });

  it("should return update info when no version marker exists", async () => {
    const result = await checkForLlamaCppUpdate();
    expect(result).not.toBeNull();
    expect(result?.currentTag).toBe("not installed");
  });

  it("should return update info when a newer version is available", async () => {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), "b9159");

    const result = await checkForLlamaCppUpdate();
    expect(result).not.toBeNull();
    expect(result?.latestTag).toBe("b9200");
    expect(result?.currentTag).toBe("b9159");
  });

  it("should return null when versions match", async () => {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), "b9200");
    // fetch returns b9200
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({
          tag_name: "b9200",
          html_url: "",
          assets: [{ name: "llama-b9200-bin-ubuntu-vulkan-x64.tar.gz" }],
        }),
      }) as Response;

    const result = await checkForLlamaCppUpdate();
    expect(result).toBeNull();
  });

  it("should return null when fetch returns non-OK", async () => {
    global.fetch = async () => ({ ok: false, status: 404 }) as Response;
    const result = await checkForLlamaCppUpdate();
    expect(result).toBeNull();
  });

  it("should return null when fetch throws", async () => {
    global.fetch = async () => {
      throw new Error("Network error");
    };
    const result = await checkForLlamaCppUpdate();
    expect(result).toBeNull();
  });

  it("should return cached update info when within 24-hour window", async () => {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), "b9159");
    fs.mkdirSync(path.dirname(realCache), { recursive: true });
    fs.writeFileSync(
      realCache,
      JSON.stringify({
        latestTag: "b9200",
        backend: "vulkan",
        assetName: "llama-b9200-bin-ubuntu-vulkan-x64.tar.gz",
        releaseUrl: "https://github.com/ggml-org/llama.cpp/releases/tag/b9200",
        checkedAt: Date.now() - 1000 * 60 * 60, // 1 hour
        platformKey: "linux-x64",
      }),
    );

    const result = await checkForLlamaCppUpdate();
    expect(result).not.toBeNull();
    expect(result?.latestTag).toBe("b9200");
    expect(result?.currentTag).toBe("b9159");
    expect(result?.assetName).toBe("llama-b9200-bin-ubuntu-vulkan-x64.tar.gz");
  });

  it("should suppress a fresh cache entry when the tag was dismissed", async () => {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), "b9159");
    fs.mkdirSync(path.dirname(realCache), { recursive: true });
    fs.writeFileSync(
      realCache,
      JSON.stringify({
        latestTag: "b9200",
        backend: "vulkan",
        assetName: "llama-b9200-bin-ubuntu-vulkan-x64.tar.gz",
        dismissedTag: "b9200",
        checkedAt: Date.now() - 1000 * 60 * 60,
        platformKey: "linux-x64",
      }),
    );

    const result = await checkForLlamaCppUpdate();
    expect(result).toBeNull();
  });

  it("should not use cache when platform key differs", async () => {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), "b9159");
    fs.mkdirSync(path.dirname(realCache), { recursive: true });
    fs.writeFileSync(
      realCache,
      JSON.stringify({
        latestTag: "b9200",
        checkedAt: Date.now() - 1,
        platformKey: "darwin-arm64",
      }),
    );

    Object.defineProperty(process, "platform", {
      value: "darwin",
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "x64",
      writable: true,
      configurable: true,
    });

    const result = await checkForLlamaCppUpdate();
    expect(result).not.toBeNull();
  });

  it("should return null when cache is fresh and current matches latest", async () => {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), "b9159");
    fs.mkdirSync(path.dirname(realCache), { recursive: true });
    fs.writeFileSync(
      realCache,
      JSON.stringify({
        latestTag: "b9159",
        checkedAt: Date.now() - 1000 * 60 * 60,
        platformKey: "linux-x64",
      }),
    );

    const result = await checkForLlamaCppUpdate();
    expect(result).toBeNull();
  });
});
