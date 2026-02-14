# Schedule Task Tool

The `schedule_task` tool creates and manages cron jobs. It supports task templates, per-job auth/model/runtime overrides, and all execution modes (`headless`, `zellij_tab`, `in_process`).

## Overview

Use `schedule_task` for:

- recurring automation via cron
- scheduled task templates
- job-level auth/model/runtime overrides
- in-process scheduled actions targeting interactive sessions

## Actions

| Action    | Description                   |
| --------- | ----------------------------- |
| `create`  | Create a new scheduled job    |
| `list`    | List all jobs                 |
| `get`     | Show one job with recent logs |
| `update`  | Update a job                  |
| `delete`  | Delete a job                  |
| `pause`   | Pause a job                   |
| `resume`  | Resume a paused job           |
| `run_now` | Queue immediate execution     |

## Core Parameters

| Parameter         | Type    | Required    | Description                                                       |
| ----------------- | ------- | ----------- | ----------------------------------------------------------------- |
| `action`          | string  | Yes         | One of the actions above                                          |
| `id`              | string  | Conditional | Required for all actions except `list`                            |
| `schedule`        | string  | Conditional | Required for `create` (5-field cron)                              |
| `prompt`          | string  | Conditional | Required unless action payload comes from template/`action_value` |
| `description`     | string  | No          | Job description                                                   |
| `enabled`         | boolean | No          | Enable/disable job                                                |
| `timeout_minutes` | number  | No          | Execution timeout                                                 |
| `max_failures`    | number  | No          | Auto-pause threshold                                              |

## Runtime Parameters

| Parameter                 | Type    | Description                                                             |
| ------------------------- | ------- | ----------------------------------------------------------------------- |
| `action_type`             | string  | `prompt` or `slash_command`                                             |
| `action_value`            | string  | Explicit action payload                                                 |
| `execution_mode`          | string  | `default`, `headless`, `zellij_tab`, `in_process`                       |
| `execution_mode_override` | boolean | Must be `true` for `execution_mode` override                            |
| `template_id`             | string  | Template ID used for runtime prefill                                    |
| `template_level`          | string  | `auto`, `project`, `user`, `builtin`                                    |
| `template_overrides`      | object  | Runtime fields merged over template                                     |
| `auth`                    | object  | Auth override (`selectedType`, `providerId`, `baseUrl`, `apiKeyEnvVar`) |
| `model`                   | object  | Model override (`name`)                                                 |
| `run`                     | object  | Run settings (`returnToSession`, `allowRecursive`)                      |
| `return_to_session_id`    | string  | Explicit in-process target session                                      |

## Constraints

- `slash_command` action type requires `execution_mode="in_process"`.
- `in_process` execution requires a target session (`return_to_session_id` or `run.returnToSession`).
- `execution_mode` is ignored unless `execution_mode_override=true`.
- Action payload max length is 10,000 characters.
- In `in_process` mode, auth/model runtime overrides are applied for that task run and then restored automatically in the target session.

## Cron Format

```text
minute hour day month day_of_week
*      *    *   *     *
```

Example: `0 2 * * *` (daily at 2:00 AM).

## Examples

### Create Job from Template

```json
{
  "action": "create",
  "id": "nightly-ocr",
  "schedule": "0 1 * * *",
  "template_id": "vision-ocr",
  "template_level": "auto"
}
```

### Create In-Process Scheduled `/compress`

```json
{
  "action": "create",
  "id": "nightly-compress",
  "schedule": "0 2 * * *",
  "action_type": "slash_command",
  "action_value": "/compress",
  "execution_mode": "in_process",
  "execution_mode_override": true,
  "return_to_session_id": "session-abc123",
  "model": { "name": "google/gemini-2.5-flash" },
  "auth": {
    "selectedType": "openai",
    "providerId": "openrouter",
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKeyEnvVar": "OPENAI_API_KEY"
  }
}
```

### Update Existing Job Runtime

```json
{
  "action": "update",
  "id": "nightly-ocr",
  "template_overrides": {
    "model": { "name": "qwen-vl-8b" },
    "execution_mode": "headless"
  }
}
```

## Related

- [`launch_task`](./launch-task.md)
- [`task_template`](./task-template.md)
- [`launch_task_state`](./launch-task-state.md)
