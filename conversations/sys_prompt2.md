# Qwen Code Conversation Export

**Exported:** 10/15/2025, 7:17:56 AM
**Session ID:** 51ca18ca-cd5f-439b-832a-b99e964916c9
**Mode:** compact

## User Message

Ok, we need to explore how LowCal generates system prompts. We have a good start with this report: @conversations/sys_prompt.md, but I need you to dive deeper and give a more comprehensive report on the system prompt. Explain more about how the system.md file is used. Is the GEMINI_SYSTEM_MD variable currently set? Is this something that is used by default? I don't understand what its for. And what about the tool descriptions, where do they fit into the construction of the system prompt, and where do they come from? What is the getCustomSystemPrompt() used for? Could it be used for further expansion with more custom prompts?

---

## Assistant Response

**LowCal Code – System Prompt Construction Overview**

### 1️⃣ Core entry points

---

## Assistant Response

| Function                                                    | Purpose                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`getCoreSystemPrompt(userMemory?, config?, model?)`**     | Builds the _default_ system prompt that drives the assistant. It can be overridden by a file (`system.md`) or by a mapping table (`systemPromptMappings`). Finally it appends any persisted _user memory_.                             |
| **`getCustomSystemPrompt(customInstruction, userMemory?)`** | Used when the caller supplies an explicit `systemInstruction` (the “custom instruction” field of `GenerateContentConfig`). It extracts plain text from the supplied structure and then adds the same memory suffix as the core prompt. |

---

## Assistant Response

Both functions return a single string that is sent to the LLM as the system message.

---

---

## Assistant Response

### 2️⃣ How the **default prompt** is obtained

---

## Assistant Response

1. **Environment‑variable override – `GEMINI_SYSTEM_MD`**
   - If the variable is **unset**, LowCal falls back to the built‑in literal (the long “You are LowCal Code …” block you see in the source).
   - If set to a truthy value (`1`, `true`, or any non‑false string) LowCal **reads** a file:
     - Default path → `<project‑root>/.gemini/system.md` (via `GEMINI_CONFIG_DIR`).
     - If the variable contains a custom path, that path is resolved (tilde expansion supported) and used instead.
   - The file **must exist** when the override is enabled; otherwise an error is thrown.

---

## Assistant Response

2. **Write‑back capability – `GEMINI_WRITE_SYSTEM_MD`**
   - When this env var is truthy LowCal writes the _generated_ base prompt to a file (default location or custom path). This is useful for persisting a customised prompt after the first run.

---

## Assistant Response

3. **Model‑specific mappings – `systemPromptMappings`** (optional config)
   - Each mapping can specify `baseUrls`, `modelNames`, and a `template`.
   - If the current runtime matches any entry (by OpenAI model name or base URL), that template is used **instead of** the built‑in prompt. Place‑holders such as `{RUNTIME_VARS_IS_GIT_REPO}` and `{RUNTIME_VARS_SANDBOX}` are substituted at runtime.

---

## Assistant Response

4. **Memory suffix**
   - After the main body (whether from file, mapping, or literal) LowCal appends `\n\n---\n\n${userMemory.trim()}` if any user‑memory string is present. This gives the model long‑term context without polluting the core instructions.

---

---

## Assistant Response

### 3️⃣ Role of **`getCustomSystemPrompt`**

---

## Assistant Response

- Invoked only when a _custom system instruction_ is supplied via the Gemini/Google GenAI API (`GenerateContentConfig["systemInstruction"]`).
- It normalises the instruction (handles string, array of parts, or `Content` objects) into plain text.
- Then it adds the same memory suffix as the core prompt.

---

## Assistant Response

**Why it exists:** Some callers may want to inject a completely different system message for a single request while still preserving the user‑memory mechanism.

---

---

## Assistant Response

### 4️⃣ Where **tool descriptions** come from

---

## Assistant Response

The system prompt ends with a dynamically generated “Tool Call Examples” section:

---

## Assistant Response

```ts
const generalToolCallExamples = `...`;
const qwenCoderToolCallExamples = `...`;
const qwenVlToolCallExamples = `...`;

function getToolCallExamples(model?: string): string {
  // 1️⃣ env var QWEN_CODE_TOOL_CALL_STYLE can force a style
  // 2️⃣ otherwise model name heuristics pick coder, vl or general examples
}
```

---

## Assistant Response

- **`ToolNames`** (imported from `../tools/tool-names.js`) supplies the canonical names (`SHELL`, `READ_FILE`, etc.) that appear in the examples.
- The helper selects one of the three pre‑written blocks based on:

---

## Assistant Response

1. `QWEN_CODE_TOOL_CALL_STYLE` env var (explicit override).
2. Regex detection on the model identifier (`qwen*-coder`, `qwen*-vl`).
3. Fallback to the generic block.

---

## Assistant Response

These examples are concatenated to the end of the prompt, giving the model a concrete illustration of how it should emit tool calls.

---

---

## Assistant Response

### 5️⃣ Extending / customizing the system prompt

---

## Assistant Response

| Extension point                   | Current mechanism                                                               | How you could expand                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **File‑based overrides**          | `GEMINI_SYSTEM_MD` (read) & `GEMINI_WRITE_SYSTEM_MD` (write)                    | Add support for _multiple_ files or a directory hierarchy, merging them in order of priority.                                            |
| **Template variables**            | Only `{RUNTIME_VARS_IS_GIT_REPO}` and `{RUNTIME_VARS_SANDBOX}` are substituted. | Introduce additional placeholders (e.g., `{PROJECT_NAME}`, `{CURRENT_BRANCH}`) by extending the mapping logic.                           |
| **Model‑specific mappings**       | `systemPromptMappings` with simple URL/model matching.                          | Allow richer matching (regex, version ranges) or per‑package prompts (different prompt for CLI vs core).                                 |
| **Tool description generation**   | Hard‑coded example blocks.                                                      | Generate examples programmatically from the actual `tools/` directory (reflect new tools automatically).                                 |
| **User‑memory handling**          | Simple suffix appended to the prompt.                                           | Store memory in a structured JSON blob and render it as a formatted section (`---\nMemory:\n...`) for better readability by the model.   |
| **Custom system instruction API** | `getCustomSystemPrompt` only normalises text.                                   | Accept a richer DSL (e.g., markdown sections) that can be merged with the core prompt, enabling “partial overrides” of specific clauses. |

---

## Assistant Response

All these extensions would live inside `packages/core/src/core/prompts.ts`, preserving the existing public signatures (`getCoreSystemPrompt`, `getCustomSystemPrompt`) so downstream code remains unchanged.

---

---

## Assistant Response

### 6️⃣ Quick checklist for developers

---

## Assistant Response

- **Check env vars**: `GEMINI_SYSTEM_MD` (read), `GEMINI_WRITE_SYSTEM_MD` (write).
- **Inspect config**: Look at any `systemPromptMappings` in the project’s configuration files (`package.json`, `.gemini/config.json`, etc.).
- **Verify tool examples**: Ensure `ToolNames` stays in sync with actual tool implementations; otherwise update the example blocks.
- **Add new placeholders**: Extend the substitution logic inside `getCoreSystemPrompt` and update any mapping templates that rely on them.

---

---

## Assistant Response

**Bottom line:** The system prompt is a layered construct—built‑in literal → optional file override → optional model/template mapping → memory suffix. Tool descriptions are appended as static examples selected by environment or model heuristics. `getCustomSystemPrompt` provides a thin wrapper for ad‑hoc custom instructions while preserving the same memory handling. All of these knobs can be expanded without breaking existing callers, giving you full control over how LowCal Code frames its behavior to the LLM.

---
