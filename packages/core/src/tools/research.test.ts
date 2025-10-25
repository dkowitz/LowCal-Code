/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { ResearchTool } from "./research.js";

describe("ResearchTool", () => {
  it("should be defined with correct properties", () => {
    expect(ResearchTool).toBeDefined();
    expect(ResearchTool.Name).toBe("research");
    
    // Check that we can create an instance
    const tool = new ResearchTool(null as any);
    expect(tool).toBeDefined();
    expect(tool.name).toBe("research");
  });
});