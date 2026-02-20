/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  TeamManifestError,
  loadTeamManifestFromFile,
  parseTeamManifest,
} from "./manifest-loader.js";

describe("manifest-loader", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "team-manifest-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("parses a valid team manifest", () => {
    const manifest = parseTeamManifest(`
version: "1.0"
id: research-team
name: Research Team
description: Multi-agent research
agents:
  - id: researcher-alpha
    role: researcher
    model: gemini-2.0-flash
    instructions: |
      Find relevant sources.
      Summarize findings.
channels:
  - name: "#general"
    history: shared
shared_context:
  - type: variable
    name: topic
    value: "Comms security"
execution:
  mode: headless
  timeout_minutes: 30
orchestrator:
  prompt: Delegate to researchers first, then coders.
`);

    expect(manifest.id).toBe("research-team");
    expect(manifest.agents).toHaveLength(1);
    expect(manifest.channels).toHaveLength(1);
    expect(manifest.execution?.mode).toBe("headless");
    expect(manifest.orchestrator?.prompt).toContain("Delegate to researchers first");
    expect(manifest.agents[0]?.instructions).toContain("Find relevant sources.");
  });

  it("rejects agent role orchestrator", () => {
    expect(() =>
      parseTeamManifest(`
version: "1.0"
id: bad-team
name: Bad Team
agents:
  - id: worker-1
    role: orchestrator
channels:
  - name: "#general"
    history: shared
`),
    ).toThrow(TeamManifestError);
  });

  it("rejects restricted channels with missing members", () => {
    expect(() =>
      parseTeamManifest(`
version: "1.0"
id: bad-team
name: Bad Team
agents:
  - id: worker-1
    role: researcher
channels:
  - name: "#private"
    visibility: restricted
    history: shared
`),
    ).toThrow(TeamManifestError);
  });

  it("parses restricted channels with valid members", () => {
    const manifest = parseTeamManifest(`
version: "1.0"
id: comms-team
name: Comms Team
agents:
  - id: worker-1
    role: researcher
channels:
  - name: "#private"
    visibility: restricted
    members:
      - worker-1
      - orchestrator
    history: shared
`);

    expect(manifest.channels[0]?.visibility).toBe("restricted");
    expect(manifest.channels[0]?.members).toContain("worker-1");
  });

  it("rejects unknown channel members", () => {
    expect(() =>
      parseTeamManifest(`
version: "1.0"
id: bad-members
name: Bad Members
agents:
  - id: worker-1
    role: researcher
channels:
  - name: "#private"
    visibility: restricted
    members:
      - worker-1
      - unknown-agent
    history: shared
`),
    ).toThrow(TeamManifestError);
  });

  it("loads manifest from file", async () => {
    const manifestPath = path.join(tempDir, "team.yaml");
    await fs.writeFile(
      manifestPath,
      `
version: "1.0"
id: file-team
name: File Team
agents:
  - id: writer-1
    role: writer
channels:
  - name: "#general"
    history: shared
`,
      "utf-8",
    );

    const manifest = await loadTeamManifestFromFile(manifestPath);
    expect(manifest.id).toBe("file-team");
  });
});
