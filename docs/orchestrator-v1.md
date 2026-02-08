# Orchestrator V1 Specification

## Purpose

Orchestrator V1 adds an autonomous supervision layer for LowCal sessions and scheduled jobs.
It monitors runtime health, applies policy-driven remediation, and records interventions.

This is the bridge between:
- Interactive operations (`dashboard --watch`, `sessions`, `scheduler`)
- Autonomous reliability (self-healing without manual babysitting)

## Design Goals

1. One control plane for all live execution modes (`tui`, `headless`, `noninteractive`, `scheduler`).
2. Explicit health model for detection, remediation, and auditability.
3. Deterministic policy engine with bounded, reversible actions.
4. Safe-by-default automation (cooldowns, retry caps, escalation).
5. Operator visibility through dashboard and action history.

## Non-Goals (V1)

1. No free-form autonomous prompt injection into arbitrary sessions.
2. No distributed multi-host orchestration.
3. No hard dependency on external services/databases.

## Runtime Topology

1. `Session Runtime`: each LowCal process exposes control/health surface.
2. `Session Registry`: existing session store extended with API endpoint + capabilities + health snapshot.
3. `Orchestrator Daemon`: periodic loop evaluates policy and executes actions.
4. `Dashboard`: displays health states, active policies, and intervention history.

## Session Control API (V1)

Transport recommendation:
- Local-only Unix domain socket per session (future fallback: loopback TCP with token auth).
- Socket path stored in session metadata.

### Capability Model

Each session advertises allowed capabilities:
- `observe`: read status and summaries.
- `control`: lifecycle and runtime controls.
- `interact`: controlled task requests (disabled by default in V1).

### Observe Methods

1. `session.get_status`
- Returns identity, mode, pid, cwd, uptime, current phase.

2. `session.get_health`
- Returns health state/reason, confidence, first_seen, last_seen, and current remediation stage.

3. `session.get_context_summary`
- Returns model, approval mode, token budget snapshot, active tool calls count, turn age.

4. `session.get_recent_history`
- Returns bounded recent history window (`max_items`, `max_chars`) with truncation metadata.

### Control Methods

1. `session.cancel_turn`
2. `session.restart_turn`
3. `session.pause`
4. `session.resume`
5. `session.set_model`
6. `session.set_approval_mode`
7. `session.shutdown`

All control methods return:
- `accepted: boolean`
- `reason?: string`
- `action_id: string`

### Interact Methods (V1: optional, default off)

1. `session.request_self_repair`
- Structured request (not arbitrary prompt text).
- Example fields: `fault_type`, `constraints`, `target_outcome`.

## Health Model (V1)

### Health States

- `ok`
- `degraded`
- `stalled`
- `loop_fault`
- `error`
- `recovering`
- `offline`

### Health Reasons

- `heartbeat_stale`
- `loop_detected`
- `no_progress_timeout`
- `repeated_tool_failure`
- `scheduler_flap`
- `unhandled_error`
- `manual_pause`

### Shared Health Snapshot

```json
{
  "state": "stalled",
  "reason": "no_progress_timeout",
  "confidence": 0.89,
  "first_seen": "2026-02-08T18:20:00.000Z",
  "last_seen": "2026-02-08T18:23:00.000Z",
  "evidence": {
    "turn_age_ms": 305000,
    "last_progress_ms": 305000,
    "active_tool_calls": 0
  },
  "remediation": {
    "stage": "retry_1",
    "attempts": 1,
    "next_eligible_at": "2026-02-08T18:24:00.000Z"
  }
}
```

## Policy DSL (V1)

Policies are declarative JSON records evaluated each orchestrator tick.

```json
{
  "id": "recover_stalled_tui",
  "enabled": true,
  "target": {
    "mode": ["tui", "headless", "noninteractive"],
    "state": ["stalled"]
  },
  "when": {
    "reason": ["no_progress_timeout", "heartbeat_stale"],
    "min_duration_ms": 120000,
    "min_confidence": 0.75
  },
  "actions": [
    { "type": "session.cancel_turn" },
    { "type": "session.restart_turn" }
  ],
  "limits": {
    "max_attempts": 3,
    "cooldown_ms": 60000,
    "window_ms": 900000
  },
  "escalation": {
    "on_exhausted": "mark_error"
  }
}
```

### DSL Fields

1. `target`: session/job selector.
2. `when`: trigger conditions.
3. `actions`: ordered remediation sequence.
4. `limits`: rate and retry controls.
5. `escalation`: terminal behavior when limits reached.

## First 5 Remediation Rules (V1)

1. `recover_stalled_session`
- Trigger: `stalled` for >= 2 minutes.
- Actions: `cancel_turn` -> `restart_turn`.
- Limits: 3 attempts / 15 minutes.

2. `recover_loop_fault`
- Trigger: `loop_fault` with confidence >= 0.8.
- Actions: `cancel_turn` -> `set_model(fallback)` -> `restart_turn`.
- Limits: 2 attempts / 30 minutes.

3. `recover_headless_timeout`
- Trigger: headless task exits timeout.
- Actions: restart worker once, then pause related job if repeated.
- Limits: 1 restart then escalate.

4. `recover_scheduler_flap`
- Trigger: daemon start/stop oscillation or repeated tick failures.
- Actions: controlled daemon restart, then mark scheduler degraded.
- Limits: 2 restarts / 10 minutes.

5. `contain_repeated_job_failure`
- Trigger: job `error_count` exceeds threshold in short window.
- Actions: pause job, emit escalation event, require manual resume.
- Limits: enforced per job.

## Audit and Traceability

Every orchestrator decision logs:
- `decision_id`
- target session/job id
- matched policy id
- evidence snapshot
- action(s) attempted and results
- latency and final outcome

Storage (V1): append-only JSONL under `.lowcal/orchestrator/logs/`.

## Dashboard Integration (V1)

Add sections/fields to `dashboard --watch`:
- health state + reason per session/job
- remediation stage/attempt count
- last orchestrator action + timestamp
- policy match indicator

Add shortcuts:
- toggle orchestrator on/off
- force re-evaluate target
- ack/escalate a fault

## Real Workflows Enabled

1. Overnight test guardianship
- Scheduled test tasks run hourly.
- Orchestrator retries transient failures and pauses noisy jobs automatically.

2. Autonomous long-running refactors
- Headless refactor sessions are restarted on stalls.
- Loop faults trigger fallback model and continue without manual intervention.

3. Proactive repo hygiene
- Recurring lint/typecheck/docs jobs stay healthy via bounded auto-recovery.

4. Continuous monitoring tasks
- Periodic log analysis sessions self-heal from temporary model/tool/runtime faults.

5. Multi-session reliability
- One orchestrator supervises mixed `tui` + scheduled jobs + ad hoc headless runs.

## Implementation Plan

### Phase 1: Control Plane and Health

1. Extend session metadata with endpoint/capabilities/health snapshot.
2. Add per-session local RPC server with observe + control methods.
3. Implement health evaluator and normalized reason codes.

### Phase 2: Policy Engine and Actions

1. Add policy registry loader.
2. Implement rule matcher and bounded action executor.
3. Persist intervention logs and summaries.

### Phase 3: Dashboard and Operator UX

1. Surface health + remediation in dashboard.
2. Add operator commands for overrides and acknowledgements.
3. Add quick drill-down for orchestrator audit trails.

## Acceptance Criteria (V1)

1. A stalled session is automatically recovered within one policy cycle.
2. Repeated loop faults trigger model fallback and bounded retries.
3. Repeated job failures auto-pause without human intervention.
4. Every remediation action is visible in dashboard and audit log.
5. Operator can always override or stop orchestrator actions.

## Suggested First Deliverable Slice

1. `observe` methods only + health state persistence.
2. `recover_stalled_session` policy only.
3. Dashboard health columns and last-action status.

This slice validates the architecture before adding higher-risk controls.
