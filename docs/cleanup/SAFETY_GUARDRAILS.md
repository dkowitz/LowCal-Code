# Cleanup Safety Guardrails

This cleanup effort is constrained to repository hygiene and test stability.

## Non-Negotiable Constraints

- No user-facing command behavior changes as part of hygiene commits.
- No schema/config contract changes unless required for deterministic tests.
- Keep `dist/` tracked in this cycle (`two-phase` artifact policy).
- Every cleanup commit must be small, reviewable, and reversible.

## Validation Gate (Run After Each Cleanup Batch)

1. `npm run lint:ci`
2. `npm run typecheck`
3. `npm run test:smoke`
4. `npm run test:scripts`

## Rollback Strategy

- Revert per-commit using `git revert <sha>` if regressions are found.
- Do not use history-rewriting rollback (`reset --hard`) on shared branches.

