# Remediation Roadmap

## Phase 1 – Token & Context Controls *(in progress)*
- Enforce preflight token budgets before every provider call.
- Tighten chat compression heuristics and expose budget telemetry in the CLI.
- Clamp environment/workspace context (directory listings, full-context dumps) to stay within budget.

## Phase 2 – Streaming & Network Resilience
- Harden stream validation to tolerate trailing metadata-only chunks and automatically fall back to non-streaming when retries exhaust.
- Extend retry/backoff utilities to classify undici aborts, socket resets, and idle disconnects as transient errors with jittered delays.
- Add stream idle watchdogs and surface provider-tagged failure telemetry for observability.

## Phase 3 – Provider Health & LM Studio Integration
- Introduce an `ensureModelLoaded()` handshake for LM Studio (model list/status, context limit discovery, friendly errors).
- Auto-unload/switch models safely when the user changes providers through the CLI.
- Expose a `/status` command that reports provider readiness, active model, and usable context window.

## Phase 4 – Converter & Error Handling Improvements
- Guard OpenAI→Gemini conversion paths against empty responses/tool-call edge cases.
- Improve user-facing guidance for quota, token, and network failures (including session token limit hits).
- Consolidate telemetry around these errors for easier postmortems.

## Phase 5 – Validation & Tooling
- Update the Vitest suite to cover new budget enforcement paths, compression fallbacks, and LM Studio health checks.
- Add smoke tests for provider flows and scripts to exercise retry logic end-to-end.
- Document configuration knobs, troubleshooting steps, and monitoring hooks introduced in prior phases.
