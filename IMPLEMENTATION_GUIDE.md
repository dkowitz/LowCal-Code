# LowCal Code Implementation Guide

**Purpose:** This document provides the essential information needed to implement new features in LowCal Code. It covers tools, slash commands, and how they fit into the overall architecture.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Implementing Tools](#implementing-tools)
4. [Implementing Slash Commands](#implementing-slash-commands)
5. [Implementing CLI Commands (yargs)](#implementing-cli-commands-yargs)
6. [Configuration & Settings](#configuration--settings)
7. [Task Templates & Scheduled Tasks](#task-templates--scheduled-tasks)
8. [Extensions](#extensions)
9. [Testing](#testing)
10. [Quick Reference](#quick-reference)

---

## Architecture Overview

LowCal Code follows a modular architecture with two main packages:

```
┌─────────────────────────────────────────────────────────────┐
│                      User Input                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CLI Package                                │
│  (packages/cli)                                              │
│  • Input processing                                          │
│  • Slash command handling                                    │
│  • UI rendering (Ink/React)                                  │
│  • History management                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Core Package                               │
│  (packages/core)                                             │
│  • LLM API client (Gemini/OpenRouter)                        │
│  • Tool registry & execution                                 │
│  • Prompt construction                                       │
│  • Session state management                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Tools                                   │
│  (packages/core/src/tools/)                                  │
│  • File system tools                                         │
│  • Shell execution                                           │
│  • Web fetch/search                                          │
│  • MCP tools                                                 │
│  • Custom discovered tools                                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

- **Separation of concerns:** CLI handles user interaction; Core handles LLM communication and tool execution
- **Extensibility:** Tools and slash commands follow standardized interfaces
- **User safety:** Destructive operations require explicit user confirmation
- **Modularity:** Features can be added via extensions, MCP servers, or direct code changes

---

## Project Structure

```
LowCal-dev/
├── packages/
│   ├── cli/                          # User-facing CLI package
│   │   ├── src/
│   │   │   ├── commands/             # yargs-based CLI commands
│   │   │   ├── config/               # Settings, auth, extensions
│   │   │   ├── services/             # Command loaders, session services
│   │   │   ├── ui/
│   │   │   │   ├── commands/         # Slash command implementations
│   │   │   │   ├── components/       # React/Ink UI components
│   │   │   │   └── hooks/            # React hooks for UI state
│   │   │   └── ...
│   │   └── package.json
│   │
│   ├── core/                         # Backend/core package
│   │   ├── src/
│   │   │   ├── tools/                # Tool implementations
│   │   │   ├── core/                 # LLM client, chat, prompts
│   │   │   ├── config/               # Core configuration
│   │   │   ├── services/             # File, git, shell services
│   │   │   ├── scheduler/            # Task scheduling
│   │   │   ├── sessions/             # Session management
│   │   │   ├── task-templates/       # Task template system
│   │   │   ├── subagents/            # Subagent system
│   │   │   └── mcp/                  # MCP protocol support
│   │   └── package.json
│   │
│   ├── test-utils/                   # Shared test utilities
│   └── vscode-ide-companion/         # VS Code integration
│
├── docs/                             # Documentation
└── ...
```

---

## Implementing Tools

Tools are the core building blocks that extend LowCal's capabilities. They allow the LLM to interact with the local environment.

### Tool Architecture

Tools follow a **validation-execution separation pattern**:

```
┌──────────────────────┐
│  DeclarativeTool     │  ← Tool definition (schema, description)
│  (tools.ts)          │
└──────────────────────┘
           │
           │ build()
           ▼
┌──────────────────────┐
│  ToolInvocation      │  ← Validated, ready-to-execute instance
│  (tools.ts)          │
└──────────────────────┘
           │
           │ execute()
           ▼
┌──────────────────────┐
│  ToolResult          │  ← Execution result
│  (tools.ts)          │
└──────────────────────┘
```

### Step-by-Step: Creating a New Tool

#### Step 1: Create the Tool File

Create a new file in `packages/core/src/tools/your-tool.ts`:

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation, ToolLocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";
import type { Config } from "../config/config.js";

// 1. Define parameters interface
export interface YourToolParams {
  /** Parameter description for the LLM */
  param1: string;
  /** Optional parameter */
  param2?: number;
}

// 2. Create the invocation class (handles execution)
class YourToolInvocation extends BaseToolInvocation<
  YourToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: YourToolParams,
  ) {
    super(params);
  }

  getDescription(): string {
    // Return a human-readable description of what will happen
    return `Executing your tool with param1=${this.params.param1}`;
  }

  override toolLocations(): ToolLocation[] {
    // Return file paths this tool will affect (for IDE integration)
    return [];
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
  ): Promise<ToolResult> {
    // Your tool logic here
    const result = `Tool executed successfully with ${this.params.param1}`;

    return {
      llmContent: result,  // Content sent back to LLM
      returnDisplay: result,  // Content shown to user
    };
  }
}

// 3. Create the tool builder class
export class YourTool extends BaseDeclarativeTool<
  YourToolParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.YOUR_TOOL;  // Add to tool-names.ts

  constructor(private config: Config) {
    super(
      YourTool.Name,
      "YourTool",  // Display name
      "Description of what your tool does. This is shown to the LLM.",
      Kind.Execute,  // See Kind enum for categories
      {
        // JSON schema for parameters
        properties: {
          param1: {
            description: "Description of param1",
            type: "string",
          },
          param2: {
            description: "Optional param2 description",
            type: "number",
          },
        },
        required: ["param1"],
        type: "object",
      },
      true,  // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  protected override validateToolParamValues(
    params: YourToolParams,
  ): string | null {
    // Custom validation beyond JSON schema
    if (params.param1.trim() === "") {
      return "param1 cannot be empty";
    }
    return null;
  }

  protected createInvocation(
    params: YourToolParams,
  ): ToolInvocation<YourToolParams, ToolResult> {
    return new YourToolInvocation(this.config, params);
  }
}
```

#### Step 2: Register the Tool

Add your tool to the tool registry in `packages/core/src/config/config.ts`:

```typescript
// Find the registerCoreTools method and add:
registry.registerTool(new YourTool(this));
```

Also export it from `packages/core/src/index.ts`:

```typescript
export * from "./tools/your-tool.js";
```

#### Step 3: Add Tool Name (Optional)

Add your tool name to `packages/core/src/tools/tool-names.ts`:

```typescript
export const ToolNames = {
  // ... existing names
  YOUR_TOOL: "your_tool",
} as const;
```

### Tool Kinds

The `Kind` enum categorizes tools for permissions and UI:

```typescript
export enum Kind {
  Read = "read",           // Read-only operations
  Edit = "edit",           // File modifications
  Execute = "execute",     // Command execution
  Search = "search",       // Search operations
  Memory = "memory",       // Memory operations
  Task = "task",           // Task automation
  Mcp = "mcp",            // MCP tools
}
```

### ToolResult Format

```typescript
interface ToolResult {
  llmContent: PartUnion | PartUnion[];  // Content for LLM context
  returnDisplay: ToolResultDisplay;      // User-facing display
  error?: {
    message: string;
    type: ToolErrorType;
  };
}
```

### Confirmation Handling

For tools that modify state, implement `shouldConfirmExecute`:

```typescript
async shouldConfirmExecute(
  signal: AbortSignal,
): Promise<ToolCallConfirmationDetails | false> {
  // Return false to skip confirmation
  // Return ToolCallConfirmationDetails to require user approval
  return {
    type: "exec",
    command: "some-command",
    rootCommand: "some-command",
    onConfirm: async (outcome: ToolConfirmationOutcome) => {
      // Handle confirmation outcome
    },
  };
}
```

---

## Implementing Slash Commands

Slash commands are user-facing commands prefixed with `/` in the REPL (e.g., `/help`, `/memory`).

### Slash Command Architecture

```
┌─────────────────────────────────────────┐
│  CommandContext                         │
│  • services (config, settings, git)     │
│  • ui (addItem, clear, etc.)            │
│  • session (stats, allowlist)           │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  SlashCommand                           │
│  • name, description                    │
│  • kind (BUILT_IN, FILE, MCP_PROMPT)    │
│  • action(context, args)                │
│  • subCommands[]                        │
│  • completion()                         │
└─────────────────────────────────────────┘
```

### Step-by-Step: Creating a New Slash Command

#### Step 1: Create the Command File

Create a new file in `packages/cli/src/ui/commands/your-command.ts`:

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand, SlashCommandActionReturn } from "./types.js";
import { CommandKind } from "./types.js";
import { MessageType } from "../types.js";

export const yourCommand: SlashCommand = {
  name: "yourcommand",
  description: "Description of what your command does",
  kind: CommandKind.BUILT_IN,
  
  // Optional: alternative names
  altNames: ["yc", "yourcmd"],
  
  // Optional: subcommands
  subCommands: [
    {
      name: "subcommand",
      description: "Description of subcommand",
      kind: CommandKind.BUILT_IN,
      action: async (context, args) => {
        // Subcommand logic
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: "Subcommand executed",
          },
          Date.now(),
        );
      },
    },
  ],
  
  // Main action
  action: async (context, args): Promise<void | SlashCommandActionReturn> => {
    // Access services
    const config = context.services.config;
    const settings = context.services.settings;
    const git = context.services.git;
    
    // Add UI message
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Command executed with args: ${args}`,
      },
      Date.now(),
    );
    
    // Or trigger a tool call
    return {
      type: "tool",
      toolName: "your_tool",
      toolArgs: { param1: args },
    };
    
    // Or submit a prompt to the LLM
    // return {
    //   type: "submit_prompt",
    //   content: "Your prompt content",
    // };
    
    // Or open a dialog
    // return {
    //   type: "dialog",
    //   dialog: "help",  // or "auth", "theme", "tasks", etc.
    // };
  },
  
  // Optional: argument completion
  completion: async (context, partialArg) => {
    // Return array of completion suggestions
    return ["suggestion1", "suggestion2"];
  },
};
```

#### Step 2: Register the Command

Add your command to `packages/cli/src/services/BuiltinCommandLoader.ts`:

```typescript
import { yourCommand } from "../ui/commands/yourCommand.js";

// In the loadCommands method:
async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
  const allDefinitions: Array<SlashCommand | null> = [
    // ... existing commands
    yourCommand,
  ];
  
  return allDefinitions.filter((cmd): cmd is SlashCommand => cmd !== null);
}
```

### SlashCommandActionReturn Types

Commands can return different action types:

```typescript
type SlashCommandActionReturn =
  | ToolActionReturn              // Trigger a tool call
  | MessageActionReturn           // Show info/error message
  | QuitActionReturn              // Quit the application
  | OpenDialogActionReturn        // Open a UI dialog
  | LoadHistoryActionReturn       // Load conversation history
  | SubmitPromptActionReturn      // Submit prompt to LLM
  | ConfirmShellCommandsActionReturn  // Confirm shell commands
  | ConfirmActionReturn           // Generic confirmation
  | InputRequestActionReturn;     // Request user input
```

### CommandContext

The `CommandContext` provides access to:

```typescript
interface CommandContext {
  invocation: {
    raw: string;    // Full input string
    name: string;   // Command name
    args: string;   // Arguments
  };
  services: {
    config: Config | null;
    settings: LoadedSettings;
    git: GitService | undefined;
    logger: Logger;
    logging: SessionLoggingController;
  };
  ui: {
    addItem: (item, timestamp) => void;
    clear: () => void;
    setDebugMessage: (message: string) => void;
    setPendingItem: (item) => void;
    loadHistory: (history) => void;
    getHistory: () => HistoryItem[];
    toggleCorgiMode: () => void;
    reloadCommands: () => void;
    // ... more
  };
  session: {
    stats: SessionStatsState;
    sessionShellAllowlist: Set<string>;
  };
}
```

---

## Implementing CLI Commands (yargs)

CLI commands are terminal commands run with `lowcal <command>` (not slash commands).

### Step-by-Step: Creating a CLI Command

#### Step 1: Create the Command File

Create a new file in `packages/cli/src/commands/your-command.ts`:

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule, Argv } from "yargs";

export const yourCommand: CommandModule = {
  command: "your-command [options]",
  describe: "Description of your CLI command",
  builder: (yargs: Argv) => {
    return yargs
      .option("flag", {
        type: "string",
        describe: "Description of the flag",
        default: "default-value",
      })
      .option("verbose", {
        type: "boolean",
        describe: "Enable verbose output",
        alias: "v",
      })
      .example("$0 your-command --flag value", "Example usage");
  },
  handler: async (argv) => {
    // Command logic here
    console.log(`Flag: ${argv.flag}`);
    console.log(`Verbose: ${argv.verbose}`);
    
    // You can import and use core services
    // const config = await loadConfig();
    // await doSomething(argv.flag);
  },
};
```

#### Step 2: Register the Command

Add your command to the CLI entry point in `packages/cli/src/gemini.tsx` or the appropriate command registration file.

---

## Configuration & Settings

### Settings Structure

Settings are organized hierarchically:

```
System Defaults → System → User → Workspace
```

### Settings Schema

Defined in `packages/cli/src/config/settingsSchema.ts`:

```typescript
interface Settings {
  general?: {
    preferredEditor?: string;
    vimMode?: boolean;
  };
  ui?: {
    theme?: string;
    hideBanner?: boolean;
  };
  model?: {
    name?: string;
    maxSessionTurns?: number;
  };
  tools?: {
    sandbox?: string;
    core?: string[];
    exclude?: string[];
  };
  mcp?: {
    allowed?: string[];
    excluded?: string[];
  };
  context?: {
    fileName?: string | string[];
    importFormat?: MemoryImportFormat;
  };
  // ... more
}
```

### Accessing Settings

```typescript
// In CLI commands
const settings = context.services.settings;
const theme = settings.merged.ui?.theme;

// In core
const config = this.config;
const sandbox = config.getSandbox();
```

### Adding New Settings

1. Add to `settingsSchema.ts`
2. Add migration mapping in `settings.ts` (if needed)
3. Update documentation

---

## Task Templates & Scheduled Tasks

### Task Templates

Task templates are reusable task configurations defined in `.toml` files.

#### Template Structure

```toml
[template]
id = "my-template"
name = "My Template"
description = "Description of the template"
action_type = "prompt"  # or "slash_command"
action_value = "Do something useful"

[template.execution_mode]
default = "headless"

[template.model]
name = "gemini-2.5-pro"
```

#### Location

- User templates: `~/.qwen/task-templates/`
- Project templates: `.qwen/task-templates/`

### Scheduled Tasks

Scheduled tasks use cron expressions:

```typescript
// Via schedule_task tool
{
  id: "my-scheduled-task",
  schedule: "0 2 * * *",  // Daily at 2 AM
  prompt: "Run nightly build",
  execution_mode: "headless",
}
```

---

## Extensions

Extensions package MCP servers, context files, and tool configurations.

### Extension Structure

```
my-extension/
├── qwen-extension.json    # Extension config
└── ...                    # Additional files
```

### Extension Config

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["@my/mcp-server"]
    }
  },
  "contextFileName": "EXTENSION.md"
}
```

### Loading Extensions

Extensions are loaded from:
- User: `~/.qwen/extensions/`
- Workspace: `.qwen/extensions/`

---

## Testing

### Tool Tests

```typescript
// your-tool.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { YourTool } from "./your-tool.js";
import { Config } from "../config/config.js";

describe("YourTool", () => {
  let tool: YourTool;
  let config: Config;

  beforeEach(() => {
    config = createMockConfig();
    tool = new YourTool(config);
  });

  it("should validate parameters", () => {
    const invocation = tool.build({ param1: "test" });
    expect(invocation).toBeDefined();
  });

  it("should execute successfully", async () => {
    const invocation = tool.build({ param1: "test" });
    const result = await invocation.execute(new AbortController().signal);
    expect(result.llmContent).toContain("success");
  });
});
```

### Slash Command Tests

```typescript
// your-command.test.ts
import { describe, it, expect } from "vitest";
import { yourCommand } from "./your-command.js";

describe("yourCommand", () => {
  it("should have correct name", () => {
    expect(yourCommand.name).toBe("yourcommand");
  });

  it("should execute action", async () => {
    const mockContext = createMockCommandContext();
    await yourCommand.action?.(mockContext, "test args");
    expect(mockContext.ui.addItem).toHaveBeenCalled();
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- your-tool.test.ts

# Run with coverage
npm run test:ci
```

---

## Quick Reference

### File Locations

| Feature | Location |
|---------|----------|
| Tools | `packages/core/src/tools/` |
| Tool types | `packages/core/src/tools/tools.ts` |
| Tool registry | `packages/core/src/tools/tool-registry.ts` |
| Slash commands | `packages/cli/src/ui/commands/` |
| Slash command types | `packages/cli/src/ui/commands/types.ts` |
| Command loaders | `packages/cli/src/services/` |
| CLI commands | `packages/cli/src/commands/` |
| Settings schema | `packages/cli/src/config/settingsSchema.ts` |
| Task templates | `packages/core/src/task-templates/` |

### Key Interfaces

```typescript
// Tool
interface ToolBuilder<TParams, TResult> {
  name: string;
  displayName: string;
  description: string;
  schema: FunctionDeclaration;
  build(params: TParams): ToolInvocation<TParams, TResult>;
}

// Slash Command
interface SlashCommand {
  name: string;
  description: string;
  kind: CommandKind;
  action?: (context, args) => Promise<void | SlashCommandActionReturn>;
  subCommands?: SlashCommand[];
  completion?: (context, partialArg) => Promise<string[]>;
}

// Tool Result
interface ToolResult {
  llmContent: PartUnion | PartUnion[];
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type: ToolErrorType };
}
```

### Common Patterns

**Trigger tool from slash command:**
```typescript
return {
  type: "tool",
  toolName: "read_file",
  toolArgs: { absolute_path: "/path/to/file" },
};
```

**Add message to UI:**
```typescript
context.ui.addItem(
  { type: MessageType.INFO, text: "Message" },
  Date.now(),
);
```

**Submit prompt to LLM:**
```typescript
return {
  type: "submit_prompt",
  content: "Your prompt here",
};
```

**Request confirmation:**
```typescript
return {
  type: "confirm_shell_commands",
  commandsToConfirm: ["rm -rf something"],
  originalInvocation: { raw: context.invocation.raw },
};
```

---

## Additional Resources

- **Architecture:** `docs/architecture.md`
- **Tools API:** `docs/core/tools-api.md`
- **CLI Commands:** `docs/cli/commands.md`
- **Configuration:** `docs/cli/configuration.md`
- **Contributing:** `CONTRIBUTING.md`

---

*Last updated: February 2026*
