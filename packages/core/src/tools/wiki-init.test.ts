/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Config } from "../config/config.js";
import { WikiInitTool } from "./wiki-init.js";

describe("WikiInitTool", () => {
  let tempRootDir: string;
  let wikiTool: WikiInitTool;
  const abortSignal = new AbortController().signal;

  // Mock config for testing
  function createMockConfig(rootDir: string): Config {
    return {
      getTargetDir: () => rootDir,
      getApprovalMode: () => "auto_edit" as any,
      setApprovalMode: () => {},
    } as unknown as Config;
  }

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-init-test-"));
    wikiTool = new WikiInitTool(createMockConfig(tempRootDir));
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe("tool metadata", () => {
    it("should have correct name and display name", () => {
      expect(wikiTool.name).toBe("wiki_init");
      expect(wikiTool.displayName).toBe("WikiInit");
    });

    it("should have a descriptive description", () => {
      expect(wikiTool.description).toContain("wiki");
      expect(wikiTool.description.toLowerCase()).toContain("initialize");
    });

    it("should have an empty required params array", () => {
      expect(
        (wikiTool.schema.parametersJsonSchema as any).required,
      ).toEqual([]);
    });
  });

  describe("validateToolParamValues", () => {
    it("should pass validation with no params", () => {
      const error = wikiTool.validateToolParams({});
      expect(error).toBeNull();
    });

    it("should pass validation with gitignore param", () => {
      const error = wikiTool.validateToolParams({ gitignore: true });
      expect(error).toBeNull();
    });

    it("should pass validation with gitignore false", () => {
      const error = wikiTool.validateToolParams({ gitignore: false });
      expect(error).toBeNull();
    });
  });

  describe("execute", () => {
    it("should create the full directory structure", async () => {
      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      // Check all expected directories exist
      const expectedDirs = [
        ".lowcal/wiki",
        ".lowcal/wiki/entities",
        ".lowcal/wiki/concepts",
        ".lowcal/wiki/comparisons",
        ".lowcal/wiki/syntheses",
        ".lowcal/raw",
      ];

      for (const dir of expectedDirs) {
        const stat = await fs.stat(path.join(tempRootDir, dir));
        expect(stat.isDirectory()).toBe(true);
      }
    });

    it("should create index.md with default content", async () => {
      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const indexPath = path.join(tempRootDir, ".lowcal/wiki/index.md");
      const content = await fs.readFile(indexPath, "utf-8");

      expect(content).toContain("# Wiki Index");
      expect(content).toContain("## Entities");
      expect(content).toContain("## Concepts");
      expect(content).toContain("## Comparisons");
      expect(content).toContain("## Syntheses");
    });

    it("should create log.md with initial entry", async () => {
      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const logPath = path.join(tempRootDir, ".lowcal/wiki/log.md");
      const content = await fs.readFile(logPath, "utf-8");

      expect(content).toContain("# Wiki Log");
      expect(content).toContain("wiki_init");
    });

    it("should create LOWCAL.md with wiki schema if it does not exist", async () => {
      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const lowcalPath = path.join(tempRootDir, "LOWCAL.md");
      const content = await fs.readFile(lowcalPath, "utf-8");

      expect(content).toContain("## Wiki Configuration");
      expect(content).toContain("Directory Structure");
      expect(content).toContain("Wiki Maintenance Rules");
    });

    it("should append wiki schema to existing LOWCAL.md", async () => {
      // Create an existing LOWCAL.md with some content
      const lowcalPath = path.join(tempRootDir, "LOWCAL.md");
      await fs.writeFile(lowcalPath, "# My Project\n\nSome existing content.\n");

      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const content = await fs.readFile(lowcalPath, "utf-8");

      // Original content preserved
      expect(content).toContain("# My Project");
      expect(content).toContain("Some existing content.");
      // Wiki schema appended
      expect(content).toContain("## Wiki Configuration");
    });

    it("should not duplicate wiki schema if already present in LOWCAL.md", async () => {
      // Create an existing LOWCAL.md that already has the wiki section
      const lowcalPath = path.join(tempRootDir, "LOWCAL.md");
      await fs.writeFile(
        lowcalPath,
        "# My Project\n\n## Wiki Configuration\nExisting wiki rules.\n",
      );

      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const content = await fs.readFile(lowcalPath, "utf-8");

      // Should only have one instance of the section header
      const matches = content.match(/## Wiki Configuration/g);
      expect(matches).toHaveLength(1);
    });

    it("should add .lowcal/ to .gitignore by default", async () => {
      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const gitignorePath = path.join(tempRootDir, ".gitignore");
      const content = await fs.readFile(gitignorePath, "utf-8");

      expect(content).toContain(".lowcal/");
    });

    it("should append .lowcal/ to existing .gitignore", async () => {
      // Create an existing .gitignore
      const gitignorePath = path.join(tempRootDir, ".gitignore");
      await fs.writeFile(gitignorePath, "node_modules/\ndist/\n");

      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const content = await fs.readFile(gitignorePath, "utf-8");

      expect(content).toContain("node_modules/");
      expect(content).toContain("dist/");
      expect(content).toContain(".lowcal/");
    });

    it("should not duplicate .lowcal/ in existing .gitignore", async () => {
      // Create an existing .gitignore that already has .lowcal/
      const gitignorePath = path.join(tempRootDir, ".gitignore");
      await fs.writeFile(gitignorePath, "node_modules/\n.lowcal/\n");

      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const content = await fs.readFile(gitignorePath, "utf-8");

      const matches = content.match(/\.lowcal\//g);
      expect(matches).toHaveLength(1);
    });

    it("should skip .gitignore update when gitignore param is false", async () => {
      const invocation = wikiTool.build({ gitignore: false });
      await invocation.execute(abortSignal);

      // .gitignore should not be created
      try {
        await fs.access(path.join(tempRootDir, ".gitignore"));
        expect(true).toBe(false); // Should not reach here
      } catch {
        // Expected - file does not exist
      }
    });

    it("should return success message with created paths", async () => {
      const invocation = wikiTool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain("Wiki initialized successfully");
      expect(result.llmContent).toContain(".lowcal/wiki/");
      expect(result.returnDisplay).toContain("Wiki initialized");
    });

    it("should report wiki already exists when re-initializing", async () => {
      // First initialization
      const invocation1 = wikiTool.build({});
      await invocation1.execute(abortSignal);

      // Second initialization should detect existing wiki
      const invocation2 = wikiTool.build({});
      const result = await invocation2.execute(abortSignal);

      expect(result.llmContent).toContain("already initialized");
      expect(result.returnDisplay).toContain("already exists");
    });
  });

  describe("getDescription", () => {
    it("should return a description with the target directory", () => {
      const invocation = wikiTool.build({});
      const desc = invocation.getDescription();
      expect(desc).toContain("Initialize LowCal wiki");
    });
  });

  describe("toolLocations", () => {
    it("should return the wiki root and LOWCAL.md paths", () => {
      const invocation = wikiTool.build({});
      const locations = invocation.toolLocations();

      expect(locations).toHaveLength(2);
      expect(locations[0].path).toBe(path.join(tempRootDir, ".lowcal"));
      expect(locations[1].path).toBe(path.join(tempRootDir, "LOWCAL.md"));
    });
  });
});
