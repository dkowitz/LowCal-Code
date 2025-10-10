/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import type { HistoryItemView } from "../types.js";
interface ViewOverlayProps {
    item: HistoryItemView;
    height: number;
    width: number;
    scrollOffset: number;
    onScroll: (direction: "up" | "down") => void;
    onExit: () => void;
}
export declare const ViewOverlay: React.FC<ViewOverlayProps>;
export {};
