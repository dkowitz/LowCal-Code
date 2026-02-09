# Launch Task State Tool

The `launch_task_state` tool queries the status and results of launched tasks. This enables monitoring and management of background operations.

## Overview

Use `launch_task_state` when you need to:
- **Check task status**: Verify if a task is running, completed, or failed
- **Get task results**: Retrieve output from completed tasks
- **List active tasks**: See all currently running or queued tasks
- **Clear task state**: Remove completed task records

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Action to perform: `get`, `list`, or `clear` |
| `task_id` | string | Conditional | The task identifier (required for `get`) |

## Actions

### get
Get the current state and result of a specific task.

```json
{
  "action": "get",
  "task_id": "my-background-task"
}
```

**Returns:** Task state object containing:
- `status`: `running`, `completed`, or `failed`
- `result`: Task output (if completed)
- `error`: Error message (if failed)
- `started_at`: ISO timestamp when task started
- `finished_at`: ISO timestamp when task finished (if applicable)

### list
List all active tasks with their status.

```json
{
  "action": "list"
}
```

**Returns:** Array of task state objects, each containing:
- `task_id`: Unique identifier
- `status`: Current status
- `prompt_preview`: Brief description of the task

### clear
Clear completed task records from the state store.

```json
{
  "action": "clear",
  "task_id": "my-background-task"
}
```

Or clear all completed tasks:
```json
{
  "action": "clear"
}
```

## Task States

| State | Description |
|-------|-------------|
| `running` | Task is currently executing |
| `completed` | Task finished successfully |
| `failed` | Task failed after all retries |

## Examples

### Check Task Status
```json
{
  "action": "get",
  "task_id": "build-project"
}
```

**Example Response:**
```json
{
  "status": "running",
  "started_at": "2026-02-09T18:30:00.000Z",
  "progress": {
    "stage": "compiling",
    "percentage": 75
  }
}
```

### List All Active Tasks
```json
{
  "action": "list"
}
```

**Example Response:**
```json
[
  {
    "task_id": "build-project",
    "status": "running",
    "prompt_preview": "Build the project and run tests..."
  },
  {
    "task_id": "daily-report",
    "status": "completed",
    "finished_at": "2026-02-09T18:00:00.000Z"
  }
]
```

### Clear Completed Tasks
```json
{
  "action": "clear"
}
```

## Use Cases

1. **Progress Monitoring**: Check how long a task has been running
2. **Result Retrieval**: Get output from completed background tasks
3. **Debugging**: Inspect failed tasks for error details
4. **Cleanup**: Remove old task records to free up space
5. **Coordination**: Manage multiple concurrent tasks

## Related Tools

- [`launch_task`](#launch-task): For spawning sub-tasks
- [`read_session_messages`](#read-session-messages): For receiving task results via mailbox
