/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  AgentSpec,
  ChannelSpec,
  SharedContextEntry,
  TeamExecutionSpec,
  TeamManifest,
} from "@qwen-code/qwen-code-core";

export class TeamManifestError extends Error {
  constructor(
    message: string,
    readonly sourcePath?: string,
  ) {
    super(message);
    this.name = "TeamManifestError";
  }
}

function asObject(
  value: unknown,
  sourcePath: string,
  context: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TeamManifestError(`${context} must be an object.`, sourcePath);
  }
  return value as Record<string, unknown>;
}

function asString(
  value: unknown,
  sourcePath: string,
  field: string,
  required = true,
): string | undefined {
  if (value === undefined || value === null) {
    if (required) {
      throw new TeamManifestError(`Missing required field "${field}".`, sourcePath);
    }
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TeamManifestError(`Field "${field}" must be a non-empty string.`, sourcePath);
  }
  return value.trim();
}

function parseAgents(raw: unknown, sourcePath: string): AgentSpec[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TeamManifestError('"agents" must be a non-empty array.', sourcePath);
  }

  const seen = new Set<string>();
  return raw.map((item, index) => {
    const record = asObject(item, sourcePath, `agents[${index}]`);
    const id = asString(record["id"], sourcePath, `agents[${index}].id`)!;
    const role = asString(record["role"], sourcePath, `agents[${index}].role`)!;
    const startupRaw = asString(
      record["startup"],
      sourcePath,
      `agents[${index}].startup`,
      false,
    );
    const startup =
      startupRaw === "immediate" || startupRaw === "idle"
        ? startupRaw
        : undefined;

    if (role === "orchestrator") {
      throw new TeamManifestError(
        `agents[${index}].role cannot be "orchestrator". Team members must use non-orchestrator roles.`,
        sourcePath,
      );
    }
    if (startupRaw && !startup) {
      throw new TeamManifestError(
        `agents[${index}].startup must be "immediate" or "idle" when provided.`,
        sourcePath,
      );
    }

    if (seen.has(id)) {
      throw new TeamManifestError(`Duplicate agent id "${id}".`, sourcePath);
    }
    seen.add(id);

    const model = asString(
      record["model"],
      sourcePath,
      `agents[${index}].model`,
      false,
    );
    const instructions = asString(
      record["instructions"],
      sourcePath,
      `agents[${index}].instructions`,
      false,
    );
    const toolsRaw = record["tools"];
    const tools =
      Array.isArray(toolsRaw) && toolsRaw.every((tool) => typeof tool === "string")
        ? (toolsRaw as string[])
        : undefined;

    return {
      id,
      role,
      startup,
      model,
      instructions,
      tools,
    };
  });
}

function parseChannels(raw: unknown, sourcePath: string): ChannelSpec[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TeamManifestError('"channels" must be a non-empty array.', sourcePath);
  }

  const seen = new Set<string>();

  return raw.map((item, index) => {
    const record = asObject(item, sourcePath, `channels[${index}]`);
    const name = asString(record["name"], sourcePath, `channels[${index}].name`)!;
    const historyRaw = record["history"];
    const history =
      typeof historyRaw === "string" && historyRaw.trim().length > 0
        ? historyRaw.trim()
        : "shared";

    if (history !== "shared") {
      throw new TeamManifestError(
        `channels[${index}].history must be "shared" in v1.`,
        sourcePath,
      );
    }

    if ("visibility" in record && record["visibility"] !== "all") {
      throw new TeamManifestError(
        `channels[${index}].visibility must be "all" in v1.`,
        sourcePath,
      );
    }
    if ("members" in record) {
      throw new TeamManifestError(
        `channels[${index}].members is not supported in v1 (shared channels only).`,
        sourcePath,
      );
    }

    if (seen.has(name)) {
      throw new TeamManifestError(`Duplicate channel name "${name}".`, sourcePath);
    }
    seen.add(name);

    return {
      name,
      history: "shared",
    };
  });
}

function parseSharedContext(raw: unknown, sourcePath: string): SharedContextEntry[] | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new TeamManifestError('"shared_context" must be an array when provided.', sourcePath);
  }

  return raw.map((item, index) => {
    const record = asObject(item, sourcePath, `shared_context[${index}]`);
    const type = asString(record["type"], sourcePath, `shared_context[${index}].type`)!;

    if (type === "file") {
      const filePath = asString(record["path"], sourcePath, `shared_context[${index}].path`)!;
      const readOnlyRaw = record["read_only"];
      if (typeof readOnlyRaw !== "boolean") {
        throw new TeamManifestError(
          `shared_context[${index}].read_only must be boolean for file entries.`,
          sourcePath,
        );
      }
      return {
        type: "file",
        path: filePath,
        read_only: readOnlyRaw,
      };
    }

    if (type === "variable") {
      const name = asString(record["name"], sourcePath, `shared_context[${index}].name`)!;
      const value = asString(record["value"], sourcePath, `shared_context[${index}].value`)!;
      return {
        type: "variable",
        name,
        value,
      };
    }

    throw new TeamManifestError(
      `shared_context[${index}].type must be "file" or "variable".`,
      sourcePath,
    );
  });
}

function parseExecution(raw: unknown, sourcePath: string): TeamExecutionSpec | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const record = asObject(raw, sourcePath, "execution");
  const modeRaw = asString(record["mode"], sourcePath, "execution.mode", false);
  const timeoutRaw = record["timeout_minutes"];

  if (modeRaw && modeRaw !== "headless" && modeRaw !== "interactive") {
    throw new TeamManifestError(
      'execution.mode must be "headless" or "interactive" when provided.',
      sourcePath,
    );
  }

  if (
    timeoutRaw !== undefined &&
    (typeof timeoutRaw !== "number" || !Number.isFinite(timeoutRaw) || timeoutRaw <= 0)
  ) {
    throw new TeamManifestError(
      "execution.timeout_minutes must be a positive number when provided.",
      sourcePath,
    );
  }

  const mode =
    modeRaw === "headless" || modeRaw === "interactive" ? modeRaw : undefined;

  return {
    mode,
    timeout_minutes: typeof timeoutRaw === "number" ? timeoutRaw : undefined,
  };
}

export function parseTeamManifest(content: string, sourcePath = "<inline>"): TeamManifest {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (error) {
    throw new TeamManifestError(
      `Invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
      sourcePath,
    );
  }

  const record = asObject(raw, sourcePath, "manifest");
  const version = asString(record["version"], sourcePath, "version")!;
  const id = asString(record["id"], sourcePath, "id")!;
  const name = asString(record["name"], sourcePath, "name")!;
  const description = asString(record["description"], sourcePath, "description", false);
  const agents = parseAgents(record["agents"], sourcePath);
  const channels = parseChannels(record["channels"], sourcePath);
  const shared_context = parseSharedContext(record["shared_context"], sourcePath);
  const execution = parseExecution(record["execution"], sourcePath);

  return {
    version,
    id,
    name,
    description,
    agents,
    channels,
    shared_context,
    execution,
  };
}

export async function loadTeamManifestFromFile(filePath: string): Promise<TeamManifest> {
  const resolvedPath = path.resolve(filePath);
  let content = "";
  try {
    content = await fs.readFile(resolvedPath, "utf-8");
  } catch (error) {
    throw new TeamManifestError(
      `Unable to read team manifest "${resolvedPath}": ${error instanceof Error ? error.message : String(error)}`,
      resolvedPath,
    );
  }

  return parseTeamManifest(content, resolvedPath);
}
