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
    readonly READ_IMAGE: "read_image";
    readonly INSPECT_PDF_FORM: "inspect_pdf_form";
    readonly FILL_PDF_FORM: "fill_pdf_form";
    readonly READ_MANY_FILES: "read_many_files";
    readonly GREP: "search_file_content";
    readonly GLOB: "glob";
    readonly SHELL: "run_shell_command";
    readonly INTERACTIVE_TERMINAL: "interactive_terminal";
    readonly TODO_WRITE: "todo_write";
    readonly MEMORY: "save_memory";
    readonly TASK: "task";
    readonly EXIT_PLAN_MODE: "exit_plan_mode";
    readonly WEB_FETCH: "web_fetch";
    readonly WEB_SEARCH: "web_search";
    readonly SEARXNG_SEARCH: "searxng_search";
    readonly RESEARCH: "research";
    readonly SCHEDULE_TASK: "schedule_task";
    readonly LAUNCH_TASK: "launch_task";
    readonly TASK_TEMPLATE: "task_template";
    readonly READ_SESSION_MESSAGES: "read_session_messages";
    readonly READ_SESSIONS: "read_sessions";
    readonly INSPECT_SESSIONS: "inspect_sessions";
    readonly READ_COLLAB_MESSAGES: "read_collab_messages";
    readonly POST_COLLAB_MESSAGE: "post_collab_message";
    readonly RSS: "rss";
};
