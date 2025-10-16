# Local Mode Latency Improvements

This document summarizes the recent changes that target lower latency when working with local models (e.g. LM Studio), and explains how to use the new controls and instrumentation.

## 1. Concise Prompt Mode

- The core prompt logic (`packages/core/src/core/prompts.ts`) now understands a `promptMode` flag with three options: `auto`, `full`, and `concise`.
- In `auto` mode (the new default) the runtime automatically switches to the concise prompt whenever the configured base URL looks like an LM Studio endpoint (`localhost:1234` / `127.0.0.1:1234`).
- The concise prompt keeps the essential safety and workflow guidance, but trims supporting prose and omits the long tool examples. Tool schemas are still supplied to the model via function declarations, so nothing else is required to maintain correct tool usage.
- You can override the mode at any time with the new slash command:

  ```text
  /promptmode              # show the current mode
  /promptmode set concise  # always use the short prompt
  /promptmode set full     # always use the long prompt
  /promptmode set auto     # let LM Studio detection decide
  ```

## 2. Custom Tool Collections

- `.gemini/tool-config.json` now stores both the active prompt mode and a map of named tool collections. The file ships with three presets (`full`, `minimal`, `shell-only`) and you can create your own.
- The runtime only supplies schemas for tools in the active collection, so reducing the selection reduces both prompt size and function declaration payload.
- Manage collections in-session via the `/toolset` command namespace:

  ```text
  /toolset list                     # show all known collections and mark the active one
  /toolset show                     # show the tools in the active collection
  /toolset show <name>              # show a specific collection
  /toolset activate <name>          # make <name> the active collection
  /toolset use <name>               # alias for activate
  /toolset create <name> [tools…]   # create/update a collection
  /toolset add <name> <tool> [...]  # add tool identifiers
  /toolset remove <name> <tool> [...]  # remove tool identifiers
  ```

  Tool identifiers are normalized to the canonical names (`read_file`, `run_shell_command`, etc.), so case and formatting do not matter.

## 3. Timing Telemetry in Chat History

To make it easy to compare latency across modes and toolsets, every user turn now records:

1. **Per-tool durations** – each completed tool call (client or model initiated) logs its outcome and runtime, e.g. `🔧 Tool read_file completed in 0.7s.` or `🛠️ Client tool edit failed in 2.3s.`
2. **Model response duration** – once we receive the `Finished` event for a completion, we add `⏱ Model response time: …`.
3. **Overall turn duration** – after all tool requests are satisfied (or immediately if there were none) an info message records `⏱ Overall turn time: …`. If the turn ends early due to cancellation or error you will see `⏱ Turn cancelled after …` / `⏱ Turn errored after …`.

These entries remove the need to add the individual segments manually when benchmarking different configurations.

## 4. File & Code References

- Prompt selection & tool filtering: `packages/core/src/core/prompts.ts`, `packages/core/src/core/client.ts`
- CLI config helper: `packages/cli/src/ui/commands/utils/toolConfig.ts`
- Slash commands: `packages/cli/src/ui/commands/promptModeCommand.ts`, `packages/cli/src/ui/commands/toolsetCommand.ts`
- Timing instrumentation: `packages/cli/src/ui/hooks/useGeminiStream.ts`

## 5. Suggested Workflow for Latency Comparisons

1. **Select a toolset** – choose `/toolset activate minimal` (or any custom set) for tighter declarations.
2. **Pick a prompt mode** – use `/promptmode set concise` for maximum reduction, or return to `full` as a baseline.
3. **Run the task** – execute the same query in each configuration.
4. **Compare history entries** – the chat now contains everything needed:
   - Overall turn time (user → final answer).
   - Model response time (LLM only).
   - Per-tool timings (individual operations).

Repeating the sequence for other tool collections or prompt modes quickly shows the gains (or regressions) without additional instrumentation.

## 6. Notes & Caveats

- Environment overrides (`GEMINI_SYSTEM_MD`, template mappings) still take precedence. If a custom system prompt is in force, concise mode will not replace it.
- Tool declarations are still validated server-side; filtering a collection to zero tools is allowed but leaves the model without tooling support.
- The timing entries are informational only and do not affect control flow. They use `Date.now()`; wall-clock variance (e.g., from system load) is expected.

With these changes you can tailor the prompting surface and tooling footprint for local deployments, and use the in-band timing logs to understand how each tweak shifts end-to-end latency.
