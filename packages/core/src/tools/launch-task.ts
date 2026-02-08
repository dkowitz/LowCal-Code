/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import type { FunctionDeclaration } from "@google/genai";
import type { JobExecutionMode } from "../scheduler/types.js";
import * as fs from "fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const launchTaskToolSchemaData: FunctionDeclaration = {
  name: "launch_task",
  description:
    "Spawns a new instance of LowCal with a tasking prompt immediately (headless or in a zellij tab). This enables LowCal to execute tasks autonomously without scheduling.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create"],
        description: "The action to perform (only 'create' is supported)",
      },
      id: {
        type: "string",
        description: "Unique identifier for the task (required for create)",
      },
      prompt: {
        type: "string",
        description:
          "The prompt/instruction to execute. This is what LowCal will do when launched.",
      },
      description: {
        type: "string",
        description:
          "Optional human-readable description of what this task does",
      },
      execution_mode: {
        type: "string",
        enum: ["headless", "zellij_tab"],
        description:
          "Execution mode for the new LowCal instance. 'headless' runs silently, 'zellij_tab' opens in a new Zellij tab if available.",
      },
    },
    required: ["action", "id", "prompt"],
    $schema: "http://json-schema.org/draft-07/schema#",
  },
};

const launchTaskToolDescription = `
Use this tool to spawn a new instance of LowCal with a tasking prompt immediately, without scheduling.

This enables LowCal to execute tasks autonomously by launching a fresh instance that runs to completion.

## When to Use This Tool

Use this tool when you need:

1. **Immediate execution** - Run a task right away without waiting for a scheduler
2. **Isolated execution** - Execute a task in a clean environment separate from the current session
3. **Background processing** - Offload long-running tasks to run concurrently
4. **Zellij integration** - Open tasks in dedicated Zellij tabs for visibility

## Execution Modes

- **headless**: Runs silently without UI, ideal for automated tasks
- **zellij_tab**: Opens in a new Zellij tab if you're running in Zellij, allowing you to monitor progress

## Actions

- **create**: Launch a new LowCal instance with the given prompt (requires: id, prompt)

## Examples

<example>
User: Run a build and test cycle in the background while I continue working.
Assistant: I'll launch a headless task to run the build.

create action:
- id: "background-build"
- prompt: "Run 'npm run build && npm test'. Report any failures."
- execution_mode: "headless"
- description: "Run build and tests in background"
</example>

<example>
User: I want to monitor a log file in a separate tab while I work.
Assistant: I'll open a new Zellij tab with a task to tail the log file.

create action:
- id: "log-monitor"
- prompt: "Tail the application.log file and report any errors you see."
- execution_mode: "zellij_tab"
- description: "Monitor logs in separate tab"
</example>

## Important Notes

- Task IDs must be unique and contain only letters, numbers, underscores, and hyphens
- The new instance runs independently with its own session
- Headless mode captures output to a log file for later review
- Zellij tabs require you to be running in a Zellij session
`;

class LaunchTaskInvocation extends BaseToolInvocation<
  LaunchTaskParams,
  ToolResult
> {
  constructor(params: LaunchTaskParams) {
    super(params);
  }

  getDescription(): string {
    const { action, id } = this.params;
    switch (action) {
      case "create":
        return `Launching new LowCal instance "${id}"`;
      default:
        return `Launch task action: ${action}`;
    }
  }

  async execute(): Promise<ToolResult> {
    try {
      const result = await this.executeAction();
      return {
        llmContent: result,
        returnDisplay: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
    const { action, id, description, execution_mode } = this.params;

    switch (action) {
      case "create": {
        if (!id || !this.params.prompt) {
          throw new Error("Creating a task requires: id and prompt");
        }

        // Validate ID format (alphanumeric, underscores, hyphens only)
        const idRegex = /^[a-zA-Z0-9_-]+$/;
        if (!idRegex.test(id)) {
          throw new Error(
            `Invalid task ID "${id}". Must contain only letters, numbers, underscores, and hyphens.`,
          );
        }

        // Validate prompt length
        const promptValue = this.params.prompt!;
        if (promptValue.length > 10000) {
          throw new Error(
            `Prompt is too long (${promptValue.length} characters). Maximum is 10000 characters.`,
          );
        }

        // Determine execution mode - use headless as default
        const resolvedExecutionMode: JobExecutionMode =
          execution_mode === "zellij_tab" ? "zellij_tab" : "headless";

        // Launch the new LowCal instance
        await this.launchLowCalInstance(id, promptValue, resolvedExecutionMode);

        return this.formatTaskCreated(
          id,
          promptValue,
          description,
          resolvedExecutionMode,
        );
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async launchLowCalInstance(
    id: string,
    prompt: string,
    executionMode: JobExecutionMode,
  ): Promise<void> {
    // Check if Zellij is available
    const isRunningInZellij =
      Boolean(process.env["ZELLIJ_SESSION_NAME"]) ||
      Boolean(process.env["ZELLIJ_PANE_ID"]) ||
      Boolean(process.env["ZELLIJ"]);

    // If zellij_tab mode requested but not in Zellij, fall back to headless
    const actualMode = executionMode === "zellij_tab" && !isRunningInZellij
      ? "headless"
      : executionMode;

    if (actualMode === "zellij_tab") {
      await this.spawnZellijJob(id, prompt);
    } else {
      await this.spawnHeadlessJob(id, prompt);
    }
  }

  private async spawnHeadlessJob(
    id: string,
    prompt: string,
  ): Promise<void> {
    const { spawn } = await import("child_process");
    const path = await import("path");

    // Get the CLI entry point
    // From core/dist/src/tools, we need to go up 4 levels to get to packages/core,
    // then up 1 more to packages, then into cli
    const cliPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "cli",
      "dist",
      "src",
      "scheduler",
      "headless.js",
    );

    // Determine output log file
    const logDir = path.join(process.cwd(), ".lowcal", "launch-tasks");
    await fs.mkdir(logDir, { recursive: true });
    const logFile = path.join(logDir, `${id}.json`);

    // Build command arguments
    const args = [
      cliPath,
      "--prompt",
      JSON.stringify(prompt),
      "--job-id",
      id,
      "--output",
      logFile,
    ];

    return new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, LOWCAL_HEADLESS_PRETTY: "1" },
        detached: true, // Detach from parent process
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }

  private async spawnZellijJob(
    id: string,
    prompt: string,
  ): Promise<void> {
    const path = await import("path");

    // Get the CLI entry point
    // From core/dist/src/tools, we need to go up 4 levels to get to packages/core,
    // then up 1 more to packages, then into cli
    const cliPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "cli",
      "dist",
      "src",
      "scheduler",
      "headless.js",
    );

    const schedulerCwd = process.cwd();
    const logPath = path.join(
      schedulerCwd,
      ".lowcal",
      "logs",
      `launch-${id}-${Date.now()}.log`,
    );
    await fs.mkdir(path.dirname(logPath), { recursive: true });

    const tabName = `task:${id}`;

    // Ensure Zellij tab exists
    await this.runZellijCommand([
      "action",
      "new-tab",
      "--name",
      tabName,
      "--cwd",
      schedulerCwd,
    ]);

    // Go to the tab
    await this.runZellijCommand(["action", "go-to-tab-name", tabName]);

    const commandArgs = [
      "env",
      `LOWCAL_HEADLESS=1`,
      `LOWCAL_JOB_ID=${id}`,
      `LOWCAL_HEADLESS_PRETTY=1`,
      "node",
      cliPath,
      "--prompt",
      prompt,
      "--job-id",
      id,
      "--output",
      logPath,
    ];

    const command = `export PS1=''; unset PROMPT_COMMAND; stty -echo; cd ${this.shellQuoteArg(schedulerCwd)} && ${commandArgs
      .map(this.shellQuoteArg)
      .join(" ")}; printf '\\n[scheduler idle]\\n'`;

    try {
      await this.runZellijCommand([
        "action",
        "go-to-tab-name",
        tabName,
      ]);
    } catch {
      // If focusing the tab fails, continue in the current one.
    }

    try {
      await this.runZellijCommand(["action", "write-chars", `${command}\n`]);
    } catch {
      await this.runZellijCommand(["action", "write", `${command}\n`]);
    }
  }

  private async runZellijCommand(args: string[]): Promise<void> {
    const { spawn } = await import("child_process");

    await new Promise<void>((resolve, reject) => {
      const child = spawn("zellij", args, {
        stdio: ["ignore", "ignore", "pipe"],
        env: process.env,
      });

      let stderr = "";
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(stderr.trim() || `zellij command failed with exit code ${code}`),
          );
        }
      });
    });
  }

  private shellQuoteArg(value: string): string {
    if (value.length === 0) {
      return "''";
    }
    // Escape single quotes by ending the quote, adding an escaped quote, then starting a new quote
    return `'${value.replace(/'/g, `'"'"'`)}'`;
  }

  private formatTaskCreated(
    id: string,
    prompt: string,
    description?: string,
    executionMode: JobExecutionMode = "headless",
  ): string {
    let output = `✓ Launched new LowCal instance "${id}"\n\n`;
    output += `Execution Mode: ${executionMode}\n`;
    if (description) {
      output += `Description: ${description}\n`;
    }
    output += `\nPrompt:\n${prompt}\n\n`;
    output += `The task is running in the background. `;
    output +=
      executionMode === "headless"
        ? `Output will be logged to .lowcal/launch-tasks/${id}.json`
        : `Check your Zellij tab for progress.`;
    return output;
  }
}

export interface LaunchTaskParams {
  action: "create";
  id?: string;
  prompt?: string;
  description?: string;
  execution_mode?: JobExecutionMode;
}

export class LaunchTaskTool extends BaseDeclarativeTool<
  LaunchTaskParams,
  ToolResult
> {
  constructor() {
    super(
      "launch_task",
      "Launch Task",
      launchTaskToolDescription,
      Kind.Other,
      launchTaskToolSchemaData.parametersJsonSchema,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override createInvocation(
    params: LaunchTaskParams,
  ): LaunchTaskInvocation {
    return new LaunchTaskInvocation(params);
  }
}
