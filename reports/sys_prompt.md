# Qwen Code Conversation Export

**Exported:** 10/15/2025, 12:38:09 AM
**Session ID:** b52c05e3-a205-46e4-9910-75afb3e349de
**Mode:** report

## User Message

/auth

---

## Assistant Response

Based on my exploration of the codebase, I can now provide a comprehensive answer about how system prompts are handled in this Qwen Code project.

---

## Assistant Response

## System Prompt Handling in Qwen Code

---

## Assistant Response

The system prompts in this codebase are managed through several key components:

---

## Assistant Response

### Core System Prompts Generation

---

## Assistant Response

1. **Main Functions**:
   - `getCoreSystemPrompt()` in `/packages/core/src/core/prompts.ts` - generates the base system prompt for the main agent
   - `getCustomSystemPrompt()` in the same file - processes custom instructions with user memory appended

---

## Assistant Response

2. **Key Features**:
   - Supports reading from a system.md file when `GEMINI_SYSTEM_MD` environment variable is set
   - Allows writing to a system.md file when `GEMINI_WRITE_SYSTEM_MD` is set
   - Handles template-based system prompt mappings for different models via `systemPromptMappings`
   - Integrates user memory into prompts

---

## Assistant Response

### Subagent System Prompts

---

## Assistant Response

1. **Subagent Configuration**:
   - In `/packages/core/src/subagents/types.ts`, the `SubagentConfig` interface includes a `systemPrompt` field
   - Validation is performed in `/packages/core/src/subagents/validation.ts` with `validateSystemPrompt()`

---

## Assistant Response

2. **Validation Process**:
   - Checks that system prompts are not empty
   - Validates length constraints (minimum 10 characters, maximum 10000)
   - Warns about excessively long prompts (>5000 chars)

---

## Assistant Response

### CLI Integration

---

## Assistant Response

The CLI components in `/packages/cli/src` handle system prompt configuration through:

---

## Assistant Response

1. **Settings Management**:
   - `systemPromptMappings` configuration in settings files
   - Schema definitions for system prompt mappings in `settingsSchema.ts`

---

## Assistant Response

2. **Subagent Creation UI**:
   - Wizard steps that allow users to input and generate system prompts
   - Components like `AgentCreationWizard`, `DescriptionInput`, and `CreationSummary`
   - Display components like `AgentViewerStep` for viewing existing subagent prompts

---

## Assistant Response

### Usage in Client Code

---

## Assistant Response

In `/packages/core/src/client.ts`, the system prompts are used when:

- Creating chats with `getCoreSystemPrompt()`
- Generating content with `getCustomSystemPrompt()` or `getCoreSystemPrompt()`

---

## Assistant Response

The system prompt handling is designed to be flexible, allowing for both default base prompts and custom configurations through environment variables and configuration files. The subagent system also supports individual system prompts per agent, which are validated before being saved.

---

## Assistant Response

This approach allows the Qwen Code system to have a consistent core behavior while supporting customization at multiple levels - from global settings to specific subagents.

---
