import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, Text } from 'ink';
import {} from '@qwen-code/qwen-code-core';
import { theme } from '../../../semantic-colors.js';
import { useKeypress } from '../../../hooks/useKeypress.js';
export function AgentDeleteStep({ selectedAgent, onDelete, onNavigateBack, }) {
    useKeypress(async (key) => {
        if (!selectedAgent)
            return;
        if (key.name === 'y' || key.name === 'return') {
            try {
                await onDelete(selectedAgent);
                // Navigation will be handled by the parent component after successful deletion
            }
            catch (error) {
                console.error('Failed to delete agent:', error);
            }
        }
        else if (key.name === 'n') {
            onNavigateBack();
        }
    }, { isActive: true });
    if (!selectedAgent) {
        return (_jsx(Box, { children: _jsx(Text, { color: theme.status.error, children: "No agent selected" }) }));
    }
    return (_jsx(Box, { flexDirection: "column", gap: 1, children: _jsxs(Text, { color: theme.status.error, children: ["Are you sure you want to delete agent \u201C", selectedAgent.name, "\u201D?"] }) }));
}
//# sourceMappingURL=AgentDeleteStep.js.map