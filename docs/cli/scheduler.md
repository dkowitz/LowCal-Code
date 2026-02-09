# Scheduler Command

The `scheduler` command manages the LowCal scheduler daemon and scheduled jobs for automated task execution.

## Overview

The scheduler allows you to run LowCal Code tasks on a recurring basis using cron-style scheduling. This is useful for:
- Automated testing and builds
- Periodic code analysis
- Scheduled reports and summaries
- Regular data collection or monitoring

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

The daemon runs in the background and executes scheduled jobs at their configured times.

**Example Output:**
```
✓ Scheduler daemon started successfully

Status:
  Running: Yes
  PID: 12345
  Total jobs: 3
  Active executions: 0

Upcoming jobs:
  - daily-tests
  - weekly-report
  - hourly-backup
```

### stop

Stop the scheduler daemon.

```bash
lowcal scheduler stop
```

**Example Output:**
```
✓ Scheduler daemon stopped
```

### status

Show current scheduler status.

```bash
lowcal scheduler status
```

**Example Output:**
```
Running: yes
PID: 12345
Jobs: 3 scheduled
Next job: daily-tests at 9:00 AM
Active executions: 0
Last tick: 2/9/2026, 10:30 AM
```

### list

List all scheduled jobs.

```bash
lowcal scheduler list [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

**Example Output:**
```
🟢 daily-tests (running)
   Schedule: 0 9 * * *
   Next run: 2/10/2026, 9:00 AM
   Last run: 2/9/2026, 9:00 AM
   Runs: 45 successful, 2 failed
   Execution: headless (default)

🔴 weekly-report
   Schedule: 0 8 * * 1
   Next run: 2/16/2026, 8:00 AM
   Last run: 2/2/2026, 8:00 AM
   Runs: 4 successful, 0 failed
   Execution: zellij_tab

   Generate weekly project summary report
```

### add

Add a new scheduled job.

```bash
lowcal scheduler add --id <job-id> --schedule <cron-expression> --prompt <prompt>
```

**Options:**
| Option | Description | Required |
|--------|-------------|----------|
| `--id` | Unique identifier for the job | Yes |
| `--schedule` | Cron expression (e.g., "0 9 * * *" for daily at 9 AM) | Yes |
| `--prompt` | The prompt/instruction to execute | Yes |
| `--description` | Human-readable description | No |
| `--execution-mode` | Execution mode: headless, zellij_tab, or default | No |
| `--timeout <minutes>` | Job timeout in minutes | No (default: 10) |
| `--enabled` | Whether the job is enabled | No (default: true) |

**Cron Expression Format:**
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
* * * * *
```

**Examples:**
```bash
# Run tests every hour
lowcal scheduler add --id hourly-tests --schedule "0 * * * *" \
  --prompt "Run npm test and report results"

# Daily build at 9 AM
lowcal scheduler add --id daily-build --schedule "0 9 * * *" \
  --prompt "Build the project and check for errors" \
  --description "Daily build verification"

# Weekly report on Monday at 8 AM
lowcal scheduler add --id weekly-report --schedule "0 8 * * 1" \
  --prompt "Generate a summary of this week's work" \
  --execution-mode zellij_tab

# Every 5 minutes (monitoring)
lowcal scheduler add --id health-check --schedule "*/5 * * * *" \
  --prompt "Check system health and report any issues" \
  --timeout 2
```

### remove / delete

Remove a scheduled job.

```bash
lowcal scheduler remove <job-id>
# or
lowcal scheduler delete <job-id>
```

**Example:**
```bash
lowcal scheduler remove hourly-tests
```

### pause

Temporarily disable a scheduled job without deleting it.

```bash
lowcal scheduler pause <job-id>
```

The job will not run at its scheduled time but can be resumed later.

### resume

Re-enable a paused job.

```bash
lowcal scheduler resume <job-id>
```

### reset

Reset a failed job to allow retry. Use this when a job has failed multiple times and you want to clear the failure count.

```bash
lowcal scheduler reset <job-id>
```

## Examples

### Create a Daily Test Suite
```bash
lowcal scheduler add \
  --id daily-tests \
  --schedule "0 9 * * *" \
  --prompt "Run the full test suite with coverage and report results" \
  --description "Daily test suite execution"
```

### Monitor a Service
```bash
lowcal scheduler add \
  --id service-monitor \
  --schedule "*/15 * * * *" \
  --prompt "Check if the API is responding and report any issues" \
  --timeout 5 \
  --execution-mode headless
```

### View All Jobs
```bash
# List all jobs with details
lowcal scheduler list

# Get JSON output for scripting
lowcal scheduler list --json
```

## Job Execution Modes

| Mode | Description |
|------|-------------|
| `headless` | Runs silently without UI, ideal for automated tasks |
| `zellij_tab` | Opens in a new Zellij tab for visibility during execution |
| `default` | Uses the scheduler's configured default mode |

## Best Practices

1. **Set appropriate timeouts**: Long-running jobs should have generous timeout values
2. **Use descriptive IDs**: Choose meaningful job IDs that describe what the job does
3. **Add descriptions**: Help others (and your future self) understand each job's purpose
4. **Test cron expressions**: Use tools like crontab.guru to verify your schedule
5. **Monitor failures**: Regularly check job status and investigate failures

## Related Commands

- [`lowcal dashboard`](dashboard.md) - Unified view of scheduler status
- [`lowcal orchestrator`](orchestrator.md) - Session orchestration
