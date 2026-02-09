# Sessions Command

The `sessions` command provides tools for managing LowCal Code sessions - viewing active sessions, inspecting details, and cleaning up stale sessions.

## Overview

LowCal Code automatically manages session state for you. The `sessions` command gives you visibility into this system and allows manual management when needed.

## Usage

```bash
lowcal sessions <command> [options]
```

## Sub-commands

### list

List all active sessions with their current status.

```bash
lowcal sessions list [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--ttl <seconds>` | Stale threshold in seconds | 180 |
| `--watch` | Keep the list live (like top) | false |
| `--interval <seconds>` | Refresh interval in seconds | 2 |

**Example Output:**
```
WORKING abc123def456
  mode: chat
  pid: 12345
  cwd: /home/user/my-project
  started: 2/9/2026, 10:30 AM
  last_seen: 2/9/2026, 10:32 AM

IDLE xyz789abc012
  mode: file
  pid: 12456
  cwd: /home/user/other-project
  started: 2/9/2026, 9:15 AM
  last_seen: 2/9/2026, 10:00 AM
```

### get

Show detailed information for a specific session.

```bash
lowcal sessions get <id>
```

**Example Output:**
```json
{
  "id": "abc123def456",
  "status": "working",
  "mode": "chat",
  "pid": 12345,
  "cwd": "/home/user/my-project",
  "started_at": "2026-02-09T15:30:00.000Z",
  "last_seen": "2026-02-09T15:32:00.000Z",
  "details": {
    "job_id": "daily-build"
  },
  "health": {
    "state": "healthy",
    "confidence": 0.95
  }
}
```

### prune

Remove sessions that have been stale for longer than the threshold.

```bash
lowcal sessions prune [options]
```

**Options:**
| Option | Description | Default |
|--------|-------------|---------|
| `--ttl <seconds>` | Stale threshold in seconds | 180 |

**Example Output:**
```
Removed 3 stale session(s):
- abc123def456
- xyz789abc012
- def456ghi789
```

## Examples

### List All Active Sessions
```bash
lowcal sessions list
```

### Watch Sessions in Real-Time
```bash
# Refresh every 5 seconds, mark stale after 10 minutes
lowcal sessions list --watch --interval 5 --ttl 600
```

### Get Session Details
```bash
lowcal sessions get abc123def456
```

### Clean Up Stale Sessions
```bash
# Remove sessions older than 5 minutes
lowcal sessions prune --ttl 300
```

## Use Cases

1. **Debugging**: Check if a session is still running or became stuck
2. **Cleanup**: Remove old sessions to free up resources
3. **Monitoring**: Watch multiple sessions in real-time during development
4. **Investigation**: Get detailed info about a specific session for troubleshooting

## Related Commands

- [`lowcal dashboard`](dashboard.md) - Unified view of all system status
- [`lowcal scheduler`](scheduler.md) - Job scheduling management
