# Project Summary

## Overall Goal

Finish and stabilize the interactive ModelMapping UX so LM Studio configured models can be manually mapped to provider REST model ids, with reliable keyboard focus handling and correct persistence behavior.

## Key Knowledge

- Repo / stack
  - LowCal-dev: TypeScript monorepo with npm workspaces (Node ≥ 20). Primary UI lives in packages/cli.
  - Build / run commands relevant here:
    - Build CLI package: npm run -w packages/cli build (or make build-all / npm run build:all)
    - Run CLI (dev): npm run start (make start)
    - Preflight: npm run preflight (format + lint + build + tests)
  - Tests: Vitest in repo (run via npm run test --workspaces)
- Conventions & architecture
  - Follow existing TypeScript / ESLint / Prettier style and workspace patterns.
  - Persist user artifact under home: ~/.qwen/lmstudio-model-mappings.json
  - Dynamic imports are used in App.tsx to avoid bundling/circular issues (await import(... .js))
  - UI uses Ink components (Box, Text, Static) and custom RadioButtonSelect; global useKeypress hook for keyboard handling.
- Mapping behavior constraints
  - Model mapping persistence is meant for LM Studio configured models only (filesystem configs under ~/.lmstudio/.internal/user-concrete-model-default-config).
  - For OpenRouter/OpenAI provider flows, the code should fetch models from that provider and should NOT surface the LM Studio mapping dialog.
  - Mapping file format: JSON mapping from configuredName -> REST model id (string -> string).
- Important file locations (CLI package)
  - packages/cli/src/ui/App.tsx — main wiring: discovers models, opens mapping dialog, applyModelMappings, InputPrompt focus gating.
  - packages/cli/src/ui/components/ModelMappingDialog.tsx — interactive mapper UI and keyboard handling.
  - packages/cli/src/ui/models/availableModels.ts — model discovery (filesystem LM Studio configs + REST fetch), added configuredName.
  - packages/cli/src/ui/models/modelMappingStorage.ts — load/save mappings (reads/writes ~/.qwen/lmstudio-model-mappings.json).
  - packages/cli/src/ui/components/shared/RadioButtonSelect.tsx — option list component (fixed key usage).
- Keyboard / focus rules implemented
  - Mapping dialog captures Enter/Esc/Tab/Shift+Tab; InputPrompt is prevented from being focused while dialog is open (focus prop: focus={isFocused && !isModelMappingDialogOpen}).
- Persistence details
  - Mappings were intended to be saved when the dialog finishes; to make mapping stickier the UI now also auto-persists on per-selection and finalizes on Enter. (Persistence logic lives in modelMappingStorage.ts.)
- Known gotchas
  - Avoid using display labels as React keys; duplicates can appear when same REST id appears multiple times — use stable unique keys (id or index) and deduplicate model arrays by id before rendering.
  - Distinguish provider contexts: LM Studio vs OpenRouter/OpenAI; mapping UX must only show for LM Studio-configured workflows.

## Recent Actions

- Implemented ModelMappingDialog with:
  - RadioButtonSelect per unmatched model, Tab/Shift+Tab navigation, Enter to save, Esc to cancel.
  - useKeypress hook for Enter/Esc/Tab handling.
  - Auto-persistence of a single mapping when a selection is made and final persist on Enter.
- Persisted mapping file:
  - Created/edited packages/cli/src/ui/models/modelMappingStorage.ts and used it to read/write ~/.qwen/lmstudio-model-mappings.json.
  - Added runtime debug logs to confirm reads/writes.
- Ensured mapping keys use configuredName when present:
  - Modified availableModels.ts to set configuredName for filesystem-configured models and used configuredName as the mapping key.
  - Updated dialog to use configuredName for persistence and selection callbacks.
- Fixed UI bugs and build issues:
  - Removed stray JSX text nodes and replaced require() usage with ESM imports.
  - Fixed TypeScript build warnings (unused vars) with no-op useEffect to silence the unused callback.
  - Fixed duplicate React keys:
    - Deduplicated model list by id in App.tsx before enrichment/rendering.
    - Changed RadioButtonSelect option key to use stable index (itemIndex) instead of item.label to avoid duplicated-key warnings.
- Wiring updates in App.tsx:
  - Mapping dialog is opened when configured models are unmatched; pendingModelMappings holds unmatched/restModels and pre-filters restModels to omit REST IDs already algorithmically matched.
  - applyModelMappings merges persisted mappings into existing mappings and updates allAvailableModels and availableModelsForDialog accordingly.
- Manual override performed:
  - User asked to directly correct mappings file. I edited / created ~/.qwen/lmstudio-model-mappings.json with:
    {
    "gpt-oss-120b-MXFP4-00001-of-00002": "gpt-oss-120b",
    "GLM-4.5-Air-Q4_K_S-00001-of-00002": "unsloth/glm-4.5-air"
    }
  - Verified load/save via node ESM import of the storage module.
- New issue surfaced:
  - Mapping dialog is being shown during OpenRouter provider usage (it should be LM Studio–only). Investigated and noted the mapping open logic in App.tsx is triggered during the OpenAI/OpenRouter branch because getLMStudioConfiguredModels() and REST enrichment are mixed into the same flow; this needs provider-specific gating.

## Current Plan (roadmap / next steps)

1. [DONE] Add configuredName to filesystem-configured AvailableModel entries and use configuredName as mapping key.
2. [DONE] Implement ModelMappingDialog with keyboard navigation and selection handling (Tab/Shift-Tab/Enter/Esc).
3. [DONE] Persist mappings to ~/.qwen/lmstudio-model-mappings.json (auto-persist per-selection + final persist).
4. [DONE] Deduplicate model lists by id and fix React key collisions in RadioButtonSelect.
5. [IN PROGRESS] Ensure mapping dialog only appears for LM Studio provider contexts (NOT OpenRouter/OpenAI).
   - Task: modify model discovery / mapping-dialog trigger in App.tsx so the mapping UX is only triggered when:
     - the active provider is LM Studio (settings/merged.security?.auth?.providerId === 'lmstudio' OR contentGeneratorConfig indicates LM Studio),
     - AND configured models were discovered from filesystem (getLMStudioConfiguredModels returned entries).
6. [TODO] Add a visible UI overlay/dim when mapping dialog is open to clearly show the dialog has keyboard focus.
7. [TODO] Add an automated integration test for mapping persistence (write/read mappings to a temp file, assert App behavior).
8. [TODO] UX polish: confirmation toast after Apply mapping and option to auto-accept high-confidence fuzzy matches.
9. [TODO] Manual verification: run interactive end-to-end flow for both LM Studio and OpenRouter cases to validate correct behavior.

## Reproduction & verification steps

- Verify mapping persistence after user mapping:
  1. Build CLI: npm run -w packages/cli build
  2. Run CLI: npm run start
  3. Ensure LM Studio auth / provider is selected (/auth flows).
  4. Run /model while LM Studio provider is active and configured models exist under ~/.lmstudio/.internal/...; the mapping dialog should open for unmatched models.
  5. Map a model and press Enter. Confirm ~/.qwen/lmstudio-model-mappings.json contains the mapping and that next /model shows the mapped model as matched.
- Verify no mapping dialog for OpenRouter:
  1. Switch auth to OpenRouter provider (/auth).
  2. Run /model — CLI should use fetchOpenAICompatibleModels (OpenRouter/OpenAI endpoint) and present the provider model list without opening the LM Studio mapping dialog.

## Decisions & rationale

- Persist mappings to the user's home (~/.qwen) instead of in ephemeral storage to make mappings survive sessions and reboots (expected user value).
- Use configuredName (derived from LM Studio JSON filenames) as the stable key for mappings — filenames are stable and independent of display labels that may change.
- Auto-persist on selection to protect user action from accidental UI interruptions.
- Keep mapping UX keyboard-first (Ink) to match CLI expectations and prevent InputPrompt from stealing key events when dialog is active.

## Outstanding risks / notes for next session

- The current mapping trigger flow can incorrectly present the mapper when provider != LM Studio (OpenRouter/OpenAI flows). This must be fixed by guarding the mapping dialog to LM Studio-specific discovery flows.
- The mapping persistence code writes to the user's real home file. When adding tests, redirect to a temporary mappings path to avoid polluting the real user config.
- Confirm there are no lingering places in the model discovery flow where REST models and configured models are merged in a way that causes the mapper to appear outside LM Studio contexts.

## Quick pointers (where to edit)

- App.tsx — mapping trigger, gating on provider, applyModelMappings behavior, dedupe logic.
- availableModels.ts — filesystem-configured model parsing (configuredName, configuredContextLength).
- ModelMappingDialog.tsx — selection key usage; currently uses configuredName where available.
- modelMappingStorage.ts — load/save implementation and file path; adjust for test injection if needed.
- RadioButtonSelect.tsx — item key usage (use index or stable id) and maxItemsToShow behavior.

If you want, I can:

- Implement the LM Studio vs OpenRouter gating now (small focused change in App.tsx),
- Run the CLI interactively and verify both LM Studio and OpenRouter flows end-to-end,
- Add an integration test that verifies mapping persistence using a temp mapping path. Which would you prefer next?

---

## Summary Metadata

**Update time**: 2025-10-06T23:46:43.784Z
