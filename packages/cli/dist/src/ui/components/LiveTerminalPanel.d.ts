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
}
export declare const LiveTerminalPanel: React.FC<LiveTerminalPanelProps>;
export {};
