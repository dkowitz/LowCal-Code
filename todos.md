Fix /export report to grab first user message that is not a slash command

More rebranding to LowCal 

make /view window taller, fix overflow

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

 Handle out of turn errors

 Fix compression error - maybe use OpenRouter Gemini or local Granite

 
