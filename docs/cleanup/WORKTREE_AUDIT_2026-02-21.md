# Worktree Audit (2026-02-21)

## Snapshot

- `git status --porcelain` entries: **1832**
- Status mix:
  - `D `: 1415 (staged deletions)
  - ` M`: 293 (unstaged modifications)
  - ` D`: 121 (unstaged deletions)
  - `??`: 3 (untracked paths)

## High-Noise Artifact Buckets

- `.lowcal/**`: **182** entries
- `packages/*/coverage/**`: **1226** entries
  - `packages/cli/coverage/**`: 741
  - `packages/core/coverage/**`: 485
- `packages/*/dist/**` and `bundle/**`: **245** entries

These dominate the diff and are mostly runtime/build/test artifacts.

## Source-Scope Changes (High Signal)

- `packages/cli/src/**`: 66 entries
  - 43 modified, 23 deleted
- `packages/core/src/**`: 52 entries
  - 51 modified, 1 deleted

Notable cleanup-aligned source state:

- Deprecated `/agents` command path is removed from active source wiring.
- Subagent command-era CRUD API surface in core manager was removed.
- Related tests and docs were updated.

## Validation State

- `npm run test:smoke` passes:
  - CLI: 2078/2078
  - Core: 2680/2680

## Recommended Next Safe Sequence

1. Split artifact noise from source intent:
   - Treat `.lowcal/**`, `coverage/**`, and most `dist/**` churn as workspace cleanup noise.
2. Isolate source cleanup into focused commits:
   - Deprecated `/agents` removals and subagent manager API cleanup.
3. Run full preflight only after source-intent set is frozen:
   - `npm run preflight`

