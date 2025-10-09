# LM Studio Debug Session (October 7, 2025)

## What We Touched

- Disabled the idle stream watchdog when the LM Studio provider is active (`GeminiChat` now accepts an optional override, and `GeminiClient.startChat` passes `0` for LM Studio runs).
- Rebuilt the LM Studio OpenAI client with an Undici dispatcher that has `bodyTimeout`/`headersTimeout` set to `0`, eliminating host-side HTTP timeouts while the local GGUF model loads.
- Added early request logging in `ContentGenerationPipeline`: when `enableOpenAILogging` is true we immediately persist the assembled OpenAI-compatible payload before any tokens are streamed.

## Operational Checklist

- Turn on prompt telemetry locally via `~/.qwen/settings.json`:
  ```json
  {
    "telemetry": {
      "enabled": true,
      "logPrompts": true,
      "otlpEndpoint": "",
      "outfile": "/home/atmandk/LowCal-dev/logs/qwen-telemetry.jsonl"
    },
    "enableOpenAILogging": true
  }
  ```
- Launch the CLI with logging enabled: `npm start -- --openai-logging`.
- Inspect request payloads under `./logs/openai/` to verify prompt size and tool usage when LM Studio appears to stall.

## Findings

- The telemetry JSONL file primarily contains periodic metrics; it does not signal repeated prompt submissions. Long "PromptProcessing" streaks in LM Studio are a single request with a ~15k-token context, which the Q4_K_M 30B model now processes successfully (albeit slowly).

## Next Steps

- Use the new `logs/openai/*.json` artifacts to spot runaway history or oversized file pulls before starting multi-minute runs.
- Consider splitting large context files or choosing a smaller LM Studio model when quick iterative responses are required.
