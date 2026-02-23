/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from "@google/genai";
import type { Config } from "../config/config.js";
import {
  mergeRuntimeProfiles,
  normalizeActionType,
  normalizeApprovalMode,
  normalizeExecutionMode,
  normalizeRuntimeProfile,
  normalizeAuthProfile,
  normalizeModelProfile,
  normalizeRunProfile,
  runtimeProfileFromTemplate,
} from "../task-templates/runtime.js";
import type {
  TaskActionType,
  TaskRuntimeProfile,
  TaskTemplate,
  TaskTemplateExecutionProfile,
  TaskTemplateLevel,
} from "../task-templates/types.js";
import { TaskTemplateManager } from "../task-templates/manager.js";
import { ToolErrorType } from "./tool-error.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import type { ToolResult } from "./tools.js";

type TaskTemplateAction =
  | "list"
  | "get"
  | "create"
  | "update"
  | "delete"
  | "validate"
  | "resolve";

export interface TaskTemplateToolParams {
  action: TaskTemplateAction;
  id?: string;
  level?: TaskTemplateLevel | "auto";
  tag?: string;
  template?: Record<string, unknown>;
  overrides?: TaskRuntimeProfile;
}

const taskTemplateToolSchemaData: FunctionDeclaration = {
  name: "task_template",
  description:
    "Manage reusable task templates (project/user/builtin), validate them, and resolve runtime profiles for launch_task/schedule_task.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "create", "update", "delete", "validate", "resolve"],
      },
      id: {
        type: "string",
        description: "Template id",
      },
      level: {
        type: "string",
        enum: ["auto", "project", "user", "builtin"],
        description: "Template scope. auto resolves project > user > builtin.",
      },
      tag: {
        type: "string",
        description: "Optional tag filter for list action.",
      },
      template: {
        type: "object",
        description: "Template payload used by create/update/validate.",
      },
      overrides: {
        type: "object",
        description:
          "Optional runtime override profile for resolve action (execution_mode, auth, model, run, action fields).",
      },
    },
    required: ["action"],
    $schema: "http://json-schema.org/draft-07/schema#",
  },
};

const taskTemplateToolDescription = `
Use this tool to manage task templates and resolve runtime profiles used by launch_task and schedule_task.

Actions:
- list: list templates (optionally filtered by tag)
- get: fetch one template by id
- create: create a new template
- update: update an existing template
- delete: delete an existing template (project/user only)
- validate: validate a template payload or an existing template id
- resolve: resolve template + overrides into runtime profile fields
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return tags.length > 0 ? tags : undefined;
}

function parseAction(value: unknown): { type?: TaskActionType; value?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const type = normalizeActionType(value["type"]);
  const actionValue = asString(value["value"]);
  if (!type && !actionValue) return undefined;
  return {
    type,
    value: actionValue,
  };
}

function parseExecution(value: unknown): TaskTemplateExecutionProfile | undefined {
  if (!isRecord(value)) return undefined;
  const mode = normalizeExecutionMode(value["mode"]);
  if (!mode) return undefined;
  return { mode };
}

function parseTemplatePatch(value: unknown): Partial<TaskTemplate> {
  if (!isRecord(value)) {
    return {};
  }
  const patch: Partial<TaskTemplate> = {
    name: asString(value["name"]),
    description: asString(value["description"]),
    tags: parseTags(value["tags"]),
    approvalMode: normalizeApprovalMode(value["approvalMode"]),
    prompt: asString(value["prompt"]),
    action: parseAction(value["action"]),
    execution: parseExecution(value["execution"]),
    auth: normalizeAuthProfile(value["auth"]),
    model: normalizeModelProfile(value["model"]),
    run: normalizeRunProfile(value["run"]),
  };
  return patch;
}

function normalizeLevel(
  raw: TaskTemplateLevel | "auto" | undefined,
): TaskTemplateLevel | undefined {
  if (!raw || raw === "auto") return undefined;
  return raw;
}

class TaskTemplateInvocation extends BaseToolInvocation<
  TaskTemplateToolParams,
  ToolResult
> {
  constructor(params: TaskTemplateToolParams, private readonly config?: Config) {
    super(params);
  }

  private createManager(): TaskTemplateManager {
    const root = this.config?.getProjectRoot() || process.cwd();
    return new TaskTemplateManager(root);
  }

  getDescription(): string {
    const action = this.params.action;
    const id = this.params.id;
    return id ? `Task template ${action}: ${id}` : `Task template ${action}`;
  }

  async execute(): Promise<ToolResult> {
    try {
      const output = await this.executeAction();
      return {
        llmContent: output,
        returnDisplay: output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }
  }

  private async executeAction(): Promise<string> {
    const manager = this.createManager();
    const level = normalizeLevel(this.params.level);
    const id = asString(this.params.id);

    switch (this.params.action) {
      case "list": {
        const templates = await manager.listTemplates({
          level,
          tag: asString(this.params.tag),
          force: true,
        });
        if (templates.length === 0) {
          return "No task templates found.";
        }
        const lines = templates.map((template) => {
          const name = template.name ? ` (${template.name})` : "";
          const desc = template.description ? ` - ${template.description}` : "";
          return `- ${template.id}${name} [${template.level}]${desc}`;
        });
        return `Found ${templates.length} task template(s):\n${lines.join("\n")}`;
      }

      case "get": {
        if (!id) throw new Error("id is required for get");
        const template = await manager.resolveTemplate(id, level ? { level } : undefined);
        if (!template) {
          throw new Error(`Task template "${id}" not found`);
        }
        return `\`\`\`json\n${JSON.stringify(template, null, 2)}\n\`\`\``;
      }

      case "create": {
        if (!id) throw new Error("id is required for create");
        if (!level) {
          throw new Error("level must be project or user for create");
        }
        if (level === "builtin") {
          throw new Error("Cannot create builtin templates");
        }
        const patch = parseTemplatePatch(this.params.template);
        const template: TaskTemplate = {
          id,
          level,
          filePath: manager.getTemplatePath(id, level),
          ...patch,
        };
        await manager.createTemplate(template, { level, overwrite: false });
        return `Created task template "${id}" at ${level} level.`;
      }

      case "update": {
        if (!id) throw new Error("id is required for update");
        const patch = parseTemplatePatch(this.params.template);
        const updated = await manager.updateTemplate(id, patch, level);
        return `Updated task template "${updated.id}" (${updated.level}).`;
      }

      case "delete": {
        if (!id) throw new Error("id is required for delete");
        await manager.deleteTemplate(id, level);
        return `Deleted task template "${id}".`;
      }

      case "validate": {
        if (id) {
          const template = await manager.resolveTemplate(id, level ? { level } : undefined);
          if (!template) throw new Error(`Task template "${id}" not found`);
          return `Task template "${id}" is valid.`;
        }
        const patch = parseTemplatePatch(this.params.template);
        if (!id && !patch.prompt && !patch.action) {
          return "Template payload is valid (skeleton template with empty fields).";
        }
        return "Template payload is valid.";
      }

      case "resolve": {
        if (!id) throw new Error("id is required for resolve");
        const template = await manager.resolveTemplate(id, level ? { level } : undefined);
        if (!template) {
          throw new Error(`Task template "${id}" not found`);
        }
        const base = runtimeProfileFromTemplate(template);
        const overrides = normalizeRuntimeProfile(this.params.overrides);
        const resolved = mergeRuntimeProfiles(base, overrides);
        return `\`\`\`json\n${JSON.stringify(resolved, null, 2)}\n\`\`\``;
      }

      default:
        throw new Error(`Unsupported action: ${this.params.action}`);
    }
  }
}

export class TaskTemplateTool extends BaseDeclarativeTool<
  TaskTemplateToolParams,
  ToolResult
> {
  static readonly Name = "task_template";

  constructor(private readonly config?: Config) {
    super(
      TaskTemplateTool.Name,
      "Task Template",
      taskTemplateToolDescription,
      Kind.Other,
      taskTemplateToolSchemaData.parametersJsonSchema,
      true,
      false,
    );
  }

  protected override createInvocation(params: TaskTemplateToolParams) {
    return new TaskTemplateInvocation(params, this.config);
  }
}
