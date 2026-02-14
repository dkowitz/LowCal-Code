/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from "yargs";
import { spawn } from "node:child_process";
import * as process from "node:process";
import {
  LaunchTaskTool,
  ScheduleTaskTool,
  TaskTemplateManager,
  type TaskTemplate,
  type ToolResultDisplay,
} from "@qwen-code/qwen-code-core";

type TemplateLevel = "project" | "user" | "builtin";
type TemplateLevelWithAuto = TemplateLevel | "auto";

function parseLevelOption(
  value: unknown,
  includeAuto: boolean,
): TemplateLevelWithAuto | undefined {
  if (value === "project" || value === "user" || value === "builtin") {
    return value;
  }
  if (includeAuto && value === "auto") {
    return value;
  }
  return undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function renderToolDisplay(display: ToolResultDisplay): string {
  if (typeof display === "string") {
    return display;
  }
  return JSON.stringify(display, null, 2);
}

function formatTemplateLine(template: TaskTemplate): string {
  const parts = [`- ${template.id}`, `[${template.level}]`];
  if (template.name) {
    parts.push(`name="${template.name}"`);
  }
  if (template.description) {
    parts.push(`desc="${template.description}"`);
  }
  if (template.tags && template.tags.length > 0) {
    parts.push(`tags=${template.tags.join(",")}`);
  }
  return parts.join(" ");
}

async function launchTasksEditor(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      "The tasks editor requires an interactive terminal. Start qwen normally and run /tasks.",
    );
    process.exit(1);
    return;
  }

  const script = process.argv[1];
  if (!script) {
    console.error("Unable to locate CLI entrypoint for launching the tasks editor.");
    process.exit(1);
    return;
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [script, "--prompt-interactive", "/tasks"],
      {
        stdio: "inherit",
        env: process.env,
      },
    );

    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 0));
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

async function runTemplate(
  templateId: string,
  level: TemplateLevelWithAuto,
  runId?: string,
): Promise<void> {
  const id = runId || `${templateId}-${Date.now()}`;
  const params = {
    action: "create" as const,
    id,
    template_id: templateId,
    template_level: level,
  };

  const tool = new LaunchTaskTool();
  const result = await tool.validateBuildAndExecute(
    params,
    new AbortController().signal,
  );

  if (result.error) {
    console.error(`Failed to launch task template: ${result.error.message}`);
    process.exit(1);
    return;
  }

  console.log(renderToolDisplay(result.returnDisplay));
}

async function scheduleTemplate(
  templateId: string,
  cron: string,
  level: TemplateLevelWithAuto,
  jobId?: string,
): Promise<void> {
  const id = jobId || `${templateId}-schedule`;
  const params = {
    action: "create" as const,
    id,
    schedule: cron,
    template_id: templateId,
    template_level: level,
  };

  const tool = new ScheduleTaskTool();
  const result = await tool.validateBuildAndExecute(
    params,
    new AbortController().signal,
  );

  if (result.error) {
    console.error(`Failed to schedule task template: ${result.error.message}`);
    process.exit(1);
    return;
  }

  console.log(renderToolDisplay(result.returnDisplay));
}

const openCommand: CommandModule = {
  command: "open",
  describe: "Open the interactive task template editor",
  handler: async () => {
    await launchTasksEditor();
  },
};

const listCommand: CommandModule = {
  command: "list",
  describe: "List task templates",
  builder: (yargs) =>
    yargs
      .option("level", {
        type: "string",
        choices: ["project", "user", "builtin"],
        description: "Filter templates by level",
      })
      .option("tag", {
        type: "string",
        description: "Filter templates by exact tag",
      }),
  handler: async (argv) => {
    const manager = new TaskTemplateManager(process.cwd());
    const level = parseLevelOption(argv["level"], false) as
      | TemplateLevel
      | undefined;
    const tag = asNonEmptyString(argv["tag"]);

    const templates = await manager.listTemplates({ level, tag });

    if (templates.length === 0) {
      console.log("No task templates found.");
      return;
    }

    console.log(`Task templates (${templates.length}):`);
    for (const template of templates) {
      console.log(formatTemplateLine(template));
    }
  },
};

const runCommand: CommandModule = {
  command: "run <templateId>",
  describe: "Launch a task template immediately",
  builder: (yargs) =>
    yargs
      .positional("templateId", {
        describe: "Task template id",
        type: "string",
        demandOption: true,
      })
      .option("level", {
        type: "string",
        choices: ["auto", "project", "user", "builtin"],
        description: "Template lookup level (auto resolves project > user > builtin)",
      })
      .option("id", {
        type: "string",
        description: "Optional launch task id override",
      }),
  handler: async (argv) => {
    const templateId = asNonEmptyString(argv["templateId"]);
    if (!templateId) {
      console.error("Template id is required.");
      process.exit(1);
      return;
    }

    const level = parseLevelOption(argv["level"], true) ?? "auto";
    const id = asNonEmptyString(argv["id"]);

    await runTemplate(templateId, level, id);
  },
};

const scheduleCommand: CommandModule = {
  command: "schedule <templateId> <cron>",
  describe: "Create a scheduled job from a task template",
  builder: (yargs) =>
    yargs
      .positional("templateId", {
        describe: "Task template id",
        type: "string",
        demandOption: true,
      })
      .positional("cron", {
        describe: "Cron expression in 5-field format",
        type: "string",
        demandOption: true,
      })
      .option("level", {
        type: "string",
        choices: ["auto", "project", "user", "builtin"],
        description: "Template lookup level (auto resolves project > user > builtin)",
      })
      .option("id", {
        type: "string",
        description: "Optional scheduler job id override",
      }),
  handler: async (argv) => {
    const templateId = asNonEmptyString(argv["templateId"]);
    const cron = asNonEmptyString(argv["cron"]);
    if (!templateId || !cron) {
      console.error("Template id and cron are required.");
      process.exit(1);
      return;
    }

    const level = parseLevelOption(argv["level"], true) ?? "auto";
    const id = asNonEmptyString(argv["id"]);

    await scheduleTemplate(templateId, cron, level, id);
  },
};

export const tasksCommand: CommandModule = {
  command: "tasks",
  describe: "Manage task templates and run/schedule them",
  builder: (yargs) =>
    yargs
      .command(openCommand)
      .command(listCommand)
      .command(runCommand)
      .command(scheduleCommand)
      .version(false),
  handler: async () => {
    await launchTasksEditor();
  },
};
