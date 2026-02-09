# Schedule Task Tool

The `schedule_task` tool creates and manages cron jobs for recurring automation. This enables LowCal to execute tasks autonomously on a schedule.

## Overview

Use `schedule_task` when you need:
- **Recurring tasks**: Run tasks repeatedly at specified intervals
- **Delayed execution**: Schedule a task to run at a specific future time
- **Automated monitoring**: Set up jobs to check system health, logs, or external resources
- **Long-horizon workflows**: Break complex tasks into scheduled steps

## Cron Expression Format

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
* * * * *
```

### Common Patterns

| Expression | Description |
|------------|-------------|
| `0 * * * *` | Every hour at minute 0 |
| `0 2 * * *` | Daily at 2:00 AM |
| `*/5 * * * *` | Every 5 minutes |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 0 1 * *` | First day of every month at midnight |
| `0 6 * * 1-5` | Weekdays (Mon-Fri) at 6:00 AM |

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Action to perform: `create`, `list`, `get`, `update`, `delete`, `pause`, `resume`, `run_now` |
| `id` | string | Conditional | Unique identifier for the job (required for most actions) |
| `schedule` | string | Conditional | Cron expression (required for `create`) |
| `prompt` | string | Conditional | Task to execute (required for `create`) |
| `description` | string | No | Human-readable description of what this job does |
| `enabled` | boolean | No | Whether the job is enabled (default: true for create) |
| `timeout_minutes` | number | No | Maximum execution time in minutes (default: 10) |
| `max_failures` | number | No | Number of consecutive failures before auto-pausing (default: 3) |

## Actions

### create
Create a new scheduled job.

```json
{
  "action": "create",
  "id": "hourly-test-runner",
  "schedule": "0 * * * *",
  "prompt": "Run 'npm test'. If tests fail, analyze the errors and create a summary of what needs to be fixed.",
  "description": "Run tests every hour and report failures"
}
```

### list
List all scheduled jobs.

```json
{
  "action": "list"
}
```

### get
Get details of a specific job including recent execution logs.

```json
{
  "action": "get",
  "id": "hourly-test-runner"
}
```

### update
Update an existing job's properties.

```json
{
  "action": "update",
  "id": "hourly-test-runner",
  "schedule": "0 */2 * * *",
  "description": "Run tests every 2 hours instead of hourly"
}
```

### delete
Remove a scheduled job permanently.

```json
{
  "action": "delete",
  "id": "old-job-to-remove"
}
```

### pause
Temporarily disable a job without deleting it.

```json
{
  "action": "pause",
  "id": "hourly-test-runner"
}
```

### resume
Re-enable a paused job.

```json
{
  "action": "resume",
  "id": "hourly-test-runner"
}
```

### run_now
Trigger a job to run immediately (regardless of schedule).

```json
{
  "action": "run_now",
  "id": "hourly-test-runner"
}
```

## Job State and Behavior

- **Job IDs**: Must be unique and contain only letters, numbers, underscores, and hyphens
- **Scheduler Daemon**: The scheduler daemon must be running for jobs to execute (`lowcal scheduler start`)
- **Timeout**: Default timeout is 10 minutes per job execution
- **Auto-Pause**: Jobs auto-pause after 3 consecutive failures (configurable via `max_failures`)
- **Execution Logs**: Stored in `.lowcal/logs/` with timestamps

## Examples

### Hourly Test Runner
```json
{
  "action": "create",
  "id": "hourly-test-runner",
  "schedule": "0 * * * *",
  "prompt": "Run 'npm test'. If tests fail, analyze the errors and create a summary of what needs to be fixed.",
  "description": "Run tests every hour and report failures"
}
```

### Daily Log Monitor
```json
{
  "action": "create",
  "id": "daily-error-check",
  "schedule": "0 9 * * *",
  "prompt": "Check the application error logs for any new errors in the last 24 hours. If found, summarize them and suggest actions.",
  "description": "Monitor error logs daily at 9 AM"
}
```

### Weekly Backup
```json
{
  "action": "create",
  "id": "weekly-backup",
  "schedule": "0 3 * * 0",
  "prompt": "Create a backup of the project directory and store it in /backups/weekly/",
  "description": "Weekly project backup on Sundays at 3 AM"
}
```

### Immediate One-Time Task
```json
{
  "action": "run_now",
  "id": "immediate-analysis"
}
```
(Requires a job to already exist with this ID)

## Use Cases

1. **Recurring Tests**: Run tests hourly or daily to catch regressions early
2. **Automated Monitoring**: Check system health, logs, or external resources regularly
3. **Scheduled Backups**: Create regular backups of important data
4. **Delayed Execution**: Schedule tasks for off-peak hours
5. **Long-Horizon Workflows**: Break complex multi-step processes into scheduled steps

## Related Tools

- [`launch_task`](#launch-task): For immediate, one-time task execution
- [`task`](#task): For single-execution tasks with retry
