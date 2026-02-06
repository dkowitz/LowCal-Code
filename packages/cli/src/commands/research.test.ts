/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { researchCommand } from "./research.js";

describe("researchCommand", () => {
  it("should be defined with correct properties", () => {
    expect(researchCommand).toBeDefined();
    expect(researchCommand.command).toBe("research [mode] <query>");
    expect(researchCommand.describe).toContain(
      "Conduct deep internet research",
    );

    // Check that handler is a function
    if (researchCommand.handler) {
      expect(typeof researchCommand.handler).toBe("function");
    } else {
      expect.fail("Research command should have a handler property");
    }
  });
});
