/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type SessionStatus = "idle" | "working";

export type SessionMode = "tui" | "headless" | "noninteractive" | "scheduler";

export interface SessionRecord {
  id: string;
  pid: number;
  mode: SessionMode;
  cwd: string;
  started_at: string;
  last_seen: string;
  status: SessionStatus;
  details?: Record<string, unknown>;
}

export interface SessionStore {
  version: string;
  sessions: SessionRecord[];
  last_modified: string;
}
