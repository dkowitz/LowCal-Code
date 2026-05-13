/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import type { TerminalSnapshot } from "@qwen-code/qwen-code-core";
interface LiveTerminalPanelProps {
    snapshot: TerminalSnapshot;
    height: number;
    width: number;
    /** Number of lines scrolled up from the bottom. 0 = follow mode (showing latest). */
    scrollOffset: number;
}
/**
 * Layout is strictly fixed-height to prevent Ink re-render artifacts:
 *   Row 1: Title bar (Terminal id: name ............ running)
 *   Row 2: Info bar  (cwd ......................... 80x24)
 *   Rows 3..N: Terminal body (fixed count, padded if short)
 *
 * Scroll state is NOT shown inside the panel — it lives in the conversation
 * status bar below. This keeps the terminal looking like a real terminal window.
 */
export declare const HEADER_ROWS = 2;
export declare const LiveTerminalPanel: React.FC<LiveTerminalPanelProps>;
export {};
