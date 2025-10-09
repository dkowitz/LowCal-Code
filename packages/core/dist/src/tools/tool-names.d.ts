/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Tool name constants to avoid circular dependencies.
 * These constants are used across multiple files and should be kept in sync
 * with the actual tool class names.
 */
export declare const ToolNames: {
    readonly EDIT: "edit";
    readonly WRITE_FILE: "write_file";
    readonly READ_FILE: "read_file";
    readonly READ_MANY_FILES: "read_many_files";
    readonly GREP: "search_file_content";
    readonly GLOB: "glob";
    readonly SHELL: "run_shell_command";
    readonly TODO_WRITE: "todo_write";
    readonly MEMORY: "save_memory";
    readonly TASK: "task";
    readonly EXIT_PLAN_MODE: "exit_plan_mode";
};
