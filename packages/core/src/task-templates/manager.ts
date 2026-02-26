/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "../utils/yaml-parser.js";
import type {
  CreateTaskTemplateOptions,
  ListTaskTemplatesOptions,
  ResolveTaskTemplateOptions,
  TaskTemplate,
  TaskTemplateApprovalMode,
  TaskTemplateAction,
  TaskTemplateAuthProfile,
  TaskTemplateDeployProfile,
  TaskTemplateExecutionProfile,
  TaskTemplateLevel,
  TaskTemplateModelProfile,
  TaskTemplateRunProfile,
  TaskTemplateSystemPromptProfile,
  TaskTemplateToolsetProfile,
} from "./types.js";

const QWEN_CONFIG_DIR = ".qwen";
const TASK_TEMPLATE_DIR = "task-templates";

const TEMPLATE_LEVELS: TaskTemplateLevel[] = ["project", "user", "builtin"];
const RESOLUTION_ORDER: TaskTemplateLevel[] = ["project", "user", "builtin"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}

function asStringArrayOrCsv(value: unknown): string[] | undefined {
  const fromArray = asStringArray(value);
  if (fromArray) {
    return fromArray;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}

function parseAction(value: unknown): TaskTemplateAction | undefined {
  if (!isRecord(value)) return undefined;
  const type = asString(value["type"]);
  const actionType = type === "prompt" || type === "slash_command" ? type : undefined;
  const actionValue = asString(value["value"]);
  if (!actionType && !actionValue) return undefined;
  return {
    type: actionType,
    value: actionValue,
  };
}

function parseExecution(value: unknown): TaskTemplateExecutionProfile | undefined {
  if (!isRecord(value)) return undefined;
  const mode = asString(value["mode"]);
  if (
    mode !== "default" &&
    mode !== "headless" &&
    mode !== "zellij_tab" &&
    mode !== "in_process"
  ) {
    return undefined;
  }
  return { mode };
}

function parseApprovalMode(value: unknown): TaskTemplateApprovalMode | undefined {
  const mode = asString(value);
  if (
    mode === "plan" ||
    mode === "default" ||
    mode === "auto-edit" ||
    mode === "yolo"
  ) {
    return mode;
  }
  return undefined;
}

function parseAuth(value: unknown): TaskTemplateAuthProfile | undefined {
  if (!isRecord(value)) return undefined;
  const selectedType = asString(value["selectedType"]);
  const providerId = asString(value["providerId"]);
  const baseUrl = asString(value["baseUrl"]);
  const apiKeyEnvVar = asString(value["apiKeyEnvVar"]);
  if (!selectedType && !providerId && !baseUrl && !apiKeyEnvVar) {
    return undefined;
  }
  return {
    selectedType,
    providerId,
    baseUrl,
    apiKeyEnvVar,
  };
}

function parseModel(value: unknown): TaskTemplateModelProfile | undefined {
  if (!isRecord(value)) return undefined;
  const name = asString(value["name"]);
  if (!name) return undefined;
  return { name };
}

function parseRun(value: unknown): TaskTemplateRunProfile | undefined {
  if (!isRecord(value)) return undefined;
  const returnToSessionRaw = value["returnToSession"];
  const allowRecursiveRaw = value["allowRecursive"];
  const returnToSession =
    typeof returnToSessionRaw === "boolean"
      ? returnToSessionRaw
      : asString(returnToSessionRaw);
  const allowRecursive =
    typeof allowRecursiveRaw === "boolean" ? allowRecursiveRaw : undefined;
  if (returnToSession === undefined && allowRecursive === undefined) {
    return undefined;
  }
  return {
    returnToSession,
    allowRecursive,
  };
}

function parseSystemPrompt(
  value: unknown,
): TaskTemplateSystemPromptProfile | undefined {
  if (!isRecord(value)) return undefined;
  const names = asStringArrayOrCsv(value["names"]);
  const exclusive =
    typeof value["exclusive"] === "boolean" ? value["exclusive"] : undefined;
  const disable =
    typeof value["disable"] === "boolean" ? value["disable"] : undefined;
  if (disable === true) {
    return { disable: true };
  }
  if (!names || names.length === 0) {
    return undefined;
  }
  return {
    names,
    exclusive: exclusive === true,
  };
}

function parseToolset(value: unknown): TaskTemplateToolsetProfile | undefined {
  if (typeof value === "string") {
    const collection = asString(value);
    return collection ? { collection } : undefined;
  }
  if (!isRecord(value)) return undefined;
  const collection = asString(value["collection"]);
  if (!collection) return undefined;
  return { collection };
}

function parseDeploy(value: unknown): TaskTemplateDeployProfile | undefined {
  if (!isRecord(value)) return undefined;
  const mode = asString(value["mode"]);
  const deployMode = mode === "launch" || mode === "schedule" ? mode : undefined;
  const schedule = asString(value["schedule"]);
  const jobId = asString(value["jobId"]);
  const scheduleStartRaw = asString(value["scheduleStart"]);
  const scheduleStart =
    scheduleStartRaw === "start_idle" || scheduleStartRaw === "run_immediately"
      ? scheduleStartRaw
      : undefined;

  if (!deployMode && !schedule && !jobId && !scheduleStart) {
    return undefined;
  }

  return {
    mode: deployMode,
    schedule,
    jobId,
    scheduleStart,
  };
}

function mergeTemplate(base: TaskTemplate, updates: Partial<TaskTemplate>): TaskTemplate {
  return {
    ...base,
    ...updates,
    action: updates.action ? { ...base.action, ...updates.action } : base.action,
    execution: updates.execution
      ? { ...base.execution, ...updates.execution }
      : base.execution,
    auth: updates.auth ? { ...base.auth, ...updates.auth } : base.auth,
    model: updates.model ? { ...base.model, ...updates.model } : base.model,
    run: updates.run ? { ...base.run, ...updates.run } : base.run,
    systemPrompt: updates.systemPrompt
      ? { ...base.systemPrompt, ...updates.systemPrompt }
      : base.systemPrompt,
    deploy: updates.deploy ? { ...base.deploy, ...updates.deploy } : base.deploy,
  };
}

/**
 * Manages task templates in project/user/builtin scopes.
 */
export class TaskTemplateManager {
  private cache: Map<TaskTemplateLevel, TaskTemplate[]> | null = null;

  constructor(private readonly projectRoot: string) {}

  clearCache(): void {
    this.cache = null;
  }

  private async ensureCache(): Promise<void> {
    if (this.cache) return;
    this.cache = new Map();
    for (const level of TEMPLATE_LEVELS) {
      const templates = await this.listTemplatesAtLevel(level);
      this.cache.set(level, templates);
    }
  }

  private getLevelDir(level: TaskTemplateLevel): string {
    if (level === "project") {
      return path.join(this.projectRoot, QWEN_CONFIG_DIR, TASK_TEMPLATE_DIR);
    }
    if (level === "user") {
      return path.join(os.homedir(), QWEN_CONFIG_DIR, TASK_TEMPLATE_DIR);
    }
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(moduleDir, "builtin");
  }

  getTemplatePath(id: string, level: TaskTemplateLevel): string {
    if (level === "builtin") {
      return `<builtin:${id}>`;
    }
    return path.join(this.getLevelDir(level), `${id}.md`);
  }

  private async parseTemplateFile(
    filePath: string,
    level: TaskTemplateLevel,
    isBuiltin: boolean,
  ): Promise<TaskTemplate> {
    const raw = await fs.readFile(filePath, "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) {
      throw new Error(`Invalid template file format: ${filePath}`);
    }
    const [, frontmatterYaml, body] = match;
    const frontmatter = parseYaml(frontmatterYaml) as Record<string, unknown>;

    const id = asString(frontmatter["id"]);
    if (!id) {
      throw new Error(`Missing template id in ${filePath}`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error(`Invalid template id "${id}" in ${filePath}`);
    }

    const bodyPrompt = body.trim();
    const promptFromFrontmatter = asString(frontmatter["prompt"]);
    const prompt = bodyPrompt.length > 0 ? bodyPrompt : promptFromFrontmatter;

    const template: TaskTemplate = {
      id,
      name: asString(frontmatter["name"]),
      description: asString(frontmatter["description"]),
      tags: asStringArray(frontmatter["tags"]),
      approvalMode: parseApprovalMode(frontmatter["approvalMode"]),
      deploy: parseDeploy(frontmatter["deploy"]),
      prompt,
      action: parseAction(frontmatter["action"]),
      execution: parseExecution(frontmatter["execution"]),
      auth: parseAuth(frontmatter["auth"]),
      model: parseModel(frontmatter["model"]),
      run: parseRun(frontmatter["run"]),
      systemPrompt: parseSystemPrompt(frontmatter["systemPrompt"]),
      toolset: parseToolset(frontmatter["toolset"]),
      level,
      filePath,
      isBuiltin: isBuiltin || undefined,
    };

    if (!template.action && template.prompt) {
      template.action = { type: "prompt", value: template.prompt };
    } else if (template.action && template.prompt) {
      // For prompt actions, body content is canonical. This preserves multiline
      // prompts even if frontmatter parsing only captured the first line.
      if (template.action.type === "prompt" || !template.action.value) {
        template.action.value = template.prompt;
      }
    }

    return template;
  }

  private serializeTemplate(template: TaskTemplate): string {
    const frontmatter: Record<string, unknown> = {
      id: template.id,
    };

    if (template.name) frontmatter["name"] = template.name;
    if (template.description) frontmatter["description"] = template.description;
    if (template.tags && template.tags.length > 0) frontmatter["tags"] = template.tags;
    if (template.approvalMode) frontmatter["approvalMode"] = template.approvalMode;
    if (template.deploy) frontmatter["deploy"] = template.deploy;
    if (template.action && (template.action.type || template.action.value)) {
      const action: TaskTemplateAction = {};
      if (template.action.type) {
        action.type = template.action.type;
      }
      const actionValue = asString(template.action.value);

      // Prompt action value is duplicated in markdown body (`prompt`), so omit
      // it from frontmatter to avoid multiline truncation in minimal YAML parsing.
      if (!(action.type === "prompt" && template.prompt) && actionValue) {
        action.value = actionValue;
      }

      if (action.type || action.value) {
        frontmatter["action"] = action;
      }
    }
    if (template.execution && template.execution.mode) {
      frontmatter["execution"] = template.execution;
    }
    if (template.auth) {
      frontmatter["auth"] = template.auth;
    }
    if (template.model) {
      frontmatter["model"] = template.model;
    }
    if (template.run) {
      frontmatter["run"] = template.run;
    }
    if (template.systemPrompt) {
      frontmatter["systemPrompt"] = template.systemPrompt;
    }
    if (template.toolset?.collection) {
      frontmatter["toolset"] = template.toolset.collection;
    }

    const yaml = stringifyYaml(frontmatter, {
      lineWidth: 0,
      minContentWidth: 0,
    }).trim();
    const body = template.prompt ? `${template.prompt.trim()}\n` : "";
    return `---\n${yaml}\n---\n${body ? `\n${body}` : "\n"}`;
  }

  private async listTemplatesAtLevel(level: TaskTemplateLevel): Promise<TaskTemplate[]> {
    const dir = this.getLevelDir(level);
    const isBuiltin = level === "builtin";

    if (level === "project") {
      const projectResolved = path.resolve(this.projectRoot);
      const homeResolved = path.resolve(os.homedir());
      if (projectResolved === homeResolved) {
        return [];
      }
    }

    try {
      const entries = await fs.readdir(dir);
      const templates: TaskTemplate[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const filePath = path.join(dir, entry);
        try {
          const parsed = await this.parseTemplateFile(filePath, level, isBuiltin);
          templates.push(parsed);
        } catch {
          // Ignore malformed template files to avoid blocking listing.
        }
      }
      return templates;
    } catch {
      return [];
    }
  }

  async listTemplates(options: ListTaskTemplatesOptions = {}): Promise<TaskTemplate[]> {
    if (options.force) {
      this.clearCache();
    }
    await this.ensureCache();
    if (!this.cache) return [];

    if (options.level) {
      const levelItems = [...(this.cache.get(options.level) ?? [])];
      const tag = options.tag?.trim().toLowerCase();
      if (!tag) return levelItems;
      return levelItems.filter((item) =>
        item.tags?.some((candidate) => candidate.toLowerCase() === tag),
      );
    }

    const winners = new Map<string, TaskTemplate>();
    for (const level of RESOLUTION_ORDER) {
      const items = this.cache.get(level) ?? [];
      for (const item of items) {
        if (!winners.has(item.id)) {
          winners.set(item.id, item);
        }
      }
    }
    const all = [...winners.values()].sort((a, b) => a.id.localeCompare(b.id));
    const tag = options.tag?.trim().toLowerCase();
    if (!tag) return all;
    return all.filter((item) =>
      item.tags?.some((candidate) => candidate.toLowerCase() === tag),
    );
  }

  async resolveTemplate(
    id: string,
    options: ResolveTaskTemplateOptions = {},
  ): Promise<TaskTemplate | null> {
    const lookup = id.trim();
    if (!lookup) return null;
    await this.ensureCache();
    if (!this.cache) return null;

    if (options.level) {
      const levelItems = this.cache.get(options.level) ?? [];
      return levelItems.find((item) => item.id === lookup) ?? null;
    }

    for (const level of RESOLUTION_ORDER) {
      const levelItems = this.cache.get(level) ?? [];
      const found = levelItems.find((item) => item.id === lookup);
      if (found) return found;
    }
    return null;
  }

  async createTemplate(
    template: TaskTemplate,
    options: CreateTaskTemplateOptions,
  ): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(template.id)) {
      throw new Error(
        `Invalid template id "${template.id}". Must contain only letters, numbers, underscores, and hyphens.`,
      );
    }
    if (options.level === "builtin") {
      throw new Error("Cannot create builtin task templates");
    }

    const filePath = options.customPath ?? this.getTemplatePath(template.id, options.level);
    if (!options.overwrite) {
      try {
        await fs.access(filePath);
        throw new Error(`Task template "${template.id}" already exists`);
      } catch {
        // ignore if file doesn't exist
      }
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const finalTemplate: TaskTemplate = {
      ...template,
      level: options.level,
      filePath,
    };
    await fs.writeFile(filePath, this.serializeTemplate(finalTemplate), "utf8");
    this.clearCache();
  }

  async updateTemplate(
    id: string,
    updates: Partial<TaskTemplate>,
    level?: TaskTemplateLevel,
  ): Promise<TaskTemplate> {
    const existing = await this.resolveTemplate(id, level ? { level } : undefined);
    if (!existing) {
      throw new Error(`Task template "${id}" not found`);
    }
    if (existing.level === "builtin") {
      throw new Error("Cannot update builtin task templates");
    }

    const merged = mergeTemplate(existing, updates);
    const content = this.serializeTemplate(merged);
    await fs.writeFile(existing.filePath, content, "utf8");
    this.clearCache();
    return merged;
  }

  async deleteTemplate(id: string, level?: TaskTemplateLevel): Promise<void> {
    const existing = await this.resolveTemplate(id, level ? { level } : undefined);
    if (!existing) {
      throw new Error(`Task template "${id}" not found`);
    }
    if (existing.level === "builtin") {
      throw new Error("Cannot delete builtin task templates");
    }
    await fs.unlink(existing.filePath);
    this.clearCache();
  }
}
