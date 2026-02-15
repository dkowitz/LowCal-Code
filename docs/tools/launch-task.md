# Launch Task Tool

The `launch_task` tool creates an immediate task run. It supports template-based configuration, per-task auth/model overrides, and execution in `headless`, `zellij_tab`, or `in_process` mode.

## Overview

Use `launch_task` when you need:

- immediate task execution (no cron schedule)
- isolated background execution (`headless` / `zellij_tab`)
- in-session execution with temporary runtime overrides (`in_process`)
- idempotent launches (dedupe with `idempotency_key`)

## Required Fields

| Parameter | Type   | Required | Description                       |
| --------- | ------ | -------- | --------------------------------- |
| `action`  | string | Yes      | Must be `create`                  |
| `id`      | string | Yes      | Unique task ID (`[a-zA-Z0-9_-]+`) |

Task content must come from one of:

- `prompt`
- `action_value`
- `template_id` that resolves to template action content

## Parameters

| Parameter                 | Type    | Required | Description                                                                     |
| ------------------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `prompt`                  | string  | No       | Prompt text fallback for action payload                                         |
| `action_type`             | string  | No       | `prompt` or `slash_command`                                                     |
| `action_value`            | string  | No       | Explicit action payload                                                         |
| `description`             | string  | No       | Human-readable description                                                      |
| `execution_mode`          | string  | No       | `default`, `headless`, `zellij_tab`, `in_process`                               |
| `execution_mode_override` | boolean | No       | Must be `true` for `execution_mode` to take effect                              |
| `template_id`             | string  | No       | Task template ID                                                                |
| `template_level`          | string  | No       | `auto`, `project`, `user`, `builtin`                                            |
| `template_overrides`      | object  | No       | Runtime fields merged on top of template                                        |
| `auth`                    | object  | No       | Runtime auth override (`selectedType`, `providerId`, `baseUrl`, `apiKeyEnvVar`) |
| `model`                   | object  | No       | Runtime model override (`name`)                                                 |
| `return_to_session_id`    | string  | No       | Target session for return-channel/in-process queue                              |
| `idempotency_key`         | string  | No       | Prevent duplicate in-flight launches                                            |
| `allow_recursive`         | boolean | No       | Allow nested launches from launched child tasks                                 |

## Execution Modes

| Mode         | Behavior                                                              |
| ------------ | --------------------------------------------------------------------- |
| `headless`   | Launches detached background runtime and writes task logs             |
| `zellij_tab` | Runs in a dedicated Zellij tab; falls back to headless if unavailable |
| `in_process` | Queues task into an interactive target session via session API        |
| `default`    | Uses scheduler/session default mode                                   |

## Template + Override Merge

Launch runtime is merged in this order:

1. template runtime (`template_id`)
2. `template_overrides`
3. explicit launch fields (`action_*`, `execution_mode`, `auth`, `model`, `allow_recursive`)

`execution_mode` is ignored unless `execution_mode_override=true`.

## In-Process Runtime Behavior

For `in_process` tasks:

- runtime auth/model overrides are applied temporarily for that task run
- original session runtime is restored automatically after completion/failure
- `slash_command` action type is supported only in `in_process`

## Getting Results Back

After launching tasks, retrieve returns through the session mailbox:

- For tool-driven flows (LLM): use [`read_session_messages`](./read-session-messages.md) with `action: "wait"`/`"pull"`.
- For user-driven flows (TUI): use `/mailbox` to browse **Received** and **Pending** entries, preview payloads, and inject selected payloads into chat/model history.

## Examples

### Launch Using Template

```json
{
  "action": "create",
  "id": "vision-ocr-001",
  "template_id": "vision-ocr",
  "template_level": "auto"
}
```

### Launch In-Process `/compress` with OpenRouter Runtime Override

```json
{
  "action": "create",
  "id": "compress-pass-1",
  "action_type": "slash_command",
  "action_value": "/compress",
  "execution_mode": "in_process",
  "execution_mode_override": true,
  "auth": {
    "selectedType": "openai",
    "providerId": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnvVar": "OPENAI_API_KEY"
  },
  "model": {
    "name": "google/gemini-2.5-flash"
  }
}
```

### Idempotent Background Launch

```json
{
  "action": "create",
  "id": "daily-build",
  "prompt": "Run npm run build && npm test and summarize failures",
  "idempotency_key": "daily-build-2026-02-13"
}
```

## Related

- [`schedule_task`](./schedule-task.md)
- [`task_template`](./task-template.md)
- [`read_session_messages`](./read-session-messages.md)
- [`launch_task_state`](./launch-task-state.md)
