/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { SearXNGSearchTool } from "./searxng-search.js";

describe("SearXNGSearchTool", () => {
  describe("construction", () => {
    it("should create a valid tool instance", () => {
      // We'll create a mock config instance for testing
      const mockConfig = {
        getTavilyApiKey: vi.fn(),
        getApprovalMode: vi.fn(),
        setApprovalMode: vi.fn(),
      };

      const tool = new SearXNGSearchTool(mockConfig as any);
      expect(tool).toBeDefined();
      // Check that the static name property is correct
      expect(SearXNGSearchTool.Name).toBe("searxng_search");
    });
  });
});
