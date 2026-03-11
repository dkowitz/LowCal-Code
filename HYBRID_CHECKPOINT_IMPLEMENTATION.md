# Hybrid Checkpoint Implementation Guide

## Overview
This document describes the hybrid checkpoint system implemented to address the issue where long autonomous agentic runs without user input resulted in no checkpoints being saved to `/resume`.

## Problem Statement
**Before:** During extended autonomous sessions (tool use, thinking, self-recovery), LowCal would accumulate many gemini/thinking/tool messages but never trigger checkpoint saves because they were all marked as "continuations" rather than new user turns.

**After:** The hybrid system ensures useful checkpoints are saved during autonomous runs while keeping `/resume` manageable and not flooded with redundant checkpoints.

## Implementation Details

### Configuration Constants
Located in `packages/cli/src/ui/hooks/useGeminiStream.ts` (lines 90-92):

```typescript
const AUTONOMOUS_CHECKPOINT_INTERVAL = 5; // Save checkpoint every N autonomous turns
const LARGE_TOOL_OUTPUT_THRESHOLD = 1000; // Trigger checkpoint on tool outputs > X chars
```

### State Tracking References
Located in `packages/cli/src/ui/hooks/useGeminiStream.ts` (lines 360-364):

```typescript
const autonomousTurnCountRef = useRef(0);           // Counts consecutive autonomous turns
const lastAutonomousCheckpointRef = useRef<number | null>(null);  // Timestamp of last checkpoint
const isAutonomousCheckpointRef = useRef(false);    // Flag to distinguish autonomous vs user-triggered
```

### Checkpoint Triggers

#### 1. User Input (Existing Behavior - Preserved)
- **When:** User types a message (`!options?.isContinuation`)
- **Action:** Saves checkpoint, resets autonomous counter to 0
- **Location:** Lines 1659-1674

```typescript
if (!options?.isContinuation) {
  // ... existing logic
  if (config.getCheckpointingEnabled()) {
    checkpointPendingForTurnRef.current = true;
    checkpointTurnStartTimestampRef.current = userMessageTimestamp;
    autonomousTurnCountRef.current = 0; // Reset counter
    
    // Initialize on first interaction if not already set
    if (lastAutonomousCheckpointRef.current === null) {
      lastAutonomousCheckpointRef.current = userMessageTimestamp;
    }
  }
}
```

#### 2. Periodic Autonomous Checkpoints (New)
- **When:** Every 5th consecutive autonomous turn after first user interaction
- **Action:** Saves checkpoint, resets counter, updates timestamp
- **Location:** Lines 1675-1693

```typescript
else if (config.getCheckpointingEnabled()) {
  autonomousTurnCountRef.current++;
  
  const shouldSavePeriodicCheckpoint =
    autonomousTurnCountRef.current >= AUTONOMOUS_CHECKPOINT_INTERVAL &&
    lastAutonomousCheckpointRef.current !== null;
  
  if (shouldSavePeriodicCheckpoint) {
    checkpointPendingForTurnRef.current = true;
    checkpointTurnStartTimestampRef.current = userMessageTimestamp;
    isAutonomousCheckpointRef.current = true; // Mark as autonomous
    
    console.debug(
      `[Hybrid Checkpoint] Periodic checkpoint triggered after ${autonomousTurnCountRef.current} autonomous turns`,
    );
  }
}
```

#### 3. Event-Based: Self-Recovery & Loop Detection (New)
- **When:** LowCal detects loops or errors and initiates recovery
- **Action:** Immediately saves checkpoint before recovery prompt
- **Location:** Lines 2340-2351 in `handleSelfRecovery`

```typescript
const handleSelfRecovery = useCallback(
  (errorType: "loop" | "error", errorMessage?: string) => {
    // Trigger checkpoint on significant events
    if (config.getCheckpointingEnabled()) {
      checkpointPendingForTurnRef.current = true;
      checkpointTurnStartTimestampRef.current = Date.now();
      isAutonomousCheckpointRef.current = true;
      lastAutonomousCheckpointRef.current = Date.now();
      
      console.debug(
        `[Hybrid Checkpoint] Event-based checkpoint triggered for ${errorType}${errorMessage ? `: ${errorMessage}` : ""}`,
      );
    }
    
    // ... existing recovery logic
  },
  [addItem, config, geminiClient],
);
```

#### 4. Event-Based: Large Tool Outputs (New)
- **When:** Any tool produces output > 1000 characters
- **Action:** Saves checkpoint to capture significant work product
- **Location:** Lines 2447-2469 in `handleCompletedTools`

```typescript
// Check for large tool outputs
if (config.getCheckpointingEnabled()) {
  let hasLargeOutput = false;
  for (const toolCall of completedToolCallsFromScheduler) {
    const outputSize = getToolOutputSize(toolCall);
    if (outputSize >= LARGE_TOOL_OUTPUT_THRESHOLD) {
      hasLargeOutput = true;
      console.debug(
        `[Hybrid Checkpoint] Large tool output detected: ${toolCall.request.name} (${outputSize} chars)`,
      );
      break;
    }
  }

  if (hasLargeOutput && lastAutonomousCheckpointRef.current !== null) {
    checkpointPendingForTurnRef.current = true;
    checkpointTurnStartTimestampRef.current = Date.now();
    isAutonomousCheckpointRef.current = true;
    
    console.debug(
      `[Hybrid Checkpoint] Event-based checkpoint triggered for large tool output`,
    );
  }
}
```

### Helper Function: Tool Output Size Calculator
Located in `packages/cli/src/ui/hooks/useGeminiStream.ts` (lines 2735-2755):

```typescript
function getToolOutputSize(toolCall: TrackedToolCall): number {
  const completedCall = toolCall as Partial<{response?: {responseParts?: Part[]}}>;
  const responseParts = completedCall.response?.responseParts;
  
  if (!responseParts || !Array.isArray(responseParts)) {
    return 0;
  }

  let totalSize = 0;
  for (const part of responseParts) {
    if (typeof part === "string") {
      totalSize += (part as any).length;
    } else if (part && typeof part === "object" && "text" in part) {
      const text = String((part as {text: unknown}).text);
      totalSize += text.length;
    }
  }

  return totalSize;
}
```

### Checkpoint Save Logic with Counter Reset
Located in `packages/cli/src/ui/hooks/useGeminiStream.ts` (lines 1246-1260):

```typescript
const saved = saveCheckpointFromHistory(history, contextSnapshot);
if (saved) {
  checkpointPendingForTurnRef.current = false;
  checkpointTurnStartTimestampRef.current = null;
  
  // Reset autonomous counters after successful autonomous checkpoint
  const wasAutonomousCheckpoint = isAutonomousCheckpointRef.current;
  if (wasAutonomousCheckpoint) {
    autonomousTurnCountRef.current = 0;
    lastAutonomousCheckpointRef.current = Date.now();
    
    console.debug(
      `[Hybrid Checkpoint] Reset autonomous counter to ${autonomousTurnCountRef.current} after successful checkpoint`,
    );
  }
  isAutonomousCheckpointRef.current = false; // Reset flag
}
```

## Usage Examples

### Example 1: Long Autonomous File Analysis Task
```bash
# User input
> Analyze all TypeScript files in the src directory and create a summary of the architecture

# LowCal autonomously runs for ~10 turns (reading files, analyzing code)
[Hybrid Checkpoint] Periodic checkpoint triggered after 5 autonomous turns
[Checkpoint] Saved checkpoint checkpoint-1710123456789-abc12345 with 25 messages

# After completing analysis
> /resume list
List of saved conversations:
  1. [25 messages] a1b2c3d4 2024-03-11 22:30:45 - Analyze all TypeScript files...
```

### Example 2: Error Recovery Scenario
```bash
# User input
> Refactor the authentication flow to use OAuth2

# LowCal attempts refactoring, encounters error after 3 turns
[Hybrid Checkpoint] Event-based checkpoint triggered for error: File not found
[Checkpoint] Saved checkpoint checkpoint-1710123456790-def67890 with 18 messages

# LowCal recovers and continues
> /resume list  
List of saved conversations:
  1. [18 messages] a1b2c3d4 2024-03-11 22:35:12 - Refactor the authentication...
```

### Example 3: Large Tool Output Scenario
```bash
# User input  
> Generate comprehensive documentation for all API endpoints

# LowCal generates docs, tool output is 5000+ characters
[Hybrid Checkpoint] Large tool output detected: write_file (5234 chars)
[Hybrid Checkpoint] Event-based checkpoint triggered for large tool output
[Checkpoint] Saved checkpoint checkpoint-1710123456791-ghi34567 with 32 messages
```

## Debugging & Monitoring

### Enable Debug Mode
Run LowCal with debug mode to see all checkpoint activity:
```bash
npm run debug
# or
DEBUG=1 npm start
```

### Expected Debug Messages
- `[Hybrid Checkpoint] Periodic checkpoint triggered after 5 autonomous turns` - Every 5th autonomous turn
- `[Hybrid Checkpoint] Event-based checkpoint triggered for loop` - Loop detection
- `[Hybrid Checkpoint] Event-based checkpoint triggered for error: <message>` - Error recovery  
- `[Hybrid Checkpoint] Large tool output detected: <tool_name> (<size> chars)` - Large output threshold exceeded
- `[Hybrid Checkpoint] Reset autonomous counter to 0 after successful checkpoint` - Counter reset

### Verify Checkpoints
```bash
# List all checkpoints
/resume list

# View specific checkpoint details
/resume <checkpoint-id>

# Delete old checkpoints if needed
/resume delete <index>
```

## Configuration Tuning

### Adjust Periodic Interval
To change how often periodic checkpoints are saved, modify `AUTONOMOUS_CHECKPOINT_INTERVAL`:
- **Lower value (3-4):** More frequent checkpoints, larger `/resume` directory
- **Higher value (7-10):** Less frequent checkpoints, smaller `/resume` directory
- **Recommended:** 5 (balanced approach)

### Adjust Large Output Threshold  
To change when large tool outputs trigger checkpoints, modify `LARGE_TOOL_OUTPUT_THRESHOLD`:
- **Lower value (500-800):** More sensitive to medium-sized outputs
- **Higher value (1500-2000):** Only very large outputs trigger checkpoints
- **Recommended:** 1000 (captures significant work products)

## Testing the Implementation

### Manual Test Scenario
1. Start LowCal: `npm start`
2. Give a complex multi-step task requiring autonomous tool use
3. Wait for ~5+ autonomous turns without user input
4. Check debug output for checkpoint messages
5. Run `/resume list` to verify checkpoints were saved

### Automated Tests
Existing checkpoint tests continue to pass:
```bash
npm test -- checkpoint
# ✓ src/services/checkpointService.test.ts (7 tests) 221ms
```

## Benefits Summary

✅ **Preserves existing behavior** - User input still triggers checkpoints as before  
✅ **Adds autonomous coverage** - Long runs now have recovery points every ~5 turns  
✅ **Event-based intelligence** - Critical moments (errors, large outputs) are captured  
✅ **Conservative approach** - Won't flood `/resume` with redundant checkpoints  
✅ **Configurable thresholds** - Easy to tune based on usage patterns  
✅ **Debug visibility** - Clear logging for monitoring and troubleshooting  

## Files Modified

- `packages/cli/src/ui/hooks/useGeminiStream.ts`
  - Added configuration constants (lines 90-92)
  - Added state tracking refs (lines 360-364)
  - Modified checkpoint trigger logic (lines 1659-1693)
  - Updated checkpoint save logic with counter reset (lines 1246-1260)
  - Enhanced `handleSelfRecovery` with event-based triggers (lines 2340-2351)
  - Enhanced `handleCompletedTools` with large output detection (lines 2447-2469)
  - Added helper function `getToolOutputSize()` (lines 2735-2755)

## Build & Type Check Status

✅ TypeScript compilation: Passes  
✅ Project build: Successful  
✅ Existing tests: All checkpoint tests pass  

---

**Implementation Date:** March 11, 2024  
**Implemented by:** LowCal Code (K-6)  
**For:** Darrin (atmandk)
