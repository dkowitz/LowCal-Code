/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React from "react";
import type { TaskResultDisplay, Config } from "@qwen-code/qwen-code-core";
export type DisplayMode = "compact" | "default" | "verbose";
export interface AgentExecutionDisplayProps {
    data: TaskResultDisplay;
    availableHeight?: number;
    childWidth: number;
    config: Config;
}
/**
 * Component to display subagent execution progress and results.
 * This is now a pure component that renders the provided SubagentExecutionResultDisplay data.
 * Real-time updates are handled by the parent component updating the data prop.
 */
export declare const AgentExecutionDisplay: React.FC<AgentExecutionDisplayProps>;
