# CLI Commands

LowCal Code supports several built-in commands to help you manage your session, customize the interface, and control its behavior. These commands are prefixed with a forward slash (`/`), an at symbol (`@`), or an exclamation mark (`!`).

## Slash commands (`/`)

Slash commands provide meta-level control over the CLI itself.

### Built-in Commands

- **`/bug`**
  - **Description:** File an issue about LowCal Code. By default, the issue is filed within the GitHub repository for LowCal Code. The string you enter after `/bug` will become the headline for the bug being filed. The default `/bug` behavior can be modified using the `bugCommand` setting in your `.qwen/settings.json` files.

- **`/chat`**
  - **Description:** Save and resume conversation history for branching conversation state interactively, or resuming a previous state from a later session.
  - **Sub-commands:**
    - **`save`**
      - **Description:** Saves the current conversation history. You must add a `<tag>` for identifying the conversation state.
      - **Usage:** `/chat save <tag>`
      - **Details on Checkpoint Location:** The default locations for saved chat checkpoints are:
        - Linux/macOS: `~/.qwen/tmp/<project_hash>/`
        - Windows: `C:\\Users\\<YourUsername>\\.qwen\\tmp\\<project_hash>\\`
        - When you run `/chat list`, the CLI only scans these specific directories to find available checkpoints.
        - **Note:** These checkpoints are for manually saving and resuming conversation states. For automatic checkpoints created before file modifications, see the [Checkpointing documentation](../checkpointing.md).
    - **`resume`**
      - **Description:** Resumes a conversation from a previous save.
      - **Usage:** `/chat resume <tag>`
    - **`list`**
      - **Description:** Lists available tags for chat state resumption.
    - **`delete`**
      - **Description:** Deletes a saved conversation checkpoint.
      - **Usage:** `/chat delete <tag>`

- **`/clear`**
  - **Description:** Clear the terminal screen, including the visible session history and scrollback within the CLI. The underlying session data (for history recall) might be preserved depending on the exact implementation, but the visual display is cleared.
  - **Keyboard shortcut:** Press **Ctrl+L** at any time to perform a clear action.

- **`/summary`**
  - **Description:** Generate a comprehensive project summary from the current conversation history and save it to `.qwen/PROJECT_SUMMARY.md`. This summary includes the overall goal, key knowledge, recent actions, and current plan, making it perfect for resuming work in future sessions.
  - **Usage:** `/summary`
  - **Features:**
    - Analyzes the entire conversation history to extract important context
    - Creates a structured markdown summary with sections for goals, knowledge, actions, and plans
    - Automatically saves to `.qwen/PROJECT_SUMMARY.md` in your project root
    - Shows progress indicators during generation and saving
    - Integrates with the Welcome Back feature for seamless session resumption
  - **Note:** This command requires an active conversation with at least 2 messages to generate a meaningful summary.

- **`/compress`**
  - **Description:** Replace the entire chat context with a summary. This saves on tokens used for future tasks while retaining a high level summary of what has happened.

- **`/copy`**
  - **Description:** Copies the last output produced by Qwen Code to your clipboard, for easy sharing or reuse.

- **`/directory`** (or **`/dir`**)
  - **Description:** Manage workspace directories for multi-directory support.
  - **Sub-commands:**
    - **`add`**:
      - **Description:** Add a directory to the workspace. The path can be absolute or relative to the current working directory. Moreover, the reference from home directory is supported as well.
      - **Usage:** `/directory add <path1>,<path2>`
      - **Note:** Disabled in restrictive sandbox profiles. If you're using that, use `--allow-all` flag when starting Qwen Code.

- **`/file`** (or **`/f`**)
  - **Description:** Open a file for reading or editing.
  - **Usage:** `/file <path>`
  - **Features:**
    - Supports reading files with syntax highlighting
    - Can open multiple files simultaneously
    - Shows file preview in the sidebar

- **`/help`** (or **`/h`**)
  - **Description:** Display this help message.
  - **Usage:** `/help [command]`
  - **Details:** When a specific command is provided, shows detailed help for that command.

- **`/model`**
  - **Description:** Open a model selection dialog for the current authentication provider.
  - **Behavior:**
    - For QWEN OAuth, the dialog shows Qwen-provided models.
    - For OpenRouter and LM Studio (OpenAI-compatible providers), the CLI polls the provider's `/v1/models` endpoint to present a live list of available models.
    - For OpenAI, if `OPENAI_MODEL` is present in the environment it will be offered; if a custom `OPENAI_BASE_URL` is configured the CLI will attempt to poll `/v1/models` from that base URL as well.
  - **Model switching:** Selecting a model unloads any previously loaded model and then loads the new one. A short warm-up query is sent after loading to prime the model.

- **`/tasks`** (alias: **`/task`**)
  - **Description:** Open the task template editor dialog and manage reusable task templates.
  - **Usage:**
    - `/tasks` or `/tasks open` - Open the interactive template editor
    - `/tasks list` - List available templates
    - `/tasks run <template_id> [--level project|user|builtin]` - Launch template immediately
    - `/tasks schedule <template_id> "<cron>" [--id job-id] [--level project|user|builtin]` - Create scheduled job from template
  - **Editor capabilities:**
    - Create/edit/delete templates in project (`.qwen/task-templates/`) or user (`~/.qwen/task-templates/`) scope
    - Duplicate existing templates for rapid specialization workflows
    - Select auth/provider via list (mirrors `/auth`)
    - Select model via list (mirrors `/model` for selected provider)
    - Choose execution mode: `default`, `headless`, `zellij_tab`, `in_process`
    - Deploy directly as immediate launch or scheduled cron job
  - **Returns workflow:** Use `/mailbox` to inspect received payloads and pending task runs after deployment.
  - **Template flexibility:** Templates can be skeleton-only, partially prefilled, or fully prefilled and deploy-ready.

- **`/mailbox`**
  - **Description:** Open the task mailbox dialog to review received task payloads and pending launched tasks.
  - **Usage:**
    - `/mailbox` or `/mailbox open` - Open the interactive mailbox dialog
    - `/mailbox list` - Print received/pending mailbox status in chat
    - `/mailbox show <index|task_id>` - Preview one payload in chat
    - `/mailbox use <index|task_id>` - Inject one payload into chat/model history (display-only; no immediate model response)
    - `/mailbox clear` - Clear received mailbox entries for the current session
  - **Dialog capabilities:**
    - Browse **Received** payloads and **Pending** task runs in separate scrollable panels
    - Preview full payload content before use
    - Use selected payload inline in chat so both user and model can reference it on later turns

- **`/agents`**
  - **Description:** Manage specialized AI subagents for focused tasks. Subagents are independent AI assistants configured with specific expertise and tool access.
  - **Sub-commands:**
    - **`create`**:
      - **Description:** Launch an interactive wizard to create a new subagent. The wizard guides you through location selection, AI-powered prompt generation, tool selection, and visual customization.
      - **Usage:** `/agents create`
    - **`manage`**:
      - **Description:** Open an interactive management dialog to view, edit, and delete existing subagents. Shows both project-level and user-level agents.
      - **Usage:** `/agents manage`
  - **Storage Locations:**
    - **Project-level:** `.qwen/agents/` (shared with team, takes precedence)
    - **User-level:** `~/.qwen/agents/` (personal agents, available across projects)
  - **Note:** For detailed information on creating and managing subagents, see the [Subagents documentation](../subagents.md).

- **`/tools`** ([Tools Documentation](../tools/index.md))
  - **Description:** Display a list of tools that are currently available within LowCal Code.
  - **Usage:** `/tools [desc]`
  - **Sub-commands:**
    - **`desc`** or **`descriptions`**:
      - **Description:** Show detailed descriptions of each tool, including each tool's name with its full description as provided to the model.
    - **`nodesc`** or **`nodescriptions`**:
      - **Description:** Hide tool descriptions, showing only the tool names.

- **`/privacy`**
  - **Description:** Display the Privacy Notice and allow users to select whether they consent to the collection of their data for service improvement purposes.

- **`/prompt`**
  - **Description:** Create, manage, and use custom system prompts that either supplement or replace the base system prompt (determined by `/promptmode`).
  - **Sub-commands:**
    - **`list`**
      - **Description:** Display all available custom prompts with their metadata (mode, token count, creation date).
      - **Usage:** `/prompt list`
      - **Output:** Shows each prompt's name, whether it's active, its mode (EXCLUSIVE or SUPPLEMENTAL), token count, and creation date.
    - **`show <name>`**
      - **Description:** Display the full text content of a custom prompt.
      - **Usage:** `/prompt show <name>`
      - **Example:** `/prompt show code-reviewer`
    - **`create <name> <content|file> [--exclusive]`**
      - **Description:** Create a new custom prompt from an inline string or from a markdown file.
      - **Usage:** `/prompt create <name> "<prompt text>"` or `/prompt create <name> ./path/to/prompt.md`
      - **Options:**
        - `--exclusive` (optional): If specified, the prompt will replace the entire system prompt. If omitted, the prompt is appended as supplemental instructions.
      - **Examples:**
        - `/prompt create code-reviewer "You are an expert code reviewer. Focus on security, performance, and maintainability."`
        - `/prompt create security-auditor ./security-prompt.md --exclusive`
      - **Details:**
        - Prompt names must contain only alphanumeric characters, hyphens, and underscores (max 50 characters).
        - Inline strings can be quoted with single or double quotes.
        - File paths ending in `.md` or containing `/` or `\` are treated as file paths.
        - Token count is estimated and displayed; prompts exceeding 2000 tokens trigger a warning.
        - Prompts are stored persistently in `~/.qwen/tool-config.json`.
    - **`delete <name>`**
      - **Description:** Delete an existing custom prompt.
      - **Usage:** `/prompt delete <name>`
      - **Example:** `/prompt delete code-reviewer`
      - **Note:** If the deleted prompt is currently active, it will be automatically disabled.
    - **`activate <name> [--exclusive]`** (aliases: `use`, `set`)
      - **Description:** Enable a custom prompt. The prompt will be applied to all subsequent LLM interactions until disabled or changed.
      - **Usage:** `/prompt activate <name>` or `/prompt use <name>` or `/prompt set <name>`
      - **Options:**
        - `--exclusive` (optional): Override the prompt's stored mode and use it in exclusive mode (replaces entire system prompt).
      - **Examples:**
        - `/prompt activate code-reviewer` (uses the prompt's stored mode)
        - `/prompt activate security-auditor --exclusive` (forces exclusive mode)
      - **Details:**
        - If the prompt is in supplemental mode, it is inserted into the base prompt (from `/promptmode`) as a new section bounded by `### Additional Instructions` markers.
        - If the prompt is in exclusive mode, it completely replaces the base system prompt.
        - The active prompt is displayed in the startup message and footer status indicator.
        - The LLM client is automatically reinitialized to apply the new prompt.
    - **`disable`**
      - **Description:** Disable the currently active custom prompt and return to the base system prompt (from `/promptmode`).
      - **Usage:** `/prompt disable`
      - **Details:**
        - After disabling, the system will use the base prompt determined by `/promptmode` (auto, full, or concise).
        - The LLM client is automatically reinitialized.
  - **Status Indicators:**
    - **Startup Message:** When a custom prompt is active, the startup status message displays: `Custom Prompt: <name> (EXCLUSIVE|SUPPLEMENTAL)`
    - **Footer:** The footer status bar shows the active custom prompt name with a marker: `✓` for supplemental mode, `✕` for exclusive mode.
  - **Workflow Example:**

    ```
    > /prompt create code-reviewer "You are an expert code reviewer focusing on security and performance."
    ✓ Prompt "code-reviewer" created (250 tokens, SUPPLEMENTAL)

    > /prompt list
    📋 Custom Prompts:
      • code-reviewer [SUPPLEMENTAL] | 250 tokens | Created: 10/22/2025, 2:30 PM

    > /prompt activate code-reviewer
    ✓ Prompt "code-reviewer" activated (SUPPLEMENTAL mode)

    > /prompt disable
    ✓ Custom prompt "code-reviewer" disabled. Returning to base prompt.
    ```

- **`/promptmode`**
  - **Description:** Set the system prompt mode for the current session.
  - **Modes:**
    - **`auto`** (default): Automatically adjusts prompt length based on context needs.
    - **`full`**: Uses the full, detailed system prompt with maximum context.
    - **`concise`**: Uses a condensed system prompt for faster responses.
  - **Usage:** `/promptmode <mode>`
  - **Note:** This setting is session-only and does not persist between sessions.

- **`/resume`**
  - **Description:** Resume a previous conversation checkpoint from the automatic checkpointing system. Provides interactive selection or direct resume by index or ID.
  - **Usage:** `/resume` or `/resume <index>` or `/resume <checkpoint-id>`
  - **Sub-commands:**
    - **`list`**
      - **Description:** List saved conversation checkpoints (newest first).
      - **Usage:** `/resume list`
      - **Output Format:** Shows index, message count, session ID (color-coded), date/time, and last message preview.
    - **`delete <index>`**
      - **Description:** Delete a conversation checkpoint by index.
      - **Usage:** `/resume delete <index>`
  - **Details:**
    - Running `/resume` without arguments opens an interactive dialog to select from available checkpoints.
    - You can specify a checkpoint by its 1-based index (e.g., `/resume 1`) or by full checkpoint ID.
    - Session IDs are color-coded in the list output for easier identification.
    - Checkpoints contain full conversation history including user and model messages.

- **`/approval-mode`**
  - **Description:** Set the approval mode for tool execution. Controls whether you're prompted to confirm potentially destructive operations.
  - **Modes:**
    - **`ask`** (default): Prompt for confirmation on all destructive operations.
    - **`yolo`**: Execute all tools without confirmation (use with caution).
    - **`plan`**: Plan mode - show what would be done without executing.
  - **Usage:** `/approval-mode <mode> [--project|--user]`
  - **Options:**
    - `--project`: Persist the setting for this project only.
    - `--user`: Persist the setting for all projects for this user.
  - **Examples:**
    - `/approval-mode yolo` (session-only)
    - `/approval-mode plan --project` (persist plan mode for this project)
    - `/approval-mode yolo --user` (persist YOLO mode for this user across projects)

- **`/about`**
  - **Description:** Show version info. Please share this information when filing issues.

- **`/quit-confirm`**
  - **Description:** Show a confirmation dialog before exiting LowCal Code, allowing you to choose how to handle your current session.
  - **Usage:** `/quit-confirm`
  - **Features:**
    - **Quit immediately:** Exit without saving anything (equivalent to `/quit`)
    - **Generate summary and quit:** Create a project summary using `/summary` before exiting
    - **Save conversation and quit:** Save the current conversation with an auto-generated tag before exiting
  - **Keyboard shortcut:** Press **Ctrl+C** twice to trigger the quit confirmation dialog
  - **Note:** This command is automatically triggered when you press Ctrl+C once, providing a safety mechanism to prevent accidental exits.

- **`/quit`** (or **`/exit`**)
  - **Description:** Exit LowCal Code immediately without any confirmation dialog.

- **`/vim`**
  - **Description:** Toggle vim mode on or off. When vim mode is enabled, the input area supports vim-style navigation and editing commands in both NORMAL and INSERT modes.
  - **Features:**
    - **NORMAL mode:** Navigate with `h`, `j`, `k`, `l`; jump by words with `w`, `b`, `e`; go to line start/end with `0`, `$`, `^`; go to specific lines with `G` (or `gg` for first line)
    - **INSERT mode:** Standard text input with escape to return to NORMAL mode
    - **Editing commands:** Delete with `x`, change with `c`, insert with `i`, `a`, `o`, `O`; complex operations like `dd`, `cc`, `dw`, `cw`
    - **Count support:** Prefix commands with numbers (e.g., `3h`, `5w`, `10G`)
    - **Repeat last command:** Use `.` to repeat the last editing operation
    - **Persistent setting:** Vim mode preference is saved to `~/.qwen/settings.json` and restored between sessions
  - **Status indicator:** When enabled, shows `[NORMAL]` or `[INSERT]` in the footer

- **`/init`**
  - **Description:** Analyzes the current directory and creates a `LOWCAL.md` context file by default (or the filename specified by `contextFileName`). If a non-empty file already exists, no changes are made. The command seeds an empty file and prompts the model to populate it with project-specific instructions.

## CLI Commands (Terminal Mode)

LowCal Code also provides several top-level commands that can be run from the terminal (not in REPL mode). These provide system-level management capabilities.

### Dashboard Command

The `dashboard` command provides a comprehensive overview of all sessions, scheduled jobs, and daemon status in a single interactive interface.

**Usage:** `lowcal dashboard [options]`

**Options:**

- `--ttl <seconds>`: Stale threshold in seconds (default: 180)
- `--watch`: Keep the dashboard live (refreshes automatically)
- `--interval <seconds>`: Refresh interval in seconds (default: 2)

**Features:**

- Real-time view of all active sessions
- Scheduler job status and scheduling information
- Daemon health indicators
- Interactive controls for managing sessions and jobs

### Sessions Command

Manage LowCal Code sessions - view, inspect, and clean up session data.

**Usage:** `lowcal sessions <command> [options]`

**Sub-commands:**

- **`list`**: List all active sessions
- **`get <id>`**: Show details for a specific session
- **`prune`**: Remove stale sessions

**Options:**

- `--ttl <seconds>`: Stale threshold in seconds (default: 180)
- `--watch`: Keep the list live (like top)
- `--interval <seconds>`: Refresh interval in seconds (default: 2)

**Examples:**

```bash
# List all active sessions
lowcal sessions list

# Watch sessions in real-time
lowcal sessions list --watch --interval 5

# Get details for a specific session
lowcal sessions get abc123def456

# Remove stale sessions older than 5 minutes
lowcal sessions prune --ttl 300
```

### Scheduler Command

Manage the LowCal scheduler daemon and inspect or maintain scheduled jobs.

**Usage:** `lowcal scheduler <command> [options]`

**Sub-commands:**

- **`start`**: Start the scheduler daemon
- **`stop`**: Stop the scheduler daemon
- **`status`**: Show scheduler status
- **`list`**: List all scheduled jobs
- **`get <id>`**: Show details for one job
- **`mode <id> <headless|zellij_tab|default>`**: Set/clear execution mode override for a job
- **`delete <id>`**: Delete a scheduled job permanently
- **`reset <id>`**: Reset a failed job to allow retry
- **`logs <id> [--tail N]`**: Show recent execution logs for a job

**Note:** New jobs are created through `schedule_task`, `/tasks schedule ...`, or `lowcal tasks schedule ...`.

**Examples:**

```bash
# Start the scheduler daemon
lowcal scheduler start

# List all scheduled jobs
lowcal scheduler list

# Show one job including runtime profile details
lowcal scheduler get daily-tests

# Set execution override to zellij tab
lowcal scheduler mode daily-tests zellij_tab

# Tail recent logs
lowcal scheduler logs daily-tests --tail 20
```

### Tasks Command

Manage and deploy task templates from terminal mode.

**Usage:** `lowcal tasks [command] [options]`

Running `lowcal tasks` with no subcommand opens the interactive tasks editor.

**Sub-commands:**

- **`open`**: Open the interactive `/tasks` dialog in a TUI session
- **`list`**: List templates (supports `--level` and `--tag`)
- **`run <templateId>`**: Launch template immediately (supports `--level` and `--id`)
- **`schedule <templateId> <cron>`**: Create scheduled job from template (supports `--level` and `--id`)

**Examples:**

```bash
# Open the interactive task template editor
lowcal tasks open

# List user templates tagged "vision"
lowcal tasks list --level user --tag vision

# Launch a template now
lowcal tasks run vision-ocr --level auto

# Schedule a template daily at 2 AM
lowcal tasks schedule compress-context "0 2 * * *" --id nightly-compress
```

### Orchestrator Command

Manage the LowCal orchestrator daemon for automated session management.

**Usage:** `lowcal orchestrator <command> [options]`

**Sub-commands:**

- **`start`**: Start the orchestrator daemon
- **`stop`**: Stop the orchestrator daemon
- **`status`**: Show orchestrator status

**Examples:**

```bash
# Check orchestrator status
lowcal orchestrator status

# Start the orchestrator
lowcal orchestrator start

# Stop the orchestrator
lowcal orchestrator stop
```

### Extensions Command

Manage LowCal Code extensions.

**Usage:** `lowcal extensions <command> [options]`

**Sub-commands:**

- **`install <name>`**: Install an extension
- **`uninstall <name>`**: Uninstall an extension
- **`list`**: List all installed extensions
- **`update [name]`**: Update a specific extension or all extensions
- **`disable <name>`**: Disable an extension
- **`enable <name>`**: Enable a disabled extension

**Examples:**

```bash
# Install an extension
lowcal extensions install my-extension

# List installed extensions
lowcal extensions list

# Update all extensions
lowcal extensions update
```

### MCP Command

Manage Model Context Protocol (MCP) servers.

**Usage:** `lowcal mcp <command> [options]`

**Sub-commands:**

- **`add <name> <command>`**: Add a new MCP server
- **`remove <name>`**: Remove an MCP server
- **`list`**: List all configured MCP servers

**Examples:**

```bash
# Add an MCP server
lowcal mcp add git "npx -y @modelcontextprotocol/server-git"

# List configured servers
lowcal mcp list
```

### Research Command

Conduct deep internet research with citation support.

**Usage:** `lowcal research [mode] <query>`

**Modes:**

- **`speed`**: Fastest research, fewer sources
- **`balanced`** (default): Balanced speed and quality
- **`quality`**: Thorough research with multiple sources
- **`max`**: Maximum depth and breadth of research

**Examples:**

```bash
# Quick research mode
lowcal research speed "latest Node.js features"

# Quality-focused research
lowcal research quality "best practices for React state management"
```

## Custom Commands

For a quick start, see the [example](#example-a-pure-function-refactoring-command) below.

Custom commands allow you to save and reuse your favorite or most frequently used prompts as personal shortcuts within LowCal Code. You can create commands that are specific to a single project or commands that are available globally across all your projects, streamlining your workflow and ensuring consistency.

### File Locations & Precedence

LowCal Code discovers commands from two locations, loaded in a specific order:

1.  **User Commands (Global):** Located in `~/.qwen/commands/`. These commands are available in any project you are working on.
2.  **Project Commands (Local):** Located in `<your-project-root>/.qwen/commands/`. These commands are specific to the current project and can be checked into version control to be shared with your team.

If a command in the project directory has the same name as a command in the user directory, the **project command will always be used.** This allows projects to override global commands with project-specific versions.

### Creating Custom Commands

Custom commands are defined as JSON files in the commands directory. Each file should contain:

```json
{
  "name": "command-name",
  "description": "What this command does",
  "prompt": "The prompt template to execute"
}
```

**Example: Pure Function Refactoring Command**

Create a file `~/.qwen/commands/refactor-to-pure-function.json`:

```json
{
  "name": "refactor-to-pure-function",
  "description": "Refactor the selected code to be a pure function",
  "prompt": "Refactor the following code to be a pure function. Ensure it has no side effects and returns a value:\n\n<CODE>"
}
```

### Using Custom Commands

Once created, custom commands appear in your command list and can be invoked like built-in commands:

```
> @refactor-to-pure-function
```

## Keyboard Shortcuts

| Shortcut  | Description                                                             |
| --------- | ----------------------------------------------------------------------- |
| `Ctrl+C`  | Cancel current operation / Show quit confirmation (press twice to exit) |
| `Ctrl+L`  | Clear the terminal screen                                               |
| `Ctrl+R`  | Search command history                                                  |
| `Up/Down` | Navigate command history                                                |
| `Tab`     | Auto-complete commands and file paths                                   |

## Configuration

Many CLI behaviors can be configured in your `.qwen/settings.json` file. See the [Configuration documentation](configuration.md) for a complete list of settings.
