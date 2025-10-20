/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type HistoryItemInfo } from "../types.js";
export interface UseStartupStatusProps {
    addItem: (itemData: Omit<HistoryItemInfo, "id">, baseTimestamp: number) => void;
}
/**
 * Hook to display startup status message showing active promptMode and toolset
 */
export declare function useStartupStatus({ addItem }: UseStartupStatusProps): void;
