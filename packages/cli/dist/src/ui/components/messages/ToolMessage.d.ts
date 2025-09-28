/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import type { IndividualToolCallDisplay } from '../../types.js';
import type { Config } from '@qwen-code/qwen-code-core';
export type TextEmphasis = 'high' | 'medium' | 'low';
export interface ToolMessageProps extends IndividualToolCallDisplay {
    availableTerminalHeight?: number;
    terminalWidth: number;
    emphasis?: TextEmphasis;
    renderOutputAsMarkdown?: boolean;
    config: Config;
}
export declare const ToolMessage: React.FC<ToolMessageProps>;
