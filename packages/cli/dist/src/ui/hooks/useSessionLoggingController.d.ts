/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "@qwen-code/qwen-code-core";
import { type SessionLoggingController } from "../../services/SessionMarkdownLogger.js";
import type { HistoryItem } from "../types.js";
import type { SessionStatsState } from "../contexts/SessionContext.js";
interface UseSessionLoggingControllerOptions {
    history: HistoryItem[];
    config: Config;
    sessionStats: SessionStatsState;
}
export declare function useSessionLoggingController(options: UseSessionLoggingControllerOptions): SessionLoggingController;
export {};
