/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from "node:events";

export enum AppEvent {
  OpenDebugConsole = "open-debug-console",
  LogError = "log-error",
  ShowInfo = "show-info",
}

export const appEvents = new EventEmitter();
