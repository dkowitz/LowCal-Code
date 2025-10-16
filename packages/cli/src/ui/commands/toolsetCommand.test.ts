/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./utils/toolConfig.js", () => ({
  loadCliToolConfig: vi.fn(),
  saveCliToolConfig: vi.fn(),
  syncCoreToolConfig: vi.fn(),
}));

vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@qwen-code/qwen-code-core")>();
  return {
    ...actual,
  };
});

import { toolsetCommand } from "./toolsetCommand.js";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { MessageType } from "../types.js";
import {
  loadCliToolConfig,
  saveCliToolConfig,
  syncCoreToolConfig,
  type CliToolConfig,
} from "./utils/toolConfig.js";

type ToolSummary = {
  name: string;
  displayName?: string;
  description?: string;
  schema?: unknown;
};

const mockLoadCliToolConfig = vi.mocked(loadCliToolConfig);
const mockSaveCliToolConfig = vi.mocked(saveCliToolConfig);
const mockSyncCoreToolConfig = vi.mocked(syncCoreToolConfig);

const baseTools: ToolSummary[] = [
  {
    name: "run_shell_command",
    displayName: "Shell",
    description: "Run shell commands",
    schema: {},
  } as ToolSummary,
  {
    name: "edit",
    displayName: "Edit",
    description: "Edit files",
    schema: {},
  } as ToolSummary,
];

const cloneConfig = (cfg: CliToolConfig): CliToolConfig => ({
  promptMode: cfg.promptMode,
  activeCollection: cfg.activeCollection,
  collections: Object.fromEntries(
    Object.entries(cfg.collections).map(([name, tools]) => [name, [...tools]]),
  ),
});

const createContextWithTools = (tools: ToolSummary[]) => {
  const geminiClient = { setTools: vi.fn() };
  const toolRegistry = {
    getAllTools: () => tools,
  };
  const context = createMockCommandContext({
    services: {
      config: {
        getGeminiClient: () => geminiClient,
        getToolRegistry: () => toolRegistry,
      },
    },
  });
  return { context, geminiClient };
};

describe("toolsetCommand", () => {
  let currentConfig: CliToolConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    currentConfig = {
      promptMode: "auto",
      activeCollection: "minimal",
      collections: {
        minimal: ["run_shell_command"],
      },
    };

    mockLoadCliToolConfig.mockImplementation(() => cloneConfig(currentConfig));
    mockSaveCliToolConfig.mockImplementation((cfg) => {
      currentConfig = cloneConfig(cfg);
    });
    mockSyncCoreToolConfig.mockImplementation(() => {});
  });

  it("rejects unknown tool names when adding to a collection", async () => {
    const { context } = createContextWithTools(baseTools);
    if (!toolsetCommand.action) throw new Error("Action not defined");

    await toolsetCommand.action(context, "add minimal blarby");

    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: expect.stringContaining("Unknown tool name"),
      },
      expect.any(Number),
    );
    expect(mockSaveCliToolConfig).not.toHaveBeenCalled();
  });

  it("allows adding tools using display names", async () => {
    const { context, geminiClient } = createContextWithTools(baseTools);
    if (!toolsetCommand.action) throw new Error("Action not defined");

    await toolsetCommand.action(context, "add minimal Edit");

    expect(mockSaveCliToolConfig).toHaveBeenCalledTimes(1);
    const savedConfig = mockSaveCliToolConfig.mock.calls[0][0];
    expect(savedConfig.collections["minimal"]).toEqual([
      "run_shell_command",
      "edit",
    ]);
    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: expect.stringContaining('Added edit to collection "minimal".'),
      },
      expect.any(Number),
    );
    expect(geminiClient.setTools).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous tool names", async () => {
    const ambiguousTools: ToolSummary[] = [
      ...baseTools,
      {
        name: "custom_shell",
        displayName: "Shell",
        description: "Custom shell tool",
        schema: {},
      } as ToolSummary,
    ];
    const { context } = createContextWithTools(ambiguousTools);
    if (!toolsetCommand.action) throw new Error("Action not defined");

    await toolsetCommand.action(context, "add minimal Shell");

    expect(context.ui.addItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: expect.stringContaining("Ambiguous tool name"),
      },
      expect.any(Number),
    );
    expect(mockSaveCliToolConfig).not.toHaveBeenCalled();
  });
});
