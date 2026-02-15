/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";
import type { Config } from "../config/config.js";
import { FileDiscoveryService } from "../services/fileDiscoveryService.js";
import { StandardFileSystemService } from "../services/fileSystemService.js";
import { createMockWorkspaceContext } from "../test-utils/mockWorkspaceContext.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import type { ReadImageToolParams } from "./read-image.js";
import { ReadImageTool } from "./read-image.js";

vi.mock("../telemetry/loggers.js", () => ({
  logFileOperation: vi.fn(),
}));

describe("ReadImageTool", () => {
  let tempRootDir: string;
  let tool: ReadImageTool;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    tempRootDir = await fsp.mkdtemp(path.join(os.tmpdir(), "read-image-tool-"));

    const mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getFileSystemService: () => new StandardFileSystemService(),
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    } as unknown as Config;
    tool = new ReadImageTool(mockConfigInstance);
  });

  afterEach(async () => {
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it("should throw if path is relative", () => {
    expect(() =>
      tool.build({
        absolute_path: "assets/photo.jpg",
      }),
    ).toThrow(
      "File path must be absolute, but was relative: assets/photo.jpg. You must provide an absolute path.",
    );
  });

  it("should return an error if file is not an image", async () => {
    const filePath = path.join(tempRootDir, "notes.txt");
    await fsp.writeFile(filePath, "hello world", "utf8");

    const invocation = tool.build({
      absolute_path: filePath,
    }) as ToolInvocation<ReadImageToolParams, ToolResult>;
    const result = await invocation.execute(abortSignal);

    expect(result.error?.type).toBe(ToolErrorType.INVALID_TOOL_PARAMS);
    expect(result.returnDisplay).toContain("Not an image file");
    expect(String(result.llmContent)).toContain("not an image");
  });

  it("should return inline image data when file is an image", async () => {
    const pngPath = path.join(tempRootDir, "pixel.png");
    const onePixelPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5nZx8AAAAASUVORK5CYII=";
    await fsp.writeFile(pngPath, Buffer.from(onePixelPngBase64, "base64"));

    const invocation = tool.build({
      absolute_path: pngPath,
    }) as ToolInvocation<ReadImageToolParams, ToolResult>;
    const result = await invocation.execute(abortSignal);

    expect(Array.isArray(result.llmContent)).toBe(true);
    const parts = result.llmContent as Array<{
      text?: string;
      inlineData?: { data: string; mimeType: string };
    }>;
    expect(parts[0]?.text).toContain("Image loaded from");
    expect(parts[1]?.inlineData?.mimeType).toContain("image/");
    expect(parts[1]?.inlineData?.data?.length).toBeGreaterThan(0);
  });
});
