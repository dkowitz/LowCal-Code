# Autonomy Enhancement Roadmap

## Phase 1 – Token & Context Controls (Complete)
- Preflight token budget checks with automatic history compression.
- Context bootstrapping trims heavy directory listings and encourages follow-up tooling.
- CLI surfaces proactive token budget warnings.

## Phase 2 – Streaming & Network Resilience (In Progress)
### Completed
- Hardened stream validation with idle watchdogs and non-stream fallback for Gemini providers.
- Retry/backoff telemetry records classification, status, and provider tags.

### Outstanding
- Surface provider-tagged retry telemetry in UI panels.
- Tune idle thresholds per provider once field data is collected.

## Phase 2.5 – Tool Output Hygiene & Autonomy Boost (In Progress)
### Completed
- Summaries for long tool outputs plus follow-up commands.
- Self-healing suggestions after repeated tool failures.
- Automatic trimming of oversized histories (including LM Studio/OpenAI responses) with placeholder fallbacks and retry-free recovery.

### Active Work
- Expose `toolSelfHealing` overrides to end users via CLI configuration.
- Add resume-after-retry scaffolding so interrupted plans restart automatically.
- Extend token-budget safeguards to cover remaining edge cases (e.g., mixed provider requirements, additional trimming heuristics).

## Phase 3 – Provider Health & LM Studio Integration (Planned)
- `ensureModelLoaded()` handshake for LM Studio (inventory, active model, context discovery).
- Persist `/auth` and `/model` selections per provider.
- `/status` command showing provider readiness, active model, cached credentials, and safe context window.

## Phase 4 – Converter & Error Handling Improvements (Planned)
- Harden OpenAI→Gemini conversion for empty responses and tool-call edge cases found in audits.
- Richer user guidance for quota/token/network failures, including auto-mitigation strategies.
- Feed retry/error context into aggregated telemetry for faster postmortems.

## Phase 5 – Validation & Tooling (Planned)
- Expand Vitest coverage for budget enforcement, streaming fallback, LM Studio handshakes.
- Add smoke tests exercising retry classifications and idle watchdog behavior end-to-end.
- Document the new config knobs, troubleshooting flows, and monitoring hooks to support higher autonomy.

## Conversation Summary
- Implemented token budget enforcement, directory/context trimming, and token warnings (Phase 1).
- Added streaming idle watchdog and automatic fallback for Gemini providers; telemetry collects retry metadata (Phase 2).
- Hardened tool self-healing with failure counters and proactive suggestions; lifted LM Studio/OpenAI runs by summarizing binary tool outputs and trimming histories automatically (Phase 2.5).
- Current focus: finish surfacing telemetry, expose configurables, and build resume-after-retry so interrupted plans recover without user prompts.
- Next major milestone: LM Studio readiness (Phase 3) and richer provider health diagnostics.

## Next Immediate Actions
1. Re-run LM Studio `gpt-oss-120b` workflow to verify auto-trimming resolves token overflow without manual nudges.
2. Wire provider-tagged telemetry into UI/status surfaces.
3. Expose `toolSelfHealing` overrides through CLI settings.
4. Implement resume-after-retry logic to restore interrupted plans automatically.
