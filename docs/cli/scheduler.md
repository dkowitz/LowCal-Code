# Scheduler Command

The `scheduler` command manages the LowCal scheduler daemon and provides operational controls for existing scheduled jobs.

## Overview

Use this command to:

- start/stop the scheduler daemon
- inspect scheduled jobs and their runtime state
- adjust job execution mode overrides
- reset or delete jobs
- review execution logs

Job creation and updates are handled by the `schedule_task` tool (or via `/tasks schedule` / `lowcal tasks schedule`).

## Usage

```bash
lowcal scheduler <command> [options]
```

## Sub-commands

### start

Start the scheduler daemon.

```bash
lowcal scheduler start
```

### stop

Stop the scheduler daemon.

```bash
lowcal scheduler stop
```

### status

Show daemon + job status. Supports live mode.

```bash
lowcal scheduler status [--watch] [--interval <seconds>]
```

### list

List all scheduled jobs.

```bash
lowcal scheduler list
```

### get

Show details for one job.

```bash
lowcal scheduler get <job-id>
```

### mode

Set or clear a per-job execution mode override.

```bash
lowcal scheduler mode <job-id> <headless|zellij_tab|default>
```

### delete

Delete a scheduled job permanently.

```bash
lowcal scheduler delete <job-id>
```

### reset

Reset a failed/paused job so it can run again.

```bash
lowcal scheduler reset <job-id>
```

### logs

Show recent execution logs for a job.

```bash
lowcal scheduler logs <job-id> [--tail <count>]
```

## Creating Jobs

Create jobs through task-template and tool workflows:

```bash
# Schedule from template in TUI
/tasks schedule nightly-compress "0 2 * * *" --id nightly-compress

# Schedule from template in terminal mode
lowcal tasks schedule nightly-compress "0 2 * * *" --id nightly-compress
```

Or by calling `schedule_task` directly from a prompt/tool call.

## Runtime Notes

- Jobs can run in `headless`, `zellij_tab`, or `in_process` mode.
- `in_process` jobs require a target interactive session (`return_to_session_id` or `run.returnToSession`).
- Scheduler `get` output includes runtime profile details when present (template, auth/model overrides, action type/value, run settings).

## Related Commands

- [`lowcal tasks`](./commands.md#tasks-command) - Template management and deploy
- [`lowcal dashboard`](./dashboard.md) - Unified session/job/daemon view
- [`lowcal orchestrator`](./orchestrator.md) - Session orchestration
