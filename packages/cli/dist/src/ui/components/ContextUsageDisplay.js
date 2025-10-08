import { jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@qwen-code/qwen-code-core';
export const ContextUsageDisplay = ({ promptTokenCount, model, modelLimit, }) => {
    // Prefer provided modelLimit (from Config.getEffectiveContextLimit) when available
    const limit = typeof modelLimit === 'number' && Number.isFinite(modelLimit) && modelLimit > 0
        ? modelLimit
        : tokenLimit(model);
    // Tokens remaining in the context window
    const remaining = Math.max(0, limit - promptTokenCount);
    const percentage = remaining / limit;
    return (_jsxs(Text, { color: Colors.Gray, children: ["(", remaining.toLocaleString(), "/", limit.toLocaleString(), " tokens available) (", (percentage * 100).toFixed(0), "% context left)"] }));
};
//# sourceMappingURL=ContextUsageDisplay.js.map