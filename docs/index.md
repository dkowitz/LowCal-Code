# Welcome to LowCal Code Documentation

This documentation provides a comprehensive guide to installing, using, and developing LowCal Code. This tool lets you interact with AI models through a command-line interface.

## Overview

LowCal Code brings the capabilities of advanced code models to your terminal in an interactive Read-Eval-Print Loop (REPL) environment. It consists of a client-side application (`packages/cli`) that communicates with a local server (`packages/core`). LowCal Code also contains a variety of tools for tasks such as performing file system operations, running shells, and web fetching, which are managed by `packages/core`.

### What's New

LowCal Code has been significantly enhanced with:

- **Subagents**: Specialized AI assistants with custom configurations
- **Job Scheduler**: Cron-based scheduling for recurring automated tasks
- **Task Template Library**: Reusable templates with per-task auth/model/runtime profiles
- **Mailbox Browser**: In-session mailbox UI (`/mailbox`) for received/pending task payloads
- **Orchestrator**: Automated session management with health monitoring and recovery
- **Dashboard**: Unified view of all sessions, jobs, and daemon status
- **MCP Integration**: Model Context Protocol server support
- **Extensions**: Installable packages for additional functionality
- **Deep Research Mode**: Comprehensive internet research with multiple strategies

## Navigating the Documentation

This documentation is organized into the following sections:

### Getting Started

- **[README](../README.md)**: Quick start guide and feature overview
- **[Features Matrix](./features.md)**: Complete feature reference by category

### CLI Usage

Documentation for `packages/cli`:

- **[CLI Introduction](./cli/index.md)**: Overview of the command-line interface
- **[Commands](./cli/commands.md)**: Description of all available CLI commands (slash and terminal)
- **[Scheduler](./cli/scheduler.md)**: Scheduler daemon operations and job inspection
- **[Configuration](./cli/configuration.md)**: Information on configuring the CLI
- **[Dashboard](./cli/dashboard.md)**: Unified status monitoring with sessions and jobs
- **[Sessions](./cli/sessions.md)**: Session management commands
- **[Orchestrator](./cli/orchestrator.md)**: Orchestrator daemon management
- **[Extensions](./cli/extensions.md)**: Extension management
- **[MCP](./cli/mcp.md)**: Model Context Protocol server configuration
- **[Research](./cli/research.md)**: Deep internet research mode

### Core Details

Documentation for `packages/core`:

- **[Core Introduction](./core/index.md)**: Overview of the core component
- **[Tools API](./core/tools-api.md)**: Information on how the core manages and exposes tools

### Tools Documentation

- **[Tools Overview](./tools/index.md)**: Overview of all available tools
- **[File System Tools](./tools/file-system.md)**: `read_file`, `write_file`, `edit`
- **[Multi-File Read Tool](./tools/multi-file.md)**: `read_many_files` for batch operations
- **[Shell Tool](./tools/shell.md)**: `shell` for command execution
- **[Web Fetch Tool](./tools/web-fetch.md)**: `web_fetch` for URL content retrieval
- **[Web Search Tool](./tools/web-search.md)**: `web_search` with Tavily integration
- **[Memory Tool](./tools/memory.md)**: `save_memory` for cross-session recall
- **[Todo Write Tool](./tools/todo-write.md)**: `todo_write` for task management

### Advanced Features

- **[Launch Task](./tools/launch-task.md)**: Spawn parallel tasks with `launch_task`
- **[Schedule Task](./tools/schedule-task.md)**: Cron-based automation with `schedule_task`
- **[Task Template](./tools/task-template.md)**: Manage reusable task templates and resolve runtime profiles
- **[Read Session Messages](./tools/read-session-messages.md)**: Inter-session communication
- **[Task Tool](./tools/task.md)**: Execute tasks with automatic retry
- **[Launch Task State](./tools/launch-task-state.md)**: Query task status and results

### Specialized Topics

- **[Subagents](./subagents.md)**: Specialized AI assistants for focused tasks with comprehensive management, configuration, and usage guidance
- **[Orchestrator V1 Spec](./orchestrator-v1.md)**: Session supervision architecture, control API, policy DSL, remediation rules, and rollout plan for autonomous reliability
- **[Checkpointing](./checkpointing.md)**: Automatic session state preservation before file modifications

### Development & Deployment

- **[Execution and Deployment](./deployment.md)**: Information for running LowCal Code
- **[Architecture Overview](./architecture.md)**: Understand the high-level design, including components and how they interact
- **[Sandboxing](./sandbox.md)**: Isolated execution environment configuration
- **[IDE Integration](./ide-integration.md)**: Connect the CLI to your editor
- **[Telemetry](./telemetry.md)**: Overview of telemetry in the CLI

### Additional Resources

- **[Contributing & Development Guide](../CONTRIBUTING.md)**: Information for contributors and developers, including setup, building, testing, and coding conventions
- **[NPM](./npm.md)**: Details on how the project's packages are structured
- **[Troubleshooting Guide](./troubleshooting.md)**: Find solutions to common problems and FAQs
- **[Terms of Service and Privacy Notice](./tos-privacy.md)**: Information on the terms of service and privacy notices applicable to your use of LowCal Code

We hope this documentation helps you make the most of LowCal Code!
