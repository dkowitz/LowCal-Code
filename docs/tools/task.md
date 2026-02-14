# Task Tool

The `task` tool executes a task with automatic retry on failure and progress tracking. This is useful for operations that may encounter transient errors.

## Overview

Use the `task` tool when you need:

- **Automatic retries**: Handle transient failures gracefully
- **Progress tracking**: Monitor long-running operations
- **Error handling**: Built-in retry logic with configurable limits
- **Reliable execution**: Ensure critical tasks complete successfully

## Parameters

| Parameter         | Type   | Required | Description                                       |
| ----------------- | ------ | -------- | ------------------------------------------------- |
| `prompt`          | string | Yes      | The task description or instruction to execute    |
| `max_retries`     | number | No       | Maximum number of retries on failure (default: 3) |
| `timeout_minutes` | number | No       | Task timeout in minutes (default: 10)             |

## Behavior

### Retry Logic

- On failure, the task automatically retries up to `max_retries` times
- Retries are spaced with exponential backoff
- After all retries are exhausted, the task fails and reports the error

### Progress Tracking

- The tool provides periodic progress updates
- You can query task status during execution
- Failed tasks include detailed error information for debugging

## Examples

### Basic Task Execution

```json
{
  "prompt": "Download the latest dataset from the API endpoint",
  "max_retries": 3,
  "timeout_minutes": 5
}
```

### Long-Running Data Processing

```json
{
  "prompt": "Process all CSV files in the data directory and generate summary reports",
  "max_retries": 2,
  "timeout_minutes": 30
}
```

### Critical Database Migration

```json
{
  "prompt": "Run database migration script and verify success",
  "max_retries": 5,
  "timeout_minutes": 15
}
```

## Use Cases

1. **Network Operations**: Download files, API calls, or data transfers prone to network issues
2. **Database Operations**: Migrations, backups, or queries that may timeout
3. **File Processing**: Large file operations that can be interrupted
4. **Build Operations**: Compilation or packaging with transient failures
5. **Critical Tasks**: Any operation where reliability is paramount

## Related Tools

- [`task_template`](./task-template.md): For reusable task definitions and runtime profiles
- [`launch_task`](./launch-task.md): For spawning independent tasks without automatic retry
- [`schedule_task`](./schedule-task.md): For recurring automated tasks
