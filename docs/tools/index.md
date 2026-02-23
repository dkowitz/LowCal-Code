# LowCal Code Tools

LowCal Code includes built-in tools that the model uses to interact with your local environment, access information, and perform actions. These tools enhance the CLI's capabilities, enabling it to go beyond text generation and assist with a wide range of tasks.

## Overview of LowCal Code Tools

In the context of LowCal Code, tools are specific functions or modules that the model can request to be executed. For example, if you ask the model to "Summarize the contents of `my_document.txt`," it will likely identify the need to read that file and will request the execution of the `read_file` tool.

The core component (`packages/core`) manages these tools, presents their definitions (schemas) to the model, executes them when requested, and returns the results to the model for further processing into a user-facing response.

These tools provide the following capabilities:

- **Access local information:** Tools allow the model to access your local file system, read file contents, list directories, etc.
- **Execute commands:** With tools like `shell`, the model can run shell commands (with appropriate safety measures and user confirmation).
- **Interact with the web:** Tools can fetch content from URLs or perform web searches.
- **Take actions:** Tools can modify files, write new files, or perform other actions on your system (again, typically with safeguards).
- **Ground responses:** By using tools to fetch real-time or specific local data, responses can be more accurate, relevant, and grounded in your actual context.
- **Task orchestration:** Advanced tools for managing sub-tasks, scheduling, and session communication.

## How to Use LowCal Code Tools

To use LowCal Code tools, provide a prompt to the CLI. The process works as follows:

1.  You provide a prompt to the CLI.
2.  The CLI sends the prompt to the core.
3.  The core, along with your prompt and conversation history, sends a list of available tools and their descriptions/schemas to the configured model API.
4.  The model analyzes your request. If it determines that a tool is needed, its response will include a request to execute a specific tool with certain parameters.
5.  The core receives this tool request, validates it, and (often after user confirmation for sensitive operations) executes the tool.
6.  The output from the tool is sent back to the model.
7.  The model uses the tool's output to formulate its final answer, which is then sent back through the core to the CLI and displayed to you.

You will typically see messages in the CLI indicating when a tool is being called and whether it succeeded or failed.

## Security and Confirmation

Many tools, especially those that can modify your file system or execute commands (`write_file`, `edit`, `shell`), are designed with safety in mind. LowCal Code will typically:

- **Require confirmation:** Prompt you before executing potentially sensitive operations, showing you what action is about to be taken.
- **Utilize sandboxing:** All tools are subject to restrictions enforced by sandboxing (see [Sandboxing](../sandbox.md)). This means that when operating in a sandbox, any tools (including MCP servers) you wish to use must be available _inside_ the sandbox environment.

It's important to always review confirmation prompts carefully before allowing a tool to proceed.

## Learn More About LowCal Code Tools

LowCal Code's built-in tools can be broadly categorized as follows:

### File System Tools

- **[File System](./file-system.md)** (`read_file`, `write_file`, `edit`): For reading, writing, and modifying files.
- **[Multi-File Read](./multi-file.md)** (`read_many_files`): Reading content from multiple files or directories at once.

### Directory and Search Tools

- **[Directory Listing](#directory-listing)** (`ls`): List directory contents.
- **[Grep](#grep)** (`grep`): Search for patterns in files.
- **[Glob](#glob)** (`glob`): Find files matching glob patterns.
- **[RipGrep](#ripgrep)** (`rip_grep`): Fast text search using ripgrep.

### Execution Tools

- **[Shell](./shell.md)** (`shell`): Execute shell commands.

### Web Tools

- **[Web Fetch](./web-fetch.md)** (`web_fetch`): Retrieve content from URLs.
- **[Web Search](./web-search.md)** (`web_search`): Perform web searches.
- **[SearXNG Search](#searxng-search)** (`searxng_search`): Privacy-focused local web search.

### Task Management Tools

- **[Todo Write](./todo-write.md)** (`todo_write`): Create and manage structured task lists.
- **[Task](#task)** (`task`): Execute tasks with automatic retry on failure.
- **[Task Template](./task-template.md)** (`task_template`): Manage reusable task templates and resolve runtime profiles.
- **[Launch Task](./launch-task.md)** (`launch_task`): Spawn or enqueue task runs with runtime overrides.

### Scheduling Tools

- **[Schedule Task](./schedule-task.md)** (`schedule_task`): Create and manage cron jobs with template/runtime support.
- **[Launch Task State](#launch-task-state)** (`launch_task_state`): Query task status and results.

### Session Communication Tools

- **[Read Session Messages](#read-session-messages)** (`read_session_messages`): Receive messages from launched tasks (user-facing counterpart: `/mailbox`).
- **[Read Collab Messages](#read-collab-messages)** (`read_collab_messages`): Read collab board messages for coordination across sessions.
- **[Post Collab Message](#post-collab-message)** (`post_collab_message`): Post short collab board messages and optionally wake target sessions.

### Memory Tools

- **[Memory](./memory.md)** (`save_memory`, `recall_memory`): Save and recall information across sessions.

### MCP Tools

- **[MCP Server](./mcp-server.md)**: Model Context Protocol integration for external tools.
- **[MCP Client](#mcp-client)** (`mcp_client`): Direct MCP server interaction.
- **[MCP Tool](#mcp-tool)** (`mcp_tool`): Execute MCP-exposed tools.

### Utility Tools

- **[Exit Plan Mode](#exit-plan-mode)** (`exit_plan_mode`): Exit planning mode and execute actions.
- **[Diff Options](#diff-options)** (`diff_options`): Configure file diff behavior.

## Tool Categories Reference

### Directory Listing (`ls`)

Lists directory contents with various options for filtering and formatting.

**Parameters:**

- `path`: The directory to list (default: current directory)
- `recursive`: Whether to list subdirectories recursively
- `hidden`: Whether to include hidden files

**Example Use:** "List all JavaScript files in the src directory"

---

### Grep (`grep`)

Searches for patterns in files using regular expressions.

**Parameters:**

- `pattern`: The regex pattern to search for
- `path`: Directory or file path to search in
- `case_sensitive`: Whether matching is case-sensitive

**Example Use:** "Find all occurrences of 'TODO' in the codebase"

---

### Glob (`glob`)

Finds files and directories matching glob patterns.

**Parameters:**

- `pattern`: The glob pattern (e.g., `src/**/*.ts`)
- `path`: Base directory for the search
- `ignore`: Patterns to exclude from results

**Example Use:** "Find all test files ending in .test.ts"

---

### RipGrep (`rip_grep`)

Fast text search using ripgrep for large codebases.

**Parameters:**

- `pattern`: The pattern to search for
- `path`: Directory to search in
- `file_pattern`: Optional file filter (e.g., `*.ts`)

**Example Use:** "Find all references to 'useState' in TypeScript files"

---

### SearXNG Search (`searxng_search`)

Privacy-focused local web search using a self-hosted SearXNG instance.

**Parameters:**

- `query`: The search query
- `categories`: Optional categories (general, images, news, etc.)
- `language`: Optional language filter

**Example Use:** "Search for privacy-focused alternatives to Google"

---

### Task (`task`)

Executes a task with automatic retry on failure and progress tracking.

**Parameters:**

- `prompt`: The task description
- `max_retries`: Maximum number of retries on failure
- `timeout_minutes`: Task timeout

**Example Use:** "Run the test suite as a task"

---

### Launch Task (`launch_task`)

Spawns a new LowCal instance or queues in-process work.

**Parameters:**

- `action`: create
- `id`: Unique identifier for the task
- `prompt`/`action_value`: Task payload
- `execution_mode`: default, headless, zellij_tab, or in_process
- `template_id`/`template_level`: Template-based prefill
- `auth`/`model`: Per-task runtime overrides

**Example Use:** "Launch a background task to build the project"

---

### Schedule Task (`schedule_task`)

Creates and manages cron jobs for recurring automation.

**Parameters:**

- `action`: create, list, get, update, delete, pause, resume, run_now
- `id`: Job identifier
- `schedule`: Cron expression (e.g., "0 \* \* \* \*")
- `prompt`/`action_value`: Task payload
- `execution_mode`: default, headless, zellij_tab, or in_process
- `template_id`/`template_level`: Template-based prefill
- `auth`/`model`/`run`: Runtime overrides

**Example Use:** "Schedule tests to run every hour"

---

### Task Template (`task_template`)

Manages reusable task templates used by launch/schedule workflows.

**Parameters:**

- `action`: list, get, create, update, delete, validate, resolve
- `id`: Template ID
- `level`: auto, project, user, builtin
- `template`: Template payload for create/update/validate
- `overrides`: Runtime overrides for resolve

**Example Use:** "Create a vision OCR template with LM Studio auth and model defaults"

---

### Launch Task State (`launch_task_state`)

Queries the status and results of launched tasks.

**Parameters:**

- `task_id`: The task identifier to query
- `action`: get, list, or clear

**Example Use:** "Check the status of my background build task"

---

### Read Session Messages (`read_session_messages`)

Receives messages from launched tasks back to the parent session.

**Parameters:**

- `action`: pull, peek, clear, or wait
- `session_id`: Target session mailbox
- `task_id`: Optional filter for specific task

**Example Use:** "Get results from my background research task"

**TUI counterpart:** `/mailbox` provides an interactive mailbox viewer for received/pending task payloads.

---

### Read Collab Messages (`read_collab_messages`)

Reads inter-session collaboration messages from the shared collab board.

**Parameters:**

- `since_seq`: Optional lower bound sequence number (exclusive)
- `limit`: Maximum number of messages to return
- `include_all_targets`: Include all target sessions instead of current-session visibility scope
- `include_expired`: Include TTL-expired messages
- `session_id`: Optional explicit session scope when `include_all_targets` is false

**Example Use:** "Show collab messages since sequence 120 for my session"

**TUI counterpart:** `/collab view --since 120 --limit 20`

---

### Post Collab Message (`post_collab_message`)

Posts short coordination messages to the shared workspace collab board.

**Parameters:**

- `text`: Required short message body
- `to_session_id`: Optional direct target session id (`all`/omitted for broadcast)
- `type`: Optional message type label (`request`, `ack`, `result`, `note`, etc.)
- `refs`: Optional file references for larger payloads
- `in_reply_to`: Optional parent message id for threaded replies
- `ttl_seconds`: Optional expiry
- `notify`: `passive` (default), `wake_view`, or `wake_prompt` (wake modes require direct target)

**Example Use:** "Ask another session to review a file and wake it for immediate action"

**Recommended Protocol (low-noise):**

- `request` -> `ack` -> `result`
- Send one `ack` with `notify='passive'`
- Do not reply to pure acknowledgements
- Use `wake_prompt` for requests or urgent results requiring immediate action

**TUI counterpart:** `/collab post "..." [flags]`

---

### MCP Client (`mcp_client`)

Direct interaction with Model Context Protocol servers.

**Parameters:**

- `server_name`: The MCP server to connect to
- `method`: The method to call
- `params`: Method parameters

**Example Use:** "Query the Git MCP server for recent commits"

---

### MCP Tool (`mcp_tool`)

Execute tools exposed by MCP servers.

**Parameters:**

- `tool_name`: The MCP tool name (e.g., `git__git_log`)
- `arguments`: Tool-specific arguments

**Example Use:** "Run the git log tool from the Git MCP server"

---

### Exit Plan Mode (`exit_plan_mode`)

Exits planning mode and executes the planned actions.

**Parameters:**

- None (used as a command to confirm execution)

**Example Use:** "Exit plan mode and execute the changes"

---

### Diff Options (`diff_options`)

Configures file diff behavior for edit operations.

**Parameters:**

- `context_lines`: Number of context lines in diffs
- `format`: Unified or side-by-side

**Example Use:** "Configure diffs to show 5 lines of context"
