# LowCal Code Feature Matrix

This document provides a comprehensive overview of all LowCal Code features, organized by category and functionality level.

## Table of Contents

- [Core Capabilities](#core-capabilities)
- [AI & Model Integration](#ai--model-integration)
- [File System Operations](#file-system-operations)
- [Execution & Shell Commands](#execution--shell-commands)
- [Web & Research Tools](#web--research-tools)
- [Task Management](#task-management)
- [Scheduling & Automation](#scheduling--automation)
- [Session Management](#session-management)
- [Extensibility](#extensibility)
- [Developer Features](#developer-features)

---

## Core Capabilities

| Feature                   | Description                                                  | Status    |
| ------------------------- | ------------------------------------------------------------ | --------- |
| **AI-Powered CLI**        | Natural language command-line interface with LLM integration | ✅ Stable |
| **Code Understanding**    | Analyze, explain, and navigate codebases                     | ✅ Stable |
| **Multi-File Operations** | Read and process multiple files simultaneously               | ✅ Stable |
| **Project Context**       | Automatic context generation via LOWCAL.md                   | ✅ Stable |

---

## AI & Model Integration

| Feature             | Description                                                         | Status    | Notes                                          |
| ------------------- | ------------------------------------------------------------------- | --------- | ---------------------------------------------- |
| **Model Selection** | Choose from LM Studio, OpenRouter, OpenAI, and compatible providers | ✅ Stable | Dynamic model listing for supported providers  |
| **Custom Prompts**  | Create and manage system prompts for specialized workflows          | ✅ Stable | Support for EXCLUSIVE and SUPPLEMENTAL modes   |
| **Prompt Modes**    | Auto-adjust prompt verbosity based on endpoint                      | ✅ Stable | `full`, `concise`, `auto` modes                |
| **Subagents**       | Specialized AI assistants with custom configurations                | ✅ Stable | Project-level and user-level agents            |
| **Toolsets**        | Custom tool collections for optimized workflows                     | ✅ Stable | Reduce context space by excluding unused tools |

---

## File System Operations

| Feature                   | Description                                            | Status    | Notes                                |
| ------------------------- | ------------------------------------------------------ | --------- | ------------------------------------ |
| **Read Files**            | Read single or multiple files with syntax highlighting | ✅ Stable | Supports binary and text files       |
| **Write Files**           | Create or overwrite files with user confirmation       | ✅ Stable | Safe write operations                |
| **Edit Files**            | In-place modifications with diff preview               | ✅ Stable | Requires approval for safety         |
| **Directory Listing**     | List directory contents recursively                    | ✅ Stable | Supports hidden files and filtering  |
| **Glob Patterns**         | Find files using glob patterns                         | ✅ Stable | Supports `**`, `*`, `?` wildcards    |
| **Fast Search (RipGrep)** | High-performance text search in codebases              | ✅ Stable | Uses ripgrep for speed               |
| **Pattern Search (Grep)** | Regex-based file content search                        | ✅ Stable | Case-sensitive and insensitive modes |

---

## Execution & Shell Commands

| Feature             | Description                           | Status    | Notes                            |
| ------------------- | ------------------------------------- | --------- | -------------------------------- |
| **Shell Execution** | Run arbitrary shell commands          | ✅ Stable | Requires confirmation for safety |
| **Approval Modes**  | Configure when to prompt for approval | ✅ Stable | `ask`, `yolo`, `plan` modes      |
| **Sandboxing**      | Isolated execution environment        | ✅ Stable | Docker-based sandbox support     |

---

## Web & Research Tools

| Feature                 | Description                                              | Status    | Notes                                       |
| ----------------------- | -------------------------------------------------------- | --------- | ------------------------------------------- |
| **Web Fetch**           | Retrieve content from URLs                               | ✅ Stable | HTML to markdown conversion                 |
| **Web Search (Tavily)** | Perform web searches with citations                      | ✅ Stable | Free tier: 1,000 calls/month                |
| **SearXNG Search**      | Privacy-focused local web search                         | ✅ Stable | Self-hosted SearXNG instance                |
| **Deep Research Mode**  | Comprehensive internet research with multiple strategies | ✅ Stable | `speed`, `balanced`, `quality`, `max` modes |

---

## Task Management

| Feature                   | Description                                       | Status    | Notes                                             |
| ------------------------- | ------------------------------------------------- | --------- | ------------------------------------------------- |
| **Task Execution**        | Execute tasks with automatic retry on failure     | ✅ Stable | Configurable max retries and timeout              |
| **Task Templates**        | Reusable templates for launch/schedule workflows  | ✅ Stable | Project/user scopes, skeleton to fully prefilled  |
| **Launch Task**           | Spawn or enqueue task runs with runtime overrides | ✅ Stable | `headless`, `zellij_tab`, `in_process`, `default` |
| **Read Session Messages** | Receive messages from launched tasks              | ✅ Stable | `pull`, `peek`, `clear`, `wait` actions           |
| **Task State Query**      | Monitor task status and results                   | ✅ Stable | Get, list, clear operations                       |

---

## Scheduling & Automation

| Feature              | Description                                 | Status    | Notes                                                |
| -------------------- | ------------------------------------------- | --------- | ---------------------------------------------------- |
| **Job Scheduler**    | Cron-based scheduling for recurring tasks   | ✅ Stable | Full cron expression support, template-aware runtime |
| **Scheduler Daemon** | Background scheduler process                | ✅ Stable | Start/stop/status/list/get/mode/logs management      |
| **Orchestrator**     | Automated session management and recovery   | ✅ Stable | Health monitoring, automatic recovery                |
| **Dashboard**        | Unified view of sessions, jobs, and daemons | ✅ Stable | Interactive watch mode with refresh                  |

---

## Session Management

| Feature                      | Description                                  | Status    | Notes                                    |
| ---------------------------- | -------------------------------------------- | --------- | ---------------------------------------- |
| **Session List**             | View all active sessions                     | ✅ Stable | Real-time status updates                 |
| **Session Details**          | Inspect individual session state             | ✅ Stable | JSON output for programmatic access      |
| **Stale Session Cleanup**    | Remove inactive sessions                     | ✅ Stable | Configurable TTL threshold               |
| **Conversation Save/Resume** | Branch and resume conversation states        | ✅ Stable | Tag-based checkpoint system              |
| **Project Summary**          | Generate comprehensive project documentation | ✅ Stable | Auto-saves to `.qwen/PROJECT_SUMMARY.md` |

---

## Extensibility

| Feature             | Description                                       | Status    | Notes                                   |
| ------------------- | ------------------------------------------------- | --------- | --------------------------------------- |
| **Extensions**      | Installable packages for additional functionality | ✅ Stable | Project-level and user-level extensions |
| **MCP Servers**     | Model Context Protocol server integration         | ✅ Stable | Multiple servers supported              |
| **Custom Commands** | Save favorite prompts as personal shortcuts       | ✅ Stable | Global and project-specific commands    |

---

## Developer Features

| Feature                  | Description                                  | Status    | Notes                                      |
| ------------------------ | -------------------------------------------- | --------- | ------------------------------------------ |
| **Token Counting**       | Show token usage for files and conversations | ✅ Stable | Real-time token tracking                   |
| **Export Conversations** | Save conversation history to markdown        | ✅ Stable | Full, compact, and report formats          |
| **View Files In-Chat**   | Display markdown/text files in chat window   | ✅ Stable | Scrollable viewer with keyboard navigation |
| **Vim Mode**             | Vim-style editing in the input area          | ✅ Stable | NORMAL and INSERT modes                    |

---

## Command Reference Summary

### Terminal Commands

| Command               | Subcommands                                               | Description                         |
| --------------------- | --------------------------------------------------------- | ----------------------------------- |
| `lowcal dashboard`    | -                                                         | Unified status monitoring           |
| `lowcal sessions`     | list, get, prune                                          | Session management                  |
| `lowcal scheduler`    | start, stop, status, list, get, mode, delete, reset, logs | Scheduler daemon and job operations |
| `lowcal tasks`        | open, list, run, schedule                                 | Task template management/deploy     |
| `lowcal orchestrator` | start, stop, status                                       | Orchestrator daemon control         |
| `lowcal extensions`   | install, uninstall, list, update, disable, enable         | Extension management                |
| `lowcal mcp`          | add, remove, list                                         | MCP server configuration            |
| `lowcal research`     | [mode] <query>                                            | Deep internet research              |

### In-Session Commands

| Command                                                          | Description                                    |
| ---------------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| `/help`, `/h`                                                    | Display available commands                     |
| `/clear`                                                         | Clear conversation history                     |
| `/summary`                                                       | Generate project summary                       |
| `/compress`                                                      | Compress conversation history                  |
| `/chat save/resume/list/delete <tag>`                            | Conversation state management (legacy)         |
| `/resume list/delete <index/id>`                                 | Resume from automatic checkpointing system     |
| `/model`                                                         | Select a model                                 |
| `/tasks`                                                         | Open task template editor and deploy templates |
| `/agents create/manage`                                          | Subagent management                            |
| `/tools [desc/nodesc]`                                           | List available tools                           |
| `/prompt list/show/create/delete/activate/disable [--exclusive]` | Custom prompt management                       |
| `/promptmode set <full/concise/auto>`                            | System prompt mode                             |
| `/approval-mode <ask/yolo/plan> [--project                       | --user]`                                       | Approval configuration |
| `/directory add/remove/list`                                     | Workspace directory management                 |
| `/init`                                                          | Generate LOWCAL.md                             |
| `/bug`                                                           | File an issue                                  |

---

## Feature Comparison: LowCal vs Qwen Code

| Feature               | LowCal                   | Original Qwen Code |
| --------------------- | ------------------------ | ------------------ |
| LM Studio Integration | ✅ Optimized             | ⚠️ Basic support   |
| OpenRouter Support    | ✅ Full                  | ✅ Full            |
| Custom Prompts        | ✅ Advanced              | ✅ Basic           |
| Subagents             | ✅ Full                  | ❌ Not available   |
| Job Scheduler         | ✅ Full cron support     | ❌ Not available   |
| Orchestrator          | ✅ Session recovery      | ❌ Not available   |
| Dashboard             | ✅ Unified view          | ❌ Not available   |
| SearXNG Search        | ✅ Local privacy-focused | ❌ Not available   |
| MCP Integration       | ✅ Full                  | ⚠️ Limited         |

---

## Getting Started

### For New Users

1. Install LowCal Code following the [Installation Guide](../README.md#installation)
2. Configure your model provider (LM Studio or OpenRouter)
3. Run `lowcal` to start the CLI
4. Try `/init` to generate project context
5. Explore `/help` for available commands

### For Advanced Users

1. Set up custom prompts with `/prompt create`
2. Configure subagents with `/agents create`
3. Build reusable templates with `/tasks` and deploy via `lowcal tasks schedule`
4. Connect MCP servers for external tools
5. Create custom commands in `.qwen/commands/`

---

## Support & Community

- [Documentation](./index.md) - Complete documentation index
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Architecture](./architecture.md) - System architecture details
- [Contributing](../CONTRIBUTING.md) - How to contribute
