/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskTemplateManager } from "./manager.js";

describe("TaskTemplateManager systemPrompt persistence", () => {
  let projectRoot = "";

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "task-template-"));
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it("round-trips systemPrompt prompt names across save and reload", async () => {
    const manager = new TaskTemplateManager(projectRoot);
    await manager.createTemplate(
      {
        id: "doc-review",
        level: "project",
        filePath: "",
        prompt: "Review docs",
        action: {
          type: "prompt",
          value: "Review docs",
        },
        systemPrompt: {
          names: ["darrin", "security"],
          exclusive: false,
        },
      },
      {
        level: "project",
        overwrite: true,
      },
    );

    const resolved = await manager.resolveTemplate("doc-review", {
      level: "project",
    });

    expect(resolved?.systemPrompt).toEqual({
      names: ["darrin", "security"],
      exclusive: false,
    });
  });

  it("round-trips approvalMode across save and reload", async () => {
    const manager = new TaskTemplateManager(projectRoot);
    await manager.createTemplate(
      {
        id: "approval-template",
        level: "project",
        filePath: "",
        prompt: "Run checks",
        action: {
          type: "prompt",
          value: "Run checks",
        },
        approvalMode: "auto-edit",
      },
      {
        level: "project",
        overwrite: true,
      },
    );

    const resolved = await manager.resolveTemplate("approval-template", {
      level: "project",
    });

    expect(resolved?.approvalMode).toBe("auto-edit");
  });

  it("preserves multiline prompt action values across save and reload", async () => {
    const manager = new TaskTemplateManager(projectRoot);
    const multilinePrompt = "line 1\nline 2\nline 3";

    await manager.createTemplate(
      {
        id: "multi-line-prompt",
        level: "project",
        filePath: "",
        prompt: multilinePrompt,
        action: {
          type: "prompt",
          value: multilinePrompt,
        },
      },
      {
        level: "project",
        overwrite: true,
      },
    );

    const resolved = await manager.resolveTemplate("multi-line-prompt", {
      level: "project",
    });

    expect(resolved?.prompt).toBe(multilinePrompt);
    expect(resolved?.action?.type).toBe("prompt");
    expect(resolved?.action?.value).toBe(multilinePrompt);
  });

  it("prefers prompt body for prompt action value when frontmatter is truncated", async () => {
    const manager = new TaskTemplateManager(projectRoot);
    const templatePath = manager.getTemplatePath("broken-template", "project");
    await fs.mkdir(path.dirname(templatePath), { recursive: true });
    await fs.writeFile(
      templatePath,
      `---
id: broken-template
action:
  type: prompt
  value: line 1
---

line 1
line 2
line 3
`,
      "utf8",
    );

    const resolved = await manager.resolveTemplate("broken-template", {
      level: "project",
    });

    expect(resolved?.prompt).toBe("line 1\nline 2\nline 3");
    expect(resolved?.action?.type).toBe("prompt");
    expect(resolved?.action?.value).toBe("line 1\nline 2\nline 3");
  });
});
