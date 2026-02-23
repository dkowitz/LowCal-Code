# Skip Registry

Baseline skip inventory captured during cleanup hardening.

## Integration Tests

- `integration-tests/ide-client.test.ts:17` `describe.skip` (feature-level suite disabled)
- `integration-tests/ide-client.test.ts:113` `describe.skip` (feature-level suite disabled)
- `integration-tests/read_many_files.test.ts:11` `it.skip` (test explicitly disabled)
- `integration-tests/stdin-context.test.ts:10` `describe.skip` (suite disabled)
- `integration-tests/shell-service.test.ts:72` `it.skipIf` (platform-gated, Windows)

## CLI Package

- `packages/cli/src/config/config.test.ts:781` `it.skip` (homedir mock behavior pending)
- `packages/cli/src/services/FileCommandLoader.test.ts:144` helper builds conditional `it.skip` (not a hard-disabled test by itself)
- `packages/cli/src/utils/startupWarnings.test.ts:21` `describe.skip` (suite disabled)
- `packages/cli/src/ui/hooks/useGitBranchName.test.ts:125` `skip()` (`TODO: fix`)
- `packages/cli/src/ui/hooks/useGitBranchName.test.ts:206` `skip()` (`TODO: fix`)
- `packages/cli/src/ui/hooks/useToolScheduler.test.ts:519` `it.skip` (confirmation flow)
- `packages/cli/src/ui/hooks/useToolScheduler.test.ts:581` `it.skip` (confirmation flow)
- `packages/cli/src/ui/hooks/useToolScheduler.test.ts:633` `it.skip` (live output updates)
- `packages/cli/src/ui/hooks/useToolScheduler.test.ts:809` `it.skip` (already-running scheduler error)

## Core Package

- `packages/core/src/core/client.test.ts:460` `it.skip` (model/config override scenario)
- `packages/core/src/tools/edit.test.ts:233` `it.skip` (ensureCorrectEdit diff path)
- `packages/core/src/utils/pathReader.test.ts:365` `it.skipIf` (platform-gated, Windows)

## VSCode Companion

- `packages/vscode-ide-companion/src/ide-server.test.ts:256` `it.skipIf` (platform-gated, non-Windows)

