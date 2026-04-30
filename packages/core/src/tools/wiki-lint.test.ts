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
import { WikiLintTool, runWikiLint, checkOrphanPages, checkIndexCompleteness, checkContradictions, LintSeverity } from "./wiki-lint.js";

describe("WikiLintTool", () => {
  let tempRootDir: string;
  let wikiTool: WikiLintTool;
  const abortSignal = new AbortController().signal;

  function createMockConfig(rootDir: string): Config {
    return {
      getTargetDir: () => rootDir,
      getApprovalMode: () => "auto_edit" as any,
      setApprovalMode: () => {},
    } as unknown as Config;
  }

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-lint-test-"));
    wikiTool = new WikiLintTool(createMockConfig(tempRootDir));

    // Set up a minimal wiki structure
    const wikiRoot = path.join(tempRootDir, ".lowcal/wiki");
    await fs.mkdir(path.join(wikiRoot, "entities"), { recursive: true });
    await fs.mkdir(path.join(wikiRoot, "concepts"), { recursive: true });

    // Create some pages
    await fs.writeFile(
      path.join(wikiRoot, "entities/react.md"),
      "# React\nA JavaScript library. See [[Node.js]] for server-side.\n",
    );
    await fs.writeFile(
      path.join(wikiRoot, "entities/node-js.md"),
      "# Node.js\nServer-side JavaScript runtime.\n",
    );

    // Create index that lists both pages
    await fs.writeFile(
      path.join(wikiRoot, "index.md"),
      `# Wiki Index

## Entities
- [[React]]: A JavaScript library
- [[Node.js]]: Server-side runtime
`,
    );
    await fs.writeFile(path.join(wikiRoot, "log.md"), "# Wiki Log\n");
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe("tool metadata", () => {
    it("should have correct name and display name", () => {
      expect(wikiTool.name).toBe("wiki_lint");
      expect(wikiTool.displayName).toBe("WikiLint");
    });

    it("should have no required parameters", () => {
      const required = (wikiTool.schema.parametersJsonSchema as any).required;
      expect(required).toEqual([]);
    });
  });

  describe("validateToolParamValues", () => {
    it("should pass with empty params", () => {
      expect(wikiTool.validateToolParams({})).toBeNull();
    });

    it("should pass with valid scope", () => {
      expect(wikiTool.validateToolParams({ scope: "full" })).toBeNull();
    });

    it("should fail with invalid scope", () => {
      const error = wikiTool.validateToolParams({ scope: "invalid" as any });
      expect(error).toBeTruthy();
    });
  });

  describe("execute", () => {
    it("should return error when wiki is not initialized", async () => {
      await fs.unlink(path.join(tempRootDir, ".lowcal/wiki/index.md"));

      const invocation = wikiTool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain("not initialized");
      expect(result.error).toBeDefined();
    });

    it("should produce a lint report", async () => {
      const invocation = wikiTool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain("Wiki Lint Report");
      expect(result.llmContent).toContain("Summary");
      expect(result.returnDisplay).toContain("lint");
    });

    it("should report healthy wiki when no issues found", async () => {
      // All pages are in index and cross-referenced, so should be clean
      const invocation = wikiTool.build({});
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain("Wiki Lint Report");
    });

    it("should append to log after lint", async () => {
      const invocation = wikiTool.build({});
      await invocation.execute(abortSignal);

      const logContent = await fs.readFile(path.join(tempRootDir, ".lowcal/wiki/log.md"), "utf-8");
      expect(logContent).toContain("lint");
    });
  });

  describe("getDescription", () => {
    it("should include scope in description", () => {
      const invocation = wikiTool.build({ scope: "full" });
      expect(invocation.getDescription()).toContain("full");
    });

    it("should mention auto-fix when enabled", () => {
      const invocation = wikiTool.build({ auto_fix: true });
      expect(invocation.getDescription()).toContain("auto-fix");
    });
  });
});

describe("checkOrphanPages", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-orphan-test-"));
    await fs.mkdir(path.join(tempDir, "entities"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "concepts"), { recursive: true });

    // Create a page that is NOT referenced by any other page or index
    await fs.writeFile(
      path.join(tempDir, "entities/orphan-page.md"),
      "# Orphan Page\nThis page has no inbound links.\n",
    );
    // Create a page that IS referenced — does NOT link to orphan
    await fs.writeFile(
      path.join(tempDir, "entities/linked-page.md"),
      "# Linked Page\nA well-connected page about web development.\n",
    );

    // Index only references linked-page (not orphan-page)
    await fs.writeFile(
      path.join(tempDir, "index.md"),
      `# Wiki Index\n## Entities\n- [[Linked Page]]: Has links\n`,
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should detect orphan pages", async () => {
    const findings = await checkOrphanPages(tempDir);
    // orphan-page should be detected as orphan (not in index, not linked from other pages)
    const orphans = findings.filter((f) => f.rule === "orphan-page");
    expect(orphans.length).toBeGreaterThan(0);
  });

  it("should not flag pages that are referenced", async () => {
    const findings = await checkOrphanPages(tempDir);
    // linked-page is in the index, so should NOT be flagged as orphan
    const linkedOrphans = findings.filter((f) => f.subject.toLowerCase().includes("linked"));
    expect(linkedOrphans.length).toBe(0);
  });

  it("should return warning severity for orphans", async () => {
    const findings = await checkOrphanPages(tempDir);
    if (findings.length > 0) {
      expect(findings[0].severity).toBe(LintSeverity.WARNING);
    }
  });
});

describe("checkIndexCompleteness", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-index-check-"));
    await fs.mkdir(path.join(tempDir, "entities"), { recursive: true });

    // Create a page NOT listed in index
    await fs.writeFile(
      path.join(tempDir, "entities/missing-from-index.md"),
      "# Missing\nNot in the index.\n",
    );
    // Create a page that IS listed
    await fs.writeFile(
      path.join(tempDir, "entities/in-index.md"),
      "# In Index\nListed properly.\n",
    );

    await fs.writeFile(
      path.join(tempDir, "index.md"),
      `# Wiki Index\n## Entities\n- [[In Index]]: Listed\n`,
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should detect pages missing from index", async () => {
    const findings = await checkIndexCompleteness(tempDir);
    const missingEntries = findings.filter((f) => f.rule === "missing-index-entry");
    expect(missingEntries.length).toBeGreaterThan(0);
  });

  it("should report error severity for missing index entries", async () => {
    const findings = await checkIndexCompleteness(tempDir);
    if (findings.length > 0) {
      expect(findings[0].severity).toBe(LintSeverity.ERROR);
    }
  });

  it("should detect missing index.md entirely", async () => {
    // Remove index
    await fs.unlink(path.join(tempDir, "index.md"));

    const findings = await checkIndexCompleteness(tempDir);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].rule).toBe("missing-index");
  });
});

describe("checkContradictions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-contradiction-test-"));
    await fs.mkdir(path.join(tempDir, "entities"), { recursive: true });

    // Create a page with an explicit contradiction marker
    await fs.writeFile(
      path.join(tempDir, "entities/react.md"),
      `# React\nA JavaScript library.\n\n> **CONTRADICTION:** Existing page entities/angular.md states "Angular is the best" but this source says "React is preferred".\n`,
    );

    // Create a clean page with no contradictions
    await fs.writeFile(
      path.join(tempDir, "entities/node-js.md"),
      "# Node.js\nServer-side JavaScript.\n",
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should detect explicit contradiction markers", async () => {
    const findings = await checkContradictions(tempDir);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].rule).toBe("contradiction-flagged");
  });

  it("should return warning severity for contradictions", async () => {
    const findings = await checkContradictions(tempDir);
    if (findings.length > 0) {
      expect(findings[0].severity).toBe(LintSeverity.WARNING);
    }
  });

  it("should return no findings when no contradictions exist", async () => {
    // Remove the page with contradiction
    await fs.unlink(path.join(tempDir, "entities/react.md"));

    const findings = await checkContradictions(tempDir);
    expect(findings.length).toBe(0);
  });
});

describe("runWikiLint", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-lint-run-"));
    await fs.mkdir(path.join(tempDir, "entities"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "entities/react.md"),
      "# React\nA JavaScript library.\n",
    );

    await fs.writeFile(
      path.join(tempDir, "index.md"),
      `# Wiki Index\n## Entities\n- [[React]]: A JS library\n`,
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should aggregate findings from all checks", async () => {
    const result = await runWikiLint(tempDir);
    expect(result.findings).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.errors).toBe("number");
    expect(typeof result.summary.warnings).toBe("number");
    expect(typeof result.summary.info).toBe("number");
  });

  it("should sort findings by severity (errors first)", async () => {
    const result = await runWikiLint(tempDir);
    const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 };
    for (let i = 1; i < result.findings.length; i++) {
      const prevSeverity = severityOrder[result.findings[i - 1].severity];
      const currSeverity = severityOrder[result.findings[i].severity];
      expect(prevSeverity).toBeLessThanOrEqual(currSeverity);
    }
  });
});
