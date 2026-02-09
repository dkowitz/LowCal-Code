# Orchestrator Command

The `orchestrator` command manages the LowCal orchestrator daemon for automated session management and recovery.

## Overview

The orchestrator is responsible for:
- Monitoring session health and detecting issues
- Automatically recovering from common problems
- Managing session lifecycle across multiple tasks
- Coordinating between different LowCal instances

## Usage

```bash
lowcal orchestrator <command> [options]
```

## Sub-commands

### start

Start the orchestrator daemon.

```bash
lowcal orchestrator start
```

**Example Output:**
```
Orchestrator daemon started.
PID: 12345
```

### stop

Stop the orchestrator daemon.

```bash
lowcal orchestrator stop
```

**Example Output:**
```
Orchestrator daemon stopped.
```

### status

Show detailed orchestrator status.

```bash
lowcal orchestrator status
```

**Example Output:**
```
Running: yes
PID: 12345
Started: 2/9/2026, 8:00 AM
Last tick: 2/9/2026, 10:30 AM
Tick interval: 30s
Policies: default, recovery
Sessions scanned: 15
Stalled sessions: 0
Recoveries attempted: 3
Recoveries accepted: 2
Last action: recovered on session-abc123 (attempt 1) at 2/9/2026, 10:25 AM
```

**Status Fields:**
| Field | Description |
|-------|-------------|
| `Running` | Whether the daemon is active |
| `PID` | Process ID of the orchestrator |
| `Started` | When the daemon was started |
| `Last tick` | When the last monitoring cycle completed |
| `Tick interval` | How often the orchestrator checks sessions (in seconds) |
| `Policies` | Active recovery policies |
| `Sessions scanned` | Total sessions monitored |
| `Stalled sessions` | Sessions that may need attention |
| `Recoveries attempted` | Number of recovery attempts made |
| `Recoveries accepted` | Number of recoveries successfully applied |

## Use Cases

1. **Verify Orchestrator Health**: Ensure the orchestrator is running before relying on automated recovery
2. **Debug Session Issues**: Check if sessions are being monitored and recovered properly
3. **Monitor Recovery Activity**: Track how often the orchestrator intervenes in session issues

## Related Commands

- [`lowcal scheduler`](scheduler.md) - Job scheduling management
- [`lowcal dashboard`](dashboard.md) - Unified view of all system status
