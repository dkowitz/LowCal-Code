# Dashboard Command

The `dashboard` command provides a comprehensive, interactive overview of all LowCal Code sessions, scheduled jobs, and daemon status in a single terminal interface.

## Overview

The dashboard displays:
- **Active Sessions**: All running LowCal sessions with their status, PID, working directory, and health metrics
- **Scheduled Jobs**: Current scheduler job status including next run times and execution modes
- **Daemon Status**: Health indicators for both the scheduler and orchestrator daemons

## Usage

```bash
lowcal dashboard [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--ttl <seconds>` | Stale threshold in seconds. Sessions not seen for this duration are marked as stale. | 180 (3 minutes) |
| `--watch` | Keep the dashboard live with automatic refreshes. Press Ctrl+C to exit. | false |
| `--interval <seconds>` | Refresh interval when watch mode is enabled. | 2 |

## Dashboard Sections

### Sessions Section
Shows all active sessions with:
- **Status**: `WORKING`, `IDLE`, or `STALE` (color-coded)
- **Session ID**: Unique identifier for the session
- **Mode**: Execution mode (`chat`, `file`, etc.)
- **PID**: Process ID
- **Working Directory**: Current project path
- **Started/Last Seen**: Timestamps for session lifecycle
- **Job ID**: Associated scheduled job (if any)
- **Active Executions**: Number of concurrent tool executions
- **Health Status**: Health score and remediation stage if applicable

### Scheduler Section
Shows:
- **Daemon Status**: Running/not running with PID
- **Total Jobs**: Count of scheduled jobs
- **Upcoming Jobs**: List of next scheduled job IDs

## Interactive Controls (in watch mode)

| Key | Action |
|-----|--------|
| `Ctrl+C` | Exit dashboard |
| `p` | Prune stale sessions |

## Examples

### Basic Dashboard View
```bash
lowcal dashboard
```

### Live Monitoring with Custom Refresh
```bash
# Refresh every 5 seconds with a longer stale threshold
lowcal dashboard --watch --interval 5 --ttl 600
```

### Quick Status Check
```bash
# Get current status without interactive mode
lowcal scheduler status
lowcal orchestrator status
```

## Use Cases

1. **Monitoring CI/CD Pipelines**: Watch long-running automated tasks in real-time
2. **Debugging Stuck Sessions**: Identify sessions that haven't reported activity recently
3. **Job Management**: Review scheduled job status and next execution times
4. **System Health**: Verify daemons are running properly

## Related Commands

- [`lowcal sessions`](#sessions-command) - Detailed session management
- [`lowcal scheduler`](#scheduler-command) - Job scheduling control
- [`lowcal orchestrator`](#orchestrator-command) - Orchestrator daemon management
