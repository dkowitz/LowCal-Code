# LM Studio Handling Updates (October 2025)

This document summarizes the recent changes aimed at stabilizing the LM Studio provider integration inside LowCal.

## Agent Loop & Budgeting
- Added per-model context overrides in `Config`, surfacing `setModelContextLimit` / `getEffectiveContextLimit` so token budgeting and compression respect the configured LM Studio window.
- `TokenBudgetManager` now accepts an override callback, while `GeminiClient` supplies the effective limit when evaluating requests and deciding when to compress.
- Disabled the automatic next-speaker recursion and non-streaming fallback for LM Studio streams, preventing premature aborts while the local model is still thinking.
- Removed the warm-up probe for LM Studio models; remote providers still get the “Say hello” priming call.

## CLI Model Selection & Status Tracking
- `App.tsx` resolves the configured LM Studio context length on every selection (and when the session model changes) and pushes it into the new override.
- Added a throttled `refreshLmStudioModel()` helper: we poll at most once per 60s and immediately before a request, eliminating the old 15-second polling loop that spammed LM Studio logs.
- Vision auto-switch flows now clear and restore context overrides when models temporarily change.

## Stream Resilience
- On the LM Studio provider we set the stream idle timeout to zero so the CLI waits indefinitely for the first token.
- Streaming fallback is skipped for LM Studio recoverable errors; we rely entirely on the original stream instead of re-issuing a non-streaming request.

These changes collectively reduce LM Studio log noise, honor the configured context limits, and keep long-running prompts alive until the local model finishes.
