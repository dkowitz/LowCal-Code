# Qwen Code Conversation Export

**Exported:** 10/10/2025, 11:48:40 PM
**Session ID:** e9fab5cc-7a9d-4577-83bf-0ffff0e9dd71
**Mode:** report

## User Message

/model

---

## Assistant Response

# Full Report on @packages/core/src/core/prompts.ts

---

## Assistant Response

The file `@packages/core/src/core/prompts.ts` contains several functions for generating system prompts beyond the main core system prompt. Here's a comprehensive breakdown:

---

## Assistant Response

## 1. getCoreSystemPrompt Function
This is the main system prompt function that generates the complete system instructions for Qwen Code, which we've already examined in detail.

---

## Assistant Response

## 2. getCustomSystemPrompt Function
Processes custom system instructions by:
- Accepting various types of custom instructions (strings, Content objects, PartUnion arrays)
- Extracting text content from different input formats
- Appending user memory with proper formatting when provided
- Returning a combined prompt string with user memory separated by "---"

---

## Assistant Response

## 3. getCompressionPrompt Function
Generates a specialized system prompt for history compression:
- Instructs the model to act as a state manager
- Requires thinking in a private scratchpad
- Produces structured XML summaries
- Critical for maintaining conversation history in a condensed format
- Includes specific XML structure with sections for:
  - Overall goal
  - Key knowledge
  - File system state
  - Recent actions
  - Current plan

---

## Assistant Response

## 4. getProjectSummaryPrompt Function
Creates a system prompt for generating project summaries:
- Analyzes conversation history
- Generates markdown summaries for future reference
- Includes specific markdown structure with sections for:
  - Overall goal
  - Key knowledge
  - Recent actions
  - Current plan
- Uses status markers like [DONE], [IN PROGRESS], [TODO]

---

## Assistant Response

## 5. getToolCallExamples Function
Dynamically generates tool call examples based on model type:
- Supports environment variable override (QWEN_CODE_TOOL_CALL_STYLE)
- Detects model types:
  - qwen*-coder patterns (XML format)
  - qwen*-vl patterns (JSON format)
  - coder-model (XML format)
  - vision-model (JSON format)
- Returns appropriate examples for:
  - General models (bracket format)
  - Qwen Coder models (XML format)
  - Qwen VL models (JSON format)

---

## Assistant Response

## 6. getSubagentSystemReminder Function
Generates system reminders about available subagents:
- Informs the AI about specialized agents it can delegate to
- Encourages proactive use of the TASK tool
- Lists available agent types
- Formatted as internal system messages with XML tags

---

## Assistant Response

## 7. getPlanModeSystemReminder Function
Creates system reminders for plan mode operation:
- Enforces plan mode constraints (read-only operations)
- Prevents modifications until user confirmation
- Overrides other instructions to ensure safe behavior
- Includes workflow instructions for presenting plans

---

## Assistant Response

## Supporting Infrastructure

---

## Assistant Response

### Interfaces
- `ModelTemplateMapping`: Defines structure for model-specific prompt templates
- `SystemPromptConfig`: Configuration interface with system prompt mappings

---

## Assistant Response

### Helper Functions
- `normalizeUrl`: Removes trailing slashes for consistent URL comparison
- `urlMatches`: Checks if a URL matches any in an array, ignoring trailing slashes

---

## Assistant Response

### Constants and Variables
- Tool name imports for dynamic tool references
- Git repository detection utilities
- Configuration directory paths

---

## Assistant Response

The file serves as the central hub for all system prompt generation in the Qwen Code ecosystem, providing contextually appropriate prompts for different scenarios, models, and operational modes.

---

