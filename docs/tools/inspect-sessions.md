# Inspect Sessions Tool

The `inspect_sessions` tool provides deep, structured introspection for running LowCal sessions.

## Overview

Use `inspect_sessions` when you need to assess what another session is doing and whether it is healthy, stalled, or requires a wake-up prompt.

It is designed for supervision/orchestration loops such as scheduled health checks.

### Returned data includes

- Session status, staleness, health, and liveness
- Model/auth/approval metadata (when available)
- Context-window/token-budget estimate (when available)
- Recent message tail
- Extracted error signals

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | No | Inspect a single session id. If omitted, inspect multiple sessions. |
| `include_stale` | boolean | No | Include stale sessions when listing (default: `false`). |
| `ttl_seconds` | number | No | Stale threshold in seconds (default: `180`). |
| `limit` | number | No | Max sessions when `session_id` is omitted (default: `20`, max: `200`). |
| `include_history` | boolean | No | Include recent message tail (default: `true`). |
| `max_messages` | number | No | Max recent messages per session (default: `12`, max: `100`). |
| `max_message_chars` | number | No | Max total chars read from history per session (default: `4000`, max: `20000`). |
| `include_details` | boolean | No | Include sanitized session metadata/details preview (default: `false`). |

## Examples

Inspect one session:

```json
{
  "session_id": "session-abc123"
}
```

Inspect all active sessions with short history tails:

```json
{
  "limit": 10,
  "max_messages": 5,
  "max_message_chars": 2000
}
```

Include stale sessions and metadata details:

```json
{
  "include_stale": true,
  "include_details": true
}
```

## Related Tools

- [`read-sessions`](./read-sessions.md): Lightweight list/get session registry access
- `read_collab_messages`: Inspect collab board traffic across sessions
- `post_collab_message`: Send wake/request/result coordination messages to sessions
