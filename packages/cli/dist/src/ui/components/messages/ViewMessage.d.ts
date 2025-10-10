/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
interface ViewMessageProps {
    text: string;
    filePath: string;
    tokenCount?: number;
    onExit: () => void;
    isActive: boolean;
    scrollOffset: number;
    maxHeight: number;
    onScroll: (direction: "up" | "down") => void;
    terminalWidth?: number;
}
export declare const ViewMessage: React.FC<ViewMessageProps>;
export {};
