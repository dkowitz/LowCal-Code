# Qwen Code Conversation Export

**Exported:** 10/17/2025, 5:13:58 PM
**Session ID:** 178d89aa-c184-4801-919c-117d62c7224c
**Mode:** report

## User Message

Find how context compression is handled when tool results exceed the context capacity and produce a comprehensive report on what steps are taken and how errors are handled.

---

## Assistant Response

## Context‑compression when a **tool result** blows the token budget  



---

## Assistant Response

Below is a concise, end‑to‑end description of how Qwen Code detects that a tool’s output (or any part of the chat history) would exceed the model’s context window, what it does to shrink the payload, and how failures are reported.  
All references point to the current source tree (`/home/atmandk/LowCal-dev`).

---



---

## Assistant Response

### 1️⃣ Where the overflow is detected  



---

## Assistant Response

| File | Relevant code (excerpt) | What it does |
|------|------------------------|--------------|
| `packages/core/src/services/tokenBudgetManager.ts` | `const computedLimit = this.getContextLimit?.(model);` … `if (snapshot.tokens > snapshot.effectiveLimit)` | After every user‑message the **TokenBudgetManager** asks the model’s token limit (static + dynamic) and compares it with the token count of the *preview* chat (`manager.evaluate`). If the preview does not fit, a `TokenBudgetExceededError` is thrown. |
| `packages/core/src/core/client.ts` – method `runChat()` | `if (!snapshot.fitsWithinEffective) { … await this.tryCompressChat(promptId, false,…); }` | The client catches the error and immediately tries **standard compression** (`tryCompressChat`). |

---



---

## Assistant Response

### 2️⃣ Standard compression (`tryCompressChat`)  



---

## Assistant Response

*Location*: `packages/core/src/core/client.ts` (lines ~933‑1000)  



---

## Assistant Response

```ts
const compressed = await this.tryCompressChat(promptId, force, { preserveFraction });
```



---

## Assistant Response

| Step | Code path | Behaviour |
|------|-----------|----------|
| **Force flag** (`force: boolean`) – passed from the UI when a user explicitly asks for compression. |
| **Preserve fraction** – taken from `config.getChatCompression()?.contextPercentageThreshold` (default 0.7). |
| Calls `applyAdaptiveCompression(currentHistory, strategy)` where *strategy* is built from those two values (`force ? {preserveFraction} : undefined`). |
| If the result’s token count still exceeds the limit **or** the compression inflates the token count, the method returns a `ChatCompressionInfo` with status `COMPRESSION_FAILED_*`. |



---

## Assistant Response

If this first attempt succeeds we get a `ChatCompressionInfo` with `compressionStatus = COMPRESSED`; otherwise we fall back to *adaptive recovery*.

---



---

## Assistant Response

### 3️⃣ Adaptive‑recovery (last‑resort)  



---

## Assistant Response

*Location*: `packages/core/src/core/client.ts` → `tryAdaptiveRecovery()` (lines ~1010‑1155).  



---

## Assistant Response

```ts
for (let i = 0; i < COMPRESSION_STRATEGIES.length; i++) {
    const strategy = COMPRESSION_STRATEGIES[i];
    const compressed = applyAdaptiveCompression(currentHistory, strategy);
    …
    await this.startChat(compressed);          // replace the chat history
    const snapshot = await manager.evaluate(model, compressed);
    if (snapshot.fitsWithinEffective) return true;
}
```



---

## Assistant Response

#### 3.1 Compression strategies  



---

## Assistant Response

Defined in `packages/core/src/utils/context-recovery.ts` → `COMPRESSION_STRATEGIES`:



---

## Assistant Response

| # | preserveFraction | compressToolResults | dropIntermediateMessages |
|---|------------------|---------------------|--------------------------|
| 1 | **1.0** (keep everything) | ✅ | ❌ |
| 2 | **1.0** | ✅ | ✅ |
| 3 | **0.8** | ✅ | ✅ |
| 4 | **0.6** | ✅ | ✅ |
| 5 | **0.4** | ✅ | ✅ |
| 6 | **0.2** (most aggressive) | ✅ | ✅ |



---

## Assistant Response

The loop tries them in order, from least to most aggressive.



---

## Assistant Response

#### 3.2 `applyAdaptiveCompression` pipeline  



---

## Assistant Response

```ts
export function applyAdaptiveCompression(history, options): Content[] {
    let compressed = [...history];
    if (options.compressToolResults)   compressed = compressToolResults(compressed);
    if (options.dropIntermediateMessages) compressed = dropIntermediateAssistantMessages(compressed);
    compressed = applySlidingWindow(compressed, options.preserveFraction);
    return compressed;
}
```



---

## Assistant Response

* **`compressToolResults`** – walks the history and calls `summarizeToolResult` for every *function‑response* (tool result).  
  *Summarizer logic (`summarizeToolResult`)*
  - If text ≤ 500 chars → keep unchanged.  
  - Detects common patterns:
    - “Found X match” → replaces with a short summary: `"[Tool Result Summary: Found X matches …]"`.
    - File‑read blocks delimited by `---` → summarises as `"[Tool Result Summary: Read Y file(s)…]"`.
    - Otherwise keeps the first 5 and last 5 lines, inserts an omission notice, and reports original length.
* **`dropIntermediateAssistantMessages`** – removes assistant messages that are not separated by a user turn, keeping only the latest assistant reply per turn.  
* **`applySlidingWindow`** – trims the history to `preserveFraction * totalLength`, always preserving the system prompt (first message) and guaranteeing at least 4 entries (2 turns).  



---

## Assistant Response

#### 3.3 Ratio estimation (debug)  



---

## Assistant Response

```ts
const ratio = estimateCompressionRatio(currentHistory, compressed);
```



---

## Assistant Response

Logs a warning like:  
`[Context Recovery] Compression ratio: 42.7% (23 → 10 messages)` – useful for telemetry but does **not** affect the algorithm.

---



---

## Assistant Response

### 4️⃣ Telemetry & logging  



---

## Assistant Response

| File | Event |
|------|-------|
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts` (`logChatCompressionEvent`) | Emits a *chat_compression* event with fields: `tokens_before`, `tokens_after`, `compression_status`. |
| `packages/core/src/telemetry/loggers.ts` → `logChatCompression()` | Calls the above logger and also records an OTEL metric via `recordChatCompressionMetrics`. |
| `packages/core/src/telemetry/types.ts` – `ChatCompressionEvent` interface | Defines the shape of the telemetry payload (`event.name = "chat_compression"`). |
| Console warnings/errors (see `client.ts`) | Human‑readable diagnostics:  
  - `"Standard compression failed, attempting self‑healing recovery..."`  
  - `"Recovery successful with strategy X"` or `"All recovery strategies exhausted"`. |



---

## Assistant Response

If **all** strategies fail, the client throws a `TokenBudgetExceededError` with a message such as:



---

## Assistant Response

```
Unable to compress history to fit within the context window (12 345 tokens). 
Tried 6 recovery strategies.
```



---

## Assistant Response

The error bubbles up to the UI where it is displayed as an *error message* (`MessageType.ERROR`) and also logged via telemetry.

---



---

## Assistant Response

### 5️⃣ Configuration knobs  



---

## Assistant Response

| Setting | Where defined | Effect |
|---------|----------------|--------|
| `model.chatCompression?.contextPercentageThreshold` (default 0.7) | `packages/core/src/config/config.ts` → `ChatCompressionSettings` | Determines the *preserve fraction* for the **standard** compression attempt (`force = false`). |
| `chatCompression` block in CLI config (`QWEN.md`, `.qwenrc`, etc.) | `packages/cli/src/config/settingsSchema.ts` | Allows users to enable/disable compression or override thresholds. |
| `force` flag from UI command `compress` | `packages/cli/src/ui/commands/compressCommand.ts` → calls `client.tryCompressChat(promptId, true)` | Bypasses the “already‑pending” guard and forces a compression attempt regardless of current status. |

---



---

## Assistant Response

### 6️⃣ Summary flow (pseudo‑code)



---

## Assistant Response

```ts
function handleUserMessage(message) {
    const preview = buildPreview();               // current chat + new user msg
    const snapshot = tokenBudgetManager.evaluate(model, preview);

    if (!snapshot.fitsWithinEffective) {
        // ---- 1️⃣ Standard compression -------------------------------------------------
        let result = tryCompressChat(promptId, false, { preserveFraction });
        if (result.compressionStatus === COMPRESSED) return;

        // ---- 2️⃣ Adaptive recovery ----------------------------------------------------
        const recovered = await tryAdaptiveRecovery(promptId);
        if (!recovered) throw new TokenBudgetExceededError(...);
    }

    // Normal processing continues …
}
```



---

## Assistant Response

*If a tool result is huge*, it will be **summarized** in the first stage of `compressToolResults`.  
If that alone isn’t enough, later stages drop intermediate assistant messages and finally truncate older turns.



---

## Assistant Response

All failures are surfaced through:



---

## Assistant Response

1. **Console warnings / errors** (visible to the user).  
2. **Telemetry events** (`chat_compression`) with before/after token counts and status.  
3. **Exceptions** (`TokenBudgetExceededError`) that abort the current request.

---



---

## Assistant Response

### 7️⃣ Key source locations for quick reference  



---

## Assistant Response

| Concern | File & line range |
|---------|-------------------|
| Token‑budget check | `packages/core/src/services/tokenBudgetManager.ts` (≈ line 30) |
| Standard compression entry point | `packages/core/src/core/client.ts` → `tryCompressChat` (≈ lines 1300‑1400) |
| Adaptive recovery loop | `client.ts` → `tryAdaptiveRecovery` (≈ lines 1010‑1155) |
| Compression strategies definition | `utils/context-recovery.ts` – `COMPRESSION_STRATEGIES` (≈ lines 200‑240) |
| Tool‑result summarizer | `utils/context-recovery.ts` → `summarizeToolResult` (≈ lines 30‑80) |
| Sliding window logic | `applySlidingWindow` in same file (≈ lines 100‑140) |
| Telemetry event emission | `telemetry/qwen-logger/qwen-logger.ts` (`logChatCompressionEvent`) (≈ line 620) |
| Config exposure | `core/src/config/config.ts` → `ChatCompressionSettings` (≈ lines 84‑90) |

---



---

## Assistant Response

## TL;DR



---

## Assistant Response

1. **Detect overflow** via token‑budget manager.  
2. **Try standard compression** (`tryCompressChat`) using the user‑configured preserve fraction.  
3. If that fails, **run adaptive recovery**, iterating six increasingly aggressive strategies:
   - Summarize tool results (short “Tool Result Summary” strings).  
   - Optionally drop intermediate assistant messages.  
   - Trim history with a sliding window preserving a configurable fraction of recent turns.  
4. After each strategy the new history is re‑evaluated; success ends the loop, otherwise an error is thrown.  
5. All outcomes are logged to console and emitted as telemetry (`chat_compression` events) with token counts and status codes (`COMPRESSED`, `NOOP`, `COMPRESSION_FAILED_*`).  



---

## Assistant Response

This design guarantees that **any oversized tool output** is either compacted enough to fit the model’s context window or reported cleanly, while providing rich diagnostics for developers and observability via telemetry.

---

