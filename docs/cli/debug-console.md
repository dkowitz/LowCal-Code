# Debug Console

The debug console provides real-time visibility into the agent's execution without cluttering the main conversation. This is especially useful during long agentic runs to monitor progress and debug issues.

## Toggling the Debug Console

Press **Ctrl+O** to toggle the debug console on/off.

When enabled, you'll see detailed information about:

- Tool execution (start, completion, duration, errors)
- Model thinking and response streaming
- Context management and compression
- Error recovery attempts
- Token usage and budget warnings

## Debug Message Types

The debug console displays several types of messages:

### Tool Execution

```
[Tool] Starting: search_file_content (a1b2c3d4...)
[Tool] Args: {
  "pattern": "debug",
  "include": "**/*.ts"
}
[Tool] Completed: search_file_content in 245ms
[Tool] Success: search_file_content
```

### Model Activity

```
[Agent] Starting new prompt: e5f6g7h8...
[Agent] Turn 3 (model: gpt-4)
[Agent] Sending request to model...
[Agent] Model started responding...
[Agent] Model finished responding (12 chunks)
```

### Context Management

```
[Context Management] Standard compression failed, attempting self-healing recovery...
[Context Recovery] Trying strategy 1/6...
[Context Recovery] Compression ratio: 85.3% (150 -> 128 messages)
[Context Recovery] ✓ Recovery successful with strategy 2
```

### Tool Validation

```
[Tool Validation] ⚠️  Pattern "debug" may return thousands of results without a file filter.
   💡 Consider adding an 'include' filter (e.g., '**/*.ts', 'src/**/*.js')
```

## Configuration

### Enabling Debug Mode

Debug messages are only shown when debug mode is enabled. You can enable it in your settings:

**Global settings** (`~/.qwen/settings.json`):

```json
{
  "general": {
    "debugMode": true
  }
}
```

**Project settings** (`.qwen/settings.json`):

```json
{
  "general": {
    "debugMode": true
  }
}
```

### Debug Keystroke Logging

For even more detailed debugging, you can enable keystroke logging:

```json
{
  "general": {
    "debugKeystrokeLogging": true
  }
}
```

This will log every keystroke to the debug console, useful for debugging input handling issues.

## Use Cases

### 1. Monitoring Long Agentic Runs

When the agent is performing multiple tool calls in sequence, the debug console lets you see:

- Which tools are being executed
- How long each tool takes
- Whether any tools are failing
- What the model is thinking between tool calls

**Example workflow:**

1. Start a complex task (e.g., "Refactor all authentication code")
2. Press Ctrl+O to open debug console
3. Watch the agent's progress in real-time
4. If something seems stuck, check the debug console for clues

### 2. Debugging Context Overflow

If you're hitting context limits, the debug console shows:

- When compression is triggered
- Which compression strategies are being tried
- Whether recovery was successful
- How much the context was reduced

### 3. Performance Analysis

Track tool execution times to identify bottlenecks:

```
[Tool] Completed: search_file_content in 2450ms  ← Slow!
[Tool] Completed: read_file in 15ms              ← Fast
[Tool] Completed: run_shell_command in 1200ms    ← Medium
```

### 4. Error Investigation

When errors occur, the debug console provides detailed context:

```
[Tool] Error: search_file_content - Pattern validation failed
[Agent] Error occurred: Unable to compress history
[Context Recovery] All recovery strategies exhausted
```

## Tips

1. **Toggle as needed**: Keep the debug console hidden during normal use, toggle it on when you need visibility

2. **Combine with error details**: Use Ctrl+O for debug console AND check the error details panel for full stack traces

3. **Watch for patterns**: Repeated errors or slow tools often indicate configuration issues

4. **Use with YOLO mode**: In YOLO mode (Ctrl+Y), the debug console is especially useful to see what the agent is doing autonomously

5. **Check before reporting bugs**: The debug console often reveals the root cause of issues, making bug reports more actionable

## Related Commands

- **Ctrl+O**: Toggle debug console (error details)
- **Ctrl+T**: Toggle tool descriptions
- **Ctrl+G**: Toggle IDE context details
- **Ctrl+Y**: Toggle YOLO mode (auto-approve)
- **Ctrl+S**: Show more lines in output

## Troubleshooting

### Debug messages not appearing

1. Check that debug mode is enabled in settings
2. Verify you're pressing Ctrl+O (not Cmd+O on Mac)
3. Ensure the console patcher is active (should be automatic)

### Too many debug messages

1. Toggle the debug console off (Ctrl+O) when not needed
2. Disable `debugKeystrokeLogging` if enabled
3. Consider filtering specific message types (feature request)

### Debug console interfering with main chat

The debug console is designed to be non-intrusive:

- Messages only appear when Ctrl+O is active
- They don't affect the conversation history
- They're automatically batched to prevent UI lag

## Future Enhancements

Planned improvements to the debug console:

- Filtering by message type (tool, agent, context, etc.)
- Adjustable verbosity levels (minimal, normal, verbose)
- Export debug logs to file
- Search/filter within debug messages
- Timestamps for all messages
- Color coding by severity

---

**See also:**

- [Configuration Guide](../configuration.md)
- [Troubleshooting](../troubleshooting.md)
- [Keyboard Shortcuts](./keyboard-shortcuts.md)
