/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TaskTemplateManager,
  type TaskTemplateLevel,
} from "@qwen-code/qwen-code-core";
import {
  CommandKind,
  type MessageActionReturn,
  type OpenDialogActionReturn,
  type SlashCommand,
  type ToolActionReturn,
} from "./types.js";

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function parseTemplateLevel(value: string | undefined): TaskTemplateLevel | undefined {
  if (value === "project" || value === "user" || value === "builtin") {
    return value;
  }
  return undefined;
}

function getTemplateManager(projectRoot: string | undefined): TaskTemplateManager {
  return new TaskTemplateManager(projectRoot || process.cwd());
}

function usageError(content: string): MessageActionReturn {
  return {
    type: "message",
    messageType: "error",
    content,
  };
}

function launchFromTemplate(
  templateId: string,
  templateLevel?: TaskTemplateLevel,
): ToolActionReturn {
  const runId = `${templateId}-${Date.now()}`;
  return {
    type: "tool",
    toolName: "launch_task",
    toolArgs: {
      action: "create",
      id: runId,
      template_id: templateId,
      template_level: templateLevel ?? "auto",
    },
  };
}

function scheduleFromTemplate(
  templateId: string,
  schedule: string,
  jobId?: string,
  templateLevel?: TaskTemplateLevel,
): ToolActionReturn {
  return {
    type: "tool",
    toolName: "schedule_task",
    toolArgs: {
      action: "create",
      id: jobId ?? `${templateId}-schedule`,
      schedule,
      template_id: templateId,
      template_level: templateLevel ?? "auto",
    },
  };
}

export const tasksCommand: SlashCommand = {
  name: "tasks",
  altNames: ["task"],
  description: "manage reusable task templates and run them",
  kind: CommandKind.BUILT_IN,
  action: async (
    context,
    args,
  ): Promise<
    | OpenDialogActionReturn
    | MessageActionReturn
    | ToolActionReturn
    | void
  > => {
    const rawArgs = args.trim();
    if (!rawArgs) {
      return {
        type: "dialog",
        dialog: "tasks",
      };
    }

    const tokens = tokenizeArgs(rawArgs);
    const [subcommand, ...rest] = tokens;

    if (subcommand === "open") {
      return {
        type: "dialog",
        dialog: "tasks",
      };
    }

    if (subcommand === "list") {
      const manager = getTemplateManager(context.services.config?.getProjectRoot());
      const templates = await manager.listTemplates();
      if (templates.length === 0) {
        return {
          type: "message",
          messageType: "info",
          content: "No task templates found.",
        };
      }

      const lines = templates.map(
        (template) =>
          `- ${template.id} (${template.level})${template.name ? `: ${template.name}` : ""}`,
      );
      return {
        type: "message",
        messageType: "info",
        content: `Task templates (${templates.length}):\n${lines.join("\n")}`,
      };
    }

    if (subcommand === "run") {
      const templateId = rest[0]?.trim();
      if (!templateId) {
        return usageError(
          'Usage: /tasks run <template_id> [--level project|user|builtin]',
        );
      }

      let level: TaskTemplateLevel | undefined;
      for (let i = 1; i < rest.length; i += 1) {
        if (rest[i] === "--level") {
          level = parseTemplateLevel(rest[i + 1]);
          i += 1;
        }
      }

      return launchFromTemplate(templateId, level);
    }

    if (subcommand === "schedule") {
      const templateId = rest[0]?.trim();
      const schedule = rest[1]?.trim();
      if (!templateId || !schedule) {
        return usageError(
          'Usage: /tasks schedule <template_id> "<cron>" [--id job-id] [--level project|user|builtin]',
        );
      }

      let jobId: string | undefined;
      let level: TaskTemplateLevel | undefined;
      for (let i = 2; i < rest.length; i += 1) {
        if (rest[i] === "--id") {
          jobId = rest[i + 1]?.trim();
          i += 1;
          continue;
        }
        if (rest[i] === "--level") {
          level = parseTemplateLevel(rest[i + 1]);
          i += 1;
        }
      }

      return scheduleFromTemplate(templateId, schedule, jobId, level);
    }

    return usageError(
      'Unknown subcommand. Use /tasks, /tasks list, /tasks run <id>, or /tasks schedule <id> "<cron>".',
    );
  },
};
