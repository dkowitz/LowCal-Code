/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from "vitest/config";

const includeJunit = process.env.VITEST_JUNIT === "1";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/cypress/**"],
    reporters: includeJunit ? ["default", "junit"] : ["default"],
    silent: true,
    setupFiles: ["./test-setup.ts"],
    outputFile: includeJunit ? { junit: "junit.xml" } : undefined,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*"],
      reporter: [
        ["text", { file: "full-text-summary.txt" }],
        "html",
        "json",
        "lcov",
        "cobertura",
        ["json-summary", { outputFile: "coverage-summary.json" }],
      ],
    },
  },
});
