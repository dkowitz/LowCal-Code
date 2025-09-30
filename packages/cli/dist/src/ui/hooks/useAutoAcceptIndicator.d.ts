/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type ApprovalMode, type Config } from "@qwen-code/qwen-code-core";
import type { HistoryItemWithoutId } from "../types.js";
export interface UseAutoAcceptIndicatorArgs {
    config: Config;
    addItem: (item: HistoryItemWithoutId, timestamp: number) => void;
}
export declare function useAutoAcceptIndicator({ config, addItem, }: UseAutoAcceptIndicatorArgs): ApprovalMode;
