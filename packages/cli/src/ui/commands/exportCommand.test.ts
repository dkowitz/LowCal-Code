/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { exportCommand } from "./exportCommand.js";

describe("exportCommand", () => {
  it("should have the correct name and a helpful description", () => {
    expect(exportCommand.name).toBe("export");
    expect(typeof exportCommand.description).toBe("string");
    expect(exportCommand.description).toContain(
      "save the current conversation",
    );
  });
});
