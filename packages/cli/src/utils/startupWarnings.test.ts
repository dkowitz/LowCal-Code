/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getStartupWarnings } from "./startupWarnings.js";
import { getErrorMessage } from "@qwen-code/qwen-code-core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getErrorMessage: vi.fn(),
  };
});

describe("startupWarnings", () => {
  const warningsFilePath = path.join(os.tmpdir(), "qwen-code-warnings.txt");
  let originalWarningsContent: string | undefined;

  beforeAll(async () => {
    try {
      originalWarningsContent = await fs.readFile(warningsFilePath, "utf-8");
    } catch {
      originalWarningsContent = undefined;
    }
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(warningsFilePath, { force: true });
  });

  afterAll(async () => {
    if (originalWarningsContent !== undefined) {
      await fs.writeFile(warningsFilePath, originalWarningsContent, "utf-8");
    } else {
      await fs.rm(warningsFilePath, { force: true });
    }
  });

  it("should return warnings from the file and delete it", async () => {
    await fs.writeFile(warningsFilePath, "Warning 1\nWarning 2\n", "utf-8");

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual(["Warning 1", "Warning 2"]);
    await expect(fs.access(warningsFilePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("should return an empty array if the file does not exist", async () => {
    const warnings = await getStartupWarnings();
    expect(warnings).toEqual([]);
  });

  it("should return an error message if checking the file fails", async () => {
    const error = new Error("Permission denied");
    vi.spyOn(fs, "access").mockRejectedValueOnce(error);
    vi.mocked(getErrorMessage).mockReturnValue("Permission denied");

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual([
      "Error checking/reading warnings file: Permission denied",
    ]);
  });

  it("should return a warning if deleting the file fails", async () => {
    await fs.writeFile(warningsFilePath, "Warning 1\n", "utf-8");
    vi.spyOn(fs, "unlink").mockRejectedValueOnce(new Error("Permission denied"));

    const warnings = await getStartupWarnings();

    expect(warnings).toEqual([
      "Warning 1",
      "Warning: Could not delete temporary warnings file.",
    ]);
  });
});
