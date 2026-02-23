# Read Sessions Tool

The `read_sessions` tool provides model access to the shared LowCal session registry so LLMs can inspect active sessions without shelling out to `/sessions`.

## Overview

Use `read_sessions` when you need to:
- List currently active sessions
- Optionally include stale sessions
- Fetch a full raw record for a specific session id

### User-Facing Equivalent

If operating directly in the TUI, use `/sessions`.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | No | `list` (default) or `get` |
| `session_id` | string | For `get` | Session id to fetch |
| `ttl_seconds` | number | No | Stale threshold (default: 180) |
| `include_stale` | boolean | No | Include stale sessions in `list` output (default: false) |
| `limit` | number | No | Max sessions returned by `list` (max: 200) |

## Actions

### list (Default)

Returns a formatted readout of active sessions.

```json
{
  "action": "list"
}
```

Include stale entries:

```json
{
  "action": "list",
  "include_stale": true
}
```

### get

Returns the full JSON record for one session id.

```json
{
  "action": "get",
  "session_id": "session-abc123"
}
```

## Related Tools

- [`read-session-messages`](./read-session-messages.md): Mailbox results from launched tasks
- [`read-collab-messages`](./read-collab-messages.md): Shared collab board traffic
