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
export const ToolNames = {
  EDIT: "edit",
  WRITE_FILE: "write_file",
  READ_FILE: "read_file",
  READ_IMAGE: "read_image",
  INSPECT_PDF_FORM: "inspect_pdf_form",
  FILL_PDF_FORM: "fill_pdf_form",
  READ_MANY_FILES: "read_many_files",
  GREP: "search_file_content",
  GLOB: "glob",
  SHELL: "run_shell_command",
  INTERACTIVE_TERMINAL: "interactive_terminal",
  TODO_WRITE: "todo_write",
  MEMORY: "save_memory",
  TASK: "task",
  EXIT_PLAN_MODE: "exit_plan_mode",
  WEB_FETCH: "web_fetch",
  WEB_SEARCH: "web_search",
  SEARXNG_SEARCH: "searxng_search",
  RESEARCH: "research",
  SCHEDULE_TASK: "schedule_task",
  LAUNCH_TASK: "launch_task",
  TASK_TEMPLATE: "task_template",
  READ_SESSION_MESSAGES: "read_session_messages",
  READ_SESSIONS: "read_sessions",
  INSPECT_SESSIONS: "inspect_sessions",
  READ_COLLAB_MESSAGES: "read_collab_messages",
  POST_COLLAB_MESSAGE: "post_collab_message",
  RSS: "rss",
} as const;
