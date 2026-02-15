# Read Session Messages Tool

The `read_session_messages` tool receives messages from launched tasks back to a parent session. This enables communication between the main LowCal instance and spawned sub-tasks.

## Overview

Use `read_session_messages` when you need to:
- **Receive task results**: Get summaries and status updates from launched tasks
- **Poll for completion**: Check if background tasks have finished
- **Collect output**: Gather results from parallel operations
- **Debug issues**: Review task logs and error messages

### User-Facing Equivalent

If you are operating directly in the TUI (not through tool calls), use `/mailbox`:

- `/mailbox` opens the mailbox dialog (received + pending panels with preview/actions)
- `/mailbox list/show/use/clear` provides non-dialog mailbox operations
- `/mailbox use` injects payload context into chat/model history without automatically triggering a model response

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | Mailbox action: `pull`, `peek`, `clear`, or `wait` |
| `session_id` | string | No | Target session mailbox to read (defaults to current session) |
| `max_items` | number | No | Maximum number of messages to return for pull/peek (default: 20, max: 200) |
| `task_id` | string | No | Optional task ID filter. For `wait`, returns only messages from this task ID. |
| `timeout_seconds` | number | No | For `wait` action: max time to wait for messages (default: 30s, max: 300s) |

## Actions

### pull (Default)
Read and consume up to `max_items` messages from the mailbox.

```json
{
  "action": "pull",
  "max_items": 10
}
```

**Returns:** Array of message objects, each containing:
- `timestamp`: ISO timestamp when message was sent
- `task_id`: ID of the task that sent the message
- `type`: Message type (e.g., "status", "result", "error")
- `content`: Message content

### peek
Read messages without consuming them. Messages remain in the mailbox.

```json
{
  "action": "peek",
  "max_items": 10
}
```

Useful for checking mailbox contents before deciding how to process messages.

### clear
Delete all queued messages for the mailbox.

```json
{
  "action": "clear"
}
```

**Warning:** This permanently removes all pending messages. Use with caution.

### wait
Block until a message arrives (or timeout). Ideal for waiting for task completion.

```json
{
  "action": "wait",
  "task_id": "my-background-task",
  "timeout_seconds": 60
}
```

**Returns:** A single message object when available, or null on timeout.

## Parent Protocol (Recommended)

For one objective, follow this sequence:

1. **Launch exactly one task first** with `launch_task`
2. **Set a stable `idempotency_key`** for this objective
3. **After launch**, call `read_session_messages` with `action: "wait"` and the same `task_id`
4. **If timeout occurs**, assume task may still be running; do not launch a duplicate. Wait again or report running status.
5. **Use logs only** for debugging when mailbox/state indicates failure or missing return.

## Examples

### Wait for Task Completion
```json
{
  "action": "wait",
  "task_id": "build-project",
  "timeout_seconds": 300
}
```
Waits up to 5 minutes for the build task to complete.

### Poll for Status Updates
```json
{
  "action": "pull",
  "max_items": 20
}
```
Retrieves all pending messages without blocking.

### Check Mailbox Without Consuming
```json
{
  "action": "peek"
}
```
Views what's in the mailbox but leaves messages for later processing.

### Clear Old Messages
```json
{
  "action": "clear"
}
```
Clears the mailbox before starting a new operation.

## Message Format

Messages returned by `pull` and `wait` contain:

```json
{
  "timestamp": "2026-02-09T18:30:00.000Z",
  "task_id": "build-project",
  "type": "result",
  "content": {
    "status": "success",
    "output": "Build completed successfully in 45 seconds"
  }
}
```

### Message Types

| Type | Description |
|------|-------------|
| `status` | Progress update or status change |
| `result` | Task completion with results |
| `error` | Error occurred during execution |
| `heartbeat` | Periodic "still running" signal |

## Use Cases

1. **Task Completion**: Wait for background tasks to finish before proceeding
2. **Progress Monitoring**: Poll for updates on long-running operations
3. **Result Collection**: Gather results from parallel tasks
4. **Cleanup**: Clear old messages before starting new operations
5. **Debugging**: Inspect task logs and error details

## Related Tools

- [`launch_task`](./launch-task.md): Spawn sub-tasks that return through mailbox channels
- [`launch_task_state`](./launch-task-state.md): Inspect task runtime/status when mailbox results are delayed
