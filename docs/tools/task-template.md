# Task Template Tool

The `task_template` tool manages reusable task templates across `project`, `user`, and `builtin` scopes, and resolves runtime profiles for `launch_task` / `schedule_task`.

## Template Storage

- Project scope: `.qwen/task-templates/*.md`
- User scope: `~/.qwen/task-templates/*.md`
- Builtin scope: read-only templates shipped with the runtime (if present)

Resolution order for `level: auto`: `project -> user -> builtin`.

## Actions

| Action     | Description                                     |
| ---------- | ----------------------------------------------- |
| `list`     | List templates (optional `tag` filter)          |
| `get`      | Retrieve one template by `id`                   |
| `create`   | Create template (project/user)                  |
| `update`   | Update existing template                        |
| `delete`   | Delete template (project/user)                  |
| `validate` | Validate template payload or existing template  |
| `resolve`  | Merge template + overrides into runtime profile |

## Parameters

| Parameter   | Type   | Required    | Description                                       |
| ----------- | ------ | ----------- | ------------------------------------------------- |
| `action`    | string | Yes         | Template action                                   |
| `id`        | string | Conditional | Required for most actions                         |
| `level`     | string | No          | `auto`, `project`, `user`, `builtin`              |
| `tag`       | string | No          | Tag filter for `list`                             |
| `template`  | object | Conditional | Template payload for `create`/`update`/`validate` |
| `overrides` | object | No          | Runtime overrides for `resolve`                   |

## Template Shape

A template can include any subset of fields:

- `id`, `name`, `description`, `tags`
- `prompt`
- `action` (`type`, `value`)
- `execution` (`mode`: `default`, `headless`, `zellij_tab`, `in_process`)
- `auth` (`selectedType`, `providerId`, `baseUrl`, `apiKeyEnvVar`)
- `model` (`name`)
- `run` (`returnToSession`, `allowRecursive`)

Templates may be:

- skeleton-only (empty fields)
- partially prefilled
- fully prefilled and immediately deployable

Security note: keep secrets out of template files. Prefer `auth.apiKeyEnvVar` and environment variables instead of embedding credentials.

## Example

### Create a Vision Template

```json
{
  "action": "create",
  "id": "vision-ocr",
  "level": "user",
  "template": {
    "name": "Vision OCR",
    "tags": ["vision", "ocr"],
    "execution": { "mode": "headless" },
    "auth": {
      "selectedType": "openai",
      "providerId": "lmstudio",
      "baseUrl": "http://127.0.0.1:1234/v1",
      "apiKeyEnvVar": "OPENAI_API_KEY"
    },
    "model": { "name": "qwen-vl-8b" },
    "action": {
      "type": "prompt",
      "value": "Extract structured text from provided image files."
    }
  }
}
```

### Resolve Runtime for Launch

```json
{
  "action": "resolve",
  "id": "vision-ocr",
  "level": "auto",
  "overrides": {
    "action_value": "OCR these three invoice images and output JSON.",
    "execution_mode": "in_process"
  }
}
```

## Related

- [`launch_task`](./launch-task.md)
- [`schedule_task`](./schedule-task.md)
