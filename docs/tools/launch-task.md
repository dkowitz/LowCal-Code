# Launch Task Tool

The `launch_task` tool spawns a new LowCal instance to execute a task immediately, without scheduling. This enables parallel work and background processing.

## Overview

Use `launch_task` when you need:
- **Immediate execution**: Run a task right away without waiting for a scheduler
- **Isolated execution**: Execute in a clean environment separate from the current session
- **Background processing**: Offload long-running tasks to run concurrently
- **Zellij integration**: Monitor progress in dedicated Zellij tabs

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the task (letters, numbers, underscores, hyphens) |
| `prompt` | string | Yes | The task/instruction to execute |
| `description` | string | No | Human-readable description of what this task does |
| `execution_mode` | string | No | Execution mode: `headless`, `zellij_tab`, or `default` |
| `execution_mode_override` | boolean | No | Set to true to apply execution_mode (defaults to false) |
| `return_to_session_id` | string | No | Session ID to receive completion messages (defaults to current session) |
| `idempotency_key` | string | No | Dedupe key for retrying tasks without spawning duplicates |
| `allow_recursive` | boolean | No | Allow launch_task from within launched headless tasks (default: false) |

## Execution Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `headless` | Runs silently without UI, ideal for automated tasks | Background processing, CI/CD |
| `zellij_tab` | Opens in a new Zellij tab if running in Zellij | Monitoring progress visually |
| `default` | Uses your configured scheduler default mode | General use |

## Examples

### Basic Background Task
```json
{
  "id": "build-project",
  "prompt": "Run 'npm run build && npm test'. Report any failures.",
  "description": "Build and test the project in background"
}
```

### Zellij Tab for Monitoring
```json
{
  "id": "log-monitor",
  "prompt": "Tail the application.log file and report any errors you see.",
  "execution_mode": "zellij_tab",
  "execution_mode_override": true,
  "description": "Monitor logs in separate tab"
}
```

### Parallel Research Tasks
```json
{
  "id": "research-frontend",
  "prompt": "Research the latest React performance optimization techniques. Focus on hooks and concurrent features.",
  "description": "Research frontend optimization"
}
```
```json
{
  "id": "research-backend",
  "prompt": "Research Node.js 20+ best practices for microservices architecture.",
  "description": "Research backend architecture"
}
```

### Idempotent Task (Deduplication)
```json
{
  "id": "daily-report",
  "prompt": "Generate the daily project status report.",
  "idempotency_key": "daily-report-2026-02-09",
  "description": "Generate daily report"
}
```

## Parent Protocol (Recommended)

For one objective, follow this sequence:

1. **Launch exactly one task first** with `launch_task`
2. **Set a stable `idempotency_key`** for this objective
3. **After launch**, use `read_session_messages` with `action: "wait"` and the same `task_id`
4. **If wait times out**, assume task may still be running; do not spawn a duplicate. Wait again or report running status.
5. **Use logs only** for debugging when mailbox/state indicates failure or missing return.

## Use Cases

1. **Parallel Processing**: Run multiple independent tasks simultaneously
2. **Long-Running Operations**: Offload builds, tests, or data processing to background
3. **Monitoring Tasks**: Tail logs, watch files, or monitor services in separate tabs
4. **Batch Operations**: Process multiple files or directories concurrently
5. **Isolated Environments**: Run potentially destructive operations safely

## Related Tools

- [`schedule_task`](#schedule-task): For recurring scheduled tasks
- [`read_session_messages`](#read-session-messages): To receive task results
- [`task`](#task): For single-execution tasks with retry
