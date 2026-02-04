# LowCal Scheduler Implementation Summary

## Overview
This implementation adds a comprehensive scheduling system to LowCal, enabling it to execute tasks autonomously on a schedule. This is Phase 1 of the scheduler feature, providing the core infrastructure for cron-based job scheduling.

## What Was Implemented

### 1. Core Scheduler Types and Schema (`packages/core/src/scheduler/`)
- **types.ts**: Defines all TypeScript interfaces and types for the scheduling system
  - `Job`: Represents a scheduled task with id, schedule (cron), prompt, status, etc.
  - `CronStore`: Root structure for the cron.json persistence file
  - `JobExecutionResult`: Result of a job execution
  - `SchedulerConfig`: Configuration for the scheduler daemon
  - `DaemonStatus`: Status information for the daemon

### 2. Job Store (`packages/core/src/scheduler/job-store.ts`)
Implements file-based persistence with:
- **File locking**: Prevents concurrent writes using a simple lock file mechanism
- **Cron parsing**: Custom implementation for validating and parsing 5-field cron expressions
- **Next run calculation**: Computes the next execution time for jobs
- **Job lifecycle management**: Create, read, update, delete, pause, resume jobs
- **Execution logging**: Saves job execution results to log files
- **Log cleanup**: Removes old log files based on retention policy

### 3. Schedule Task Tool (`packages/core/src/tools/schedule-task.ts`)
A new tool available to the LLM for managing scheduled tasks:
- **Actions**: create, list, get, update, delete, pause, resume, run_now
- **Validation**: Validates cron expressions and job IDs
- **User-friendly output**: Formatted markdown output for job listings and details

### 4. Scheduler Daemon (`packages/cli/src/scheduler/daemon.ts`)
A background process that:
- **Ticks every minute**: Checks for due jobs
- **Executes jobs**: Spawns headless LowCal processes to run scheduled tasks
- **Zellij mode (optional)**: Can run jobs in a new Zellij tab when available
- **Manages state**: Updates job status, tracks execution counts
- **Auto-pause**: Pauses jobs after consecutive failures
- **PID management**: Tracks daemon process for start/stop operations

### 5. Headless Execution Mode (`packages/cli/src/scheduler/headless.ts`)
Fully functional headless execution for scheduled jobs:
- Loads settings and memory from the workspace
- Creates a minimal Config for headless operation
- Captures stdout/stderr during execution
- Runs the full non-interactive mode with tool support
- Saves execution results to log files
- Uses YOLO approval mode to avoid interactive prompts

### 6. CLI Commands (`packages/cli/src/commands/scheduler.ts`)
Command-line interface for managing the scheduler:
- `lowcal scheduler start`: Start the daemon
- `lowcal scheduler stop`: Stop the daemon
- `lowcal scheduler status`: Show daemon status and all jobs
- `lowcal scheduler list`: List all scheduled jobs
- `lowcal scheduler get <id>`: Show job details
- `lowcal scheduler logs <id>`: Show execution logs

## Files Created/Modified

### New Files
1. `packages/core/src/scheduler/types.ts` - Type definitions
2. `packages/core/src/scheduler/job-store.ts` - Persistence layer
3. `packages/core/src/scheduler/index.ts` - Module exports
4. `packages/core/src/tools/schedule-task.ts` - LLM tool
5. `packages/cli/src/scheduler/daemon.ts` - Background daemon
6. `packages/cli/src/scheduler/headless.ts` - Headless execution
7. `packages/cli/src/commands/scheduler.ts` - CLI commands

### Modified Files
1. `packages/core/src/tools/tool-names.ts` - Added SCHEDULE_TASK
2. `packages/core/src/tools/tool-registry.ts` - Registered tool (implicit via config)
3. `packages/core/src/config/config.ts` - Registered ScheduleTaskTool
4. `packages/core/src/index.ts` - Exported scheduler modules
5. `packages/cli/src/config/config.ts` - Added scheduler command

## Usage Examples

### Creating a Scheduled Job
```bash
# Using the tool within LowCal
lowcal --prompt "Create a scheduled job named 'hourly-tests' that runs 'npm test' every hour"

# Or directly using the schedule_task tool
lowcal --prompt "Use schedule_task to create a job with id 'hourly-tests', schedule '0 * * * *', and prompt 'Run npm test and report results'"
```

### Managing the Scheduler
```bash
# Start the scheduler daemon
lowcal scheduler start

# Check status
lowcal scheduler status

# List all jobs
lowcal scheduler list

# View job details
lowcal scheduler get hourly-tests

# View execution logs
lowcal scheduler logs hourly-tests

# Stop the daemon
lowcal scheduler stop
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User/LLM      │────▶│  schedule_task   │────▶│   cron.json     │
│                 │     │     tool         │     │   (Job Store)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Scheduler Daemon │
                       │   (ticks/minute)   │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Headless LowCal │
                       │   (job execution)│
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Execution Logs  │
                       └──────────────────┘
```

## Cron Expression Format
The scheduler uses standard 5-field cron expressions:
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
```

Examples:
- `0 * * * *` - Every hour
- `0 2 * * *` - Daily at 2:00 AM
- `*/5 * * * *` - Every 5 minutes
- `0 9 * * 1` - Every Monday at 9:00 AM

## Configuration
Default configuration (defined in `types.ts`):
- Tick interval: 60 seconds
- Max concurrent jobs: 5
- Default timeout: 10 minutes
- Max failures before auto-pause: 3
- Max jobs: 100
- Log retention: 30 days
- Logs per job: 10

Scheduler execution mode (CLI settings):
- `scheduler.executionMode`: `headless` (default) or `zellij_tab`
- Per-job override via the schedule_task parameter `execution_mode`

## Future Enhancements (Phase 2+)
1. **Heartbeat/self-monitoring**: Jobs that monitor other jobs and system health
2. **External triggers**: Webhook-based job triggering
3. **Job dependencies**: Chain jobs together with dependencies
4. **Retry logic**: Configurable retry strategies with exponential backoff
5. **Notifications**: Email/Slack alerts for job failures
6. **Job templates**: Pre-defined job templates for common tasks
7. **Execution history**: Database-backed history instead of files
8. **Distributed scheduling**: Support for multi-machine deployments

## Testing
The implementation passes:
- ✅ TypeScript type checking
- ✅ Build process
- ✅ ESLint validation

## Notes
- ✅ **Headless execution is now fully implemented** with core API integration
- The scheduler daemon uses file-based locking which is suitable for single-machine deployments
- For production use, consider implementing a database-backed job store for better scalability
- Jobs run in YOLO mode (auto-approve) to avoid interactive prompts during scheduled execution
