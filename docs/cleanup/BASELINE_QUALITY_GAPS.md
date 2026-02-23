# Baseline Quality Gaps (Post-Hygiene)

This file captures pre-existing quality failures observed while validating cleanup changes.

## Lint

- `npm run lint:ci` fails with many existing errors in `packages/cli` and `packages/core`.
- Archive-related lint noise was eliminated by ignoring `docs/archive/**`.

## Tests

- `npm run test:smoke` currently fails in `packages/cli` with existing mock/config issues, including:
  - missing mock exports (e.g. `ToolRegistry`, `unescapePath`)
  - UI test runtime errors (`config.getContentGeneratorConfig is not a function`)

## Typecheck

- `npm run typecheck` passes across workspaces.

## Recommendation

- Keep hygiene changes isolated from behavior/test fixes.
- Address failing test/lint suites in dedicated follow-up batches by package:
  1. `packages/cli` mocks + UI test setup
  2. `packages/core` lint rule conformance
  3. targeted skip reduction from `docs/testing/skip-registry.md`

