# Message Repetition Issue - Root Cause Analysis

## Problem Summary
Thinking blocks and content are being repeated thousands of times, causing token limit overflows. Example:
```
💭 I've added the '__logging' configuration option. Let me run the test again to see if this fixes the logging error.
💭 I've added the '__logging' configuration option. Let me run the test again to see if this fixes the logging error.
... (repeated thousands of times)
```

## Root Causes Identified

### 1. **Flawed Thinking Block Deduplication Logic** (PRIMARY)
**Location:** `packages/core/src/core/turn.ts` - `shouldEmitThinkingTextBlock()` method

**Issue:**
- The normalization process removes too much information:
  ```typescript
  const normalized = block
    .replace(/💭/g, "")           // Remove emoji
    .replace(/\*/g, "")            // Remove markdown
    .replace(/[^\w\s]/g, " ")      // Remove punctuation
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  ```
- This causes different thinking blocks to normalize to the same string
- Example: "I've added X" and "I've added Y" both normalize to "i ve added"
- The tracker only checks if `count === 0`, so identical normalized strings are emitted once per turn
- **BUT**: When the stream retries or chunks arrive out of order, the tracker isn't reset properly

### 2. **Inadequate Text Delta Deduplication** (SECONDARY)
**Location:** `packages/core/src/core/turn.ts` - `shouldEmitTextDelta()` method

**Issues:**
- Only deduplicates text >= 80 characters
- Thinking blocks are typically < 80 chars, so they bypass this check
- The tracker uses a simple count check (`count >= 1`) which only prevents 2nd+ occurrences
- Doesn't account for partial/incremental chunks that reconstruct the same message

### 3. **Incomplete Retry Event Handling** (TERTIARY)
**Location:** `packages/core/src/core/turn.ts` - `run()` method

**Issue:**
- When a RETRY event occurs, the code clears `lastCandidateTexts`, `textDuplicateTrackers`, and `thinkingBlockTrackers`
- **BUT**: `emittedThoughtHashes` is NOT cleared
- This means thought deduplication persists across retries, but text deduplication resets
- Inconsistent state leads to unpredictable behavior

### 4. **Streaming Chunk Reconstruction Problem** (QUATERNARY)
**Location:** `packages/core/src/core/turn.ts` - `run()` method

**Issue:**
- The code tracks `lastCandidateTexts` to detect deltas
- When a full response is reconstructed from chunks, the delta calculation may fail
- Example:
  - Chunk 1: "💭 I've added..."
  - Chunk 2: "💭 I've added... (full text again)"
  - The delta logic should detect this is a repeat, but normalization issues prevent it

## Impact on Conversation Length
- Each repetition consumes tokens
- As conversation grows, more retries occur (due to token limits)
- Each retry can trigger the repetition bug again
- **Exponential token consumption**: N turns × M retries × K repetitions = massive waste

## Solution Strategy

### Fix 1: Improve Thinking Block Normalization
- Preserve more semantic information during normalization
- Use a hash-based approach instead of character-by-character normalization
- Consider the full context, not just normalized words

### Fix 2: Enhance Text Delta Deduplication
- Lower the MIN_LENGTH_FOR_DEDUP threshold or remove it for thinking blocks
- Use a more robust deduplication strategy for short, repetitive content
- Track both full text and deltas separately

### Fix 3: Consistent Retry State Management
- Clear ALL deduplication trackers on RETRY events
- Ensure `emittedThoughtHashes` is reset along with other trackers

### Fix 4: Improve Chunk Reconstruction Logic
- Better detection of when a full response is being resent
- Use content hashing for more reliable duplicate detection
- Consider the semantic meaning, not just character-level matching

## Testing Strategy
1. Unit tests for each deduplication method
2. Integration tests with repeated thinking blocks
3. Stress tests with long conversations and retries
4. Verify formatting preservation (emojis, markdown, etc.)
