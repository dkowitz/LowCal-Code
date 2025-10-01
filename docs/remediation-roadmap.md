# Remediation Roadmap

## Phase 1 – Token & Context Controls _(completed)_

- ✅ Preflight token budget checks on every request with automatic history compression fallbacks.
- ✅ Directory/context bootstrapping trims oversized listings while signalling when follow-up tooling is needed.
- ✅ CLI and telemetry surface proactive token budget warnings so sessions can self-correct before hitting limits.

## Phase 2 – Streaming & Network Resilience _(in progress)_

- ✅ Hardened stream validation with idle watchdogs and automatic non-streaming fallback when providers stall.
- ✅ Retry/backoff instrumentation now records classification, status, and provider details for each attempt.
- 🔄 Wire provider-tagged retry analytics into UI messaging and health dashboards (telemetry captured, surfacing pending).
- 🔄 Tune idle thresholds per provider once we gather field data from the new telemetry channel.

## Phase 2.5 – Tool Output Hygiene & Autonomy Boost _(in progress)_

- ✅ Summarize long tool outputs (e.g., large directory listings) with capped listings, extension stats, and follow-up `/list_directory` or `/glob` commands.
- ✅ Detect repetitive tool/error loops and trigger self-healing plans instead of deferring to the user.
- ✅ Auto-trim oversized OpenAI/LM Studio histories by replacing heavy tool outputs with lightweight summaries and retrying without user input.
- 🔄 Surface self-healing suggestions through CLI configurables (expose `toolSelfHealing` overrides to end users).
- 🔄 Scaffold “resume-after-retry” logic so partially completed tool plans don’t restart from scratch.

## Phase 3 – Provider Health & LM Studio Integration _(planned)_

- Introduce an `ensureModelLoaded()` handshake for LM Studio (model inventory, active model, context window discovery).
- Persist `/auth` and `/model` selections cleanly per provider, avoiding leaked API keys across OpenRouter/OpenAI/LM Studio.
- Expose a `/status` command that reports provider readiness, active model, cached credentials, and safe context window.

## Phase 4 – Converter & Error Handling Improvements _(planned)_

- Guard OpenAI→Gemini conversion paths against empty responses and tool-call edge cases surfaced in the error audit.
- Provide richer user/co-pilot guidance for quota, token, and network failures, including retry suggestions and auto-mitigation.
- Fold new retry/error context into aggregated telemetry to speed postmortems and regression tracking.

## Phase 5 – Validation & Tooling _(planned)_

- Expand Vitest coverage for budget enforcement, streaming fallbacks, and LM Studio provider handshakes.
- Add smoke tests and fixtures that exercise the new retry classifications and idle watchdog behaviours end-to-end.
- Document new configuration knobs, troubleshooting flows, and monitoring hooks to support higher autonomy operations.
