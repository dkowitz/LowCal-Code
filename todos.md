More rebranding to LowCal 

make /view window taller, fix overflow

/toolset not filtering tool schemas?

Handle Edit errors:
Edit {"file_path":"/home/atmandk/LowCal-dev/packages/cli/src/ui/commands/promptInfoCommand.ts","old_string":"import {\\n  …  │
 │                                                                                                                                 │
 │    Failed to edit, 0 occurrences found for old_string in                                                                        │
 │    /home/atmandk/LowCal-dev/packages/cli/src/ui/commands/promptInfoCommand.ts. No edits made. The exact text in                 │
 │    old_string was not found. Ensure you're not escaping content incorrectly and check whitespace, indentation, and              │
 │    context. Use read_file tool to verify.

Handle SearchText errors:
 SearchText {"path":"/home/atmandk/LowCal-dev/packages/cli/src/services/BuiltinCommandLoader.ts","pattern":"viewCommand"}  │
 │                                                                                                                              │
 │    Failed to access path stats for /home/atmandk/LowCal-dev/packages/cli/src/services/BuiltinCommandLoader.ts:               │
 │    Error: Path is not a directory: /home/atmandk/LowCal-dev/packages/cli/src/services/BuiltinCommandLoader.ts 

Track down the source when using the SearchText tool of the error: 'Failed to access path stats for ... Path is not a          │
│    directory: ...'  What exactly causes this error and why does it happen so often - is the tool definition or required arguments │
│     not clear enough for llms to understand how to use it properly?


Handle out of turn errors

Fix compression error - maybe use OpenRouter Gemini or local Granite: ✕ [API Error: Unable to compress history to fit within the context window (129,265 tokens). Tried 6 recovery strategies.]

/model doesnt have search on first call

Format tables with wordwrap

 
