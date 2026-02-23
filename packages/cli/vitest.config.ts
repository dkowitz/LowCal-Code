/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

const includeJunit = process.env.VITEST_JUNIT === "1";

export default defineConfig({
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "config.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/cypress/**"],
    environment: "jsdom",
    globals: true,
    reporters: includeJunit ? ["default", "junit"] : ["default"],
    silent: true,
    outputFile: includeJunit ? { junit: "junit.xml" } : undefined,
    setupFiles: ["./test-setup.ts"],
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
