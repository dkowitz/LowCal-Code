import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../../colors.js';
import { theme } from '../../../semantic-colors.js';
import { useKeypress } from '../../../hooks/useKeypress.js';
import { COLOR_OPTIONS } from '../constants.js';
import { fmtDuration } from '../utils.js';
import { ToolConfirmationMessage } from '../../messages/ToolConfirmationMessage.js';
const getStatusColor = (status) => {
    switch (status) {
        case 'running':
        case 'executing':
        case 'awaiting_approval':
            return theme.status.warning;
        case 'completed':
        case 'success':
            return theme.status.success;
        case 'cancelled':
            return theme.status.warning;
        case 'failed':
            return theme.status.error;
        default:
            return Colors.Gray;
    }
};
const getStatusText = (status) => {
    switch (status) {
        case 'running':
            return 'Running';
        case 'completed':
            return 'Completed';
        case 'cancelled':
            return 'User Cancelled';
        case 'failed':
            return 'Failed';
        default:
            return 'Unknown';
    }
};
const MAX_TOOL_CALLS = 5;
const MAX_TASK_PROMPT_LINES = 5;
/**
 * Component to display subagent execution progress and results.
 * This is now a pure component that renders the provided SubagentExecutionResultDisplay data.
 * Real-time updates are handled by the parent component updating the data prop.
 */
export const AgentExecutionDisplay = ({ data, availableHeight, childWidth, config, }) => {
    const [displayMode, setDisplayMode] = React.useState('compact');
    const agentColor = useMemo(() => {
        const colorOption = COLOR_OPTIONS.find((option) => option.name === data.subagentColor);
        return colorOption?.value || theme.text.accent;
    }, [data.subagentColor]);
    const footerText = React.useMemo(() => {
        // This component only listens to keyboard shortcut events when the subagent is running
        if (data.status !== 'running')
            return '';
        if (displayMode === 'default') {
            const hasMoreLines = data.taskPrompt.split('\n').length > MAX_TASK_PROMPT_LINES;
            const hasMoreToolCalls = data.toolCalls && data.toolCalls.length > MAX_TOOL_CALLS;
            if (hasMoreToolCalls || hasMoreLines) {
                return 'Press ctrl+r to show less, ctrl+e to show more.';
            }
            return 'Press ctrl+r to show less.';
        }
        if (displayMode === 'verbose') {
            return 'Press ctrl+e to show less.';
        }
        return '';
    }, [displayMode, data]);
    // Handle keyboard shortcuts to control display mode
    useKeypress((key) => {
        if (key.ctrl && key.name === 'r') {
            // ctrl+r toggles between compact and default
            setDisplayMode((current) => current === 'compact' ? 'default' : 'compact');
        }
        else if (key.ctrl && key.name === 'e') {
            // ctrl+e toggles between default and verbose
            setDisplayMode((current) => current === 'default' ? 'verbose' : 'default');
        }
    }, { isActive: true });
    if (displayMode === 'compact') {
        return (_jsxs(Box, { flexDirection: "column", children: [!data.pendingConfirmation && (_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { bold: true, color: agentColor, children: data.subagentName }), _jsx(StatusDot, { status: data.status }), _jsx(StatusIndicator, { status: data.status })] })), data.status === 'running' && (_jsxs(_Fragment, { children: [data.toolCalls && data.toolCalls.length > 0 && (_jsxs(Box, { flexDirection: "column", children: [_jsx(ToolCallItem, { toolCall: data.toolCalls[data.toolCalls.length - 1], compact: true }), data.toolCalls.length > 1 && !data.pendingConfirmation && (_jsx(Box, { flexDirection: "row", paddingLeft: 4, children: _jsxs(Text, { color: Colors.Gray, children: ["+", data.toolCalls.length - 1, " more tool calls (ctrl+r to expand)"] }) }))] })), data.pendingConfirmation && (_jsx(Box, { flexDirection: "column", marginTop: 1, paddingLeft: 1, children: _jsx(ToolConfirmationMessage, { confirmationDetails: data.pendingConfirmation, isFocused: true, availableTerminalHeight: availableHeight, terminalWidth: childWidth, compactMode: true, config: config }) }))] })), data.status === 'completed' && data.executionSummary && (_jsx(Box, { flexDirection: "row", marginTop: 1, children: _jsxs(Text, { color: theme.text.secondary, children: ["Execution Summary: ", data.executionSummary.totalToolCalls, " tool uses \u00B7 ", data.executionSummary.totalTokens.toLocaleString(), " tokens \u00B7 ", fmtDuration(data.executionSummary.totalDurationMs)] }) })), data.status === 'failed' && (_jsx(Box, { flexDirection: "row", marginTop: 1, children: _jsxs(Text, { color: theme.status.error, children: ["Failed: ", data.terminateReason] }) }))] }));
    }
    // Default and verbose modes use normal layout
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, gap: 1, children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { bold: true, color: agentColor, children: data.subagentName }), _jsx(StatusDot, { status: data.status }), _jsx(StatusIndicator, { status: data.status })] }), _jsx(TaskPromptSection, { taskPrompt: data.taskPrompt, displayMode: displayMode }), data.status === 'running' &&
                data.toolCalls &&
                data.toolCalls.length > 0 && (_jsx(Box, { flexDirection: "column", children: _jsx(ToolCallsList, { toolCalls: data.toolCalls, displayMode: displayMode }) })), data.pendingConfirmation && (_jsx(Box, { flexDirection: "column", children: _jsx(ToolConfirmationMessage, { confirmationDetails: data.pendingConfirmation, config: config, isFocused: true, availableTerminalHeight: availableHeight, terminalWidth: childWidth, compactMode: true }) })), (data.status === 'completed' ||
                data.status === 'failed' ||
                data.status === 'cancelled') && (_jsx(ResultsSection, { data: data, displayMode: displayMode })), footerText && (_jsx(Box, { flexDirection: "row", children: _jsx(Text, { color: Colors.Gray, children: footerText }) }))] }));
};
/**
 * Task prompt section with truncation support
 */
const TaskPromptSection = ({ taskPrompt, displayMode }) => {
    const lines = taskPrompt.split('\n');
    const shouldTruncate = lines.length > 10;
    const showFull = displayMode === 'verbose';
    const displayLines = showFull ? lines : lines.slice(0, MAX_TASK_PROMPT_LINES);
    return (_jsxs(Box, { flexDirection: "column", gap: 1, children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: theme.text.primary, children: "Task Detail: " }), shouldTruncate && displayMode === 'default' && (_jsxs(Text, { color: Colors.Gray, children: [' ', "Showing the first ", MAX_TASK_PROMPT_LINES, " lines."] }))] }), _jsx(Box, { paddingLeft: 1, children: _jsx(Text, { wrap: "wrap", children: displayLines.join('\n') + (shouldTruncate && !showFull ? '...' : '') }) })] }));
};
/**
 * Status dot component with similar height as text
 */
const StatusDot = ({ status }) => (_jsx(Box, { marginLeft: 1, marginRight: 1, children: _jsx(Text, { color: getStatusColor(status), children: "\u25CF" }) }));
/**
 * Status indicator component
 */
const StatusIndicator = ({ status }) => {
    const color = getStatusColor(status);
    const text = getStatusText(status);
    return _jsx(Text, { color: color, children: text });
};
/**
 * Tool calls list - format consistent with ToolInfo in ToolMessage.tsx
 */
const ToolCallsList = ({ toolCalls, displayMode }) => {
    const calls = toolCalls || [];
    const shouldTruncate = calls.length > MAX_TOOL_CALLS;
    const showAll = displayMode === 'verbose';
    const displayCalls = showAll ? calls : calls.slice(-MAX_TOOL_CALLS); // Show last 5
    // Reverse the order to show most recent first
    const reversedDisplayCalls = [...displayCalls].reverse();
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { flexDirection: "row", marginBottom: 1, children: [_jsx(Text, { color: theme.text.primary, children: "Tools:" }), shouldTruncate && displayMode === 'default' && (_jsxs(Text, { color: Colors.Gray, children: [' ', "Showing the last ", MAX_TOOL_CALLS, " of ", calls.length, " tools."] }))] }), reversedDisplayCalls.map((toolCall, index) => (_jsx(ToolCallItem, { toolCall: toolCall }, `${toolCall.name}-${index}`)))] }));
};
/**
 * Individual tool call item - consistent with ToolInfo format
 */
const ToolCallItem = ({ toolCall, compact = false }) => {
    const STATUS_INDICATOR_WIDTH = 3;
    // Map subagent status to ToolCallStatus-like display
    const statusIcon = React.useMemo(() => {
        const color = getStatusColor(toolCall.status);
        switch (toolCall.status) {
            case 'executing':
                return _jsx(Text, { color: color, children: "\u22B7" }); // Using same as ToolMessage
            case 'awaiting_approval':
                return _jsx(Text, { color: theme.status.warning, children: "?" });
            case 'success':
                return _jsx(Text, { color: color, children: "\u2713" });
            case 'failed':
                return (_jsx(Text, { color: color, bold: true, children: "x" }));
            default:
                return _jsx(Text, { color: color, children: "o" });
        }
    }, [toolCall.status]);
    const description = React.useMemo(() => {
        if (!toolCall.description)
            return '';
        const firstLine = toolCall.description.split('\n')[0];
        return firstLine.length > 80
            ? firstLine.substring(0, 80) + '...'
            : firstLine;
    }, [toolCall.description]);
    // Get first line of resultDisplay for truncated output
    const truncatedOutput = React.useMemo(() => {
        if (!toolCall.resultDisplay)
            return '';
        const firstLine = toolCall.resultDisplay.split('\n')[0];
        return firstLine.length > 80
            ? firstLine.substring(0, 80) + '...'
            : firstLine;
    }, [toolCall.resultDisplay]);
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 1, marginBottom: 0, children: [_jsxs(Box, { flexDirection: "row", children: [_jsx(Box, { minWidth: STATUS_INDICATOR_WIDTH, children: statusIcon }), _jsxs(Text, { wrap: "truncate-end", children: [_jsx(Text, { children: toolCall.name }), ' ', _jsx(Text, { color: Colors.Gray, children: description }), toolCall.error && (_jsxs(Text, { color: theme.status.error, children: [" - ", toolCall.error] }))] })] }), !compact && truncatedOutput && (_jsx(Box, { flexDirection: "row", paddingLeft: STATUS_INDICATOR_WIDTH, children: _jsx(Text, { color: Colors.Gray, children: truncatedOutput }) }))] }));
};
/**
 * Execution summary details component
 */
const ExecutionSummaryDetails = ({ data, displayMode: _displayMode }) => {
    const stats = data.executionSummary;
    if (!stats) {
        return (_jsx(Box, { flexDirection: "column", paddingLeft: 1, children: _jsx(Text, { color: Colors.Gray, children: "\u2022 No summary available" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 1, children: [_jsxs(Text, { children: ["\u2022 ", _jsxs(Text, { children: ["Duration: ", fmtDuration(stats.totalDurationMs)] })] }), _jsxs(Text, { children: ["\u2022 ", _jsxs(Text, { children: ["Rounds: ", stats.rounds] })] }), _jsxs(Text, { children: ["\u2022 ", _jsxs(Text, { children: ["Tokens: ", stats.totalTokens.toLocaleString()] })] })] }));
};
/**
 * Tool usage statistics component
 */
const ToolUsageStats = ({ executionSummary }) => {
    if (!executionSummary) {
        return (_jsx(Box, { flexDirection: "column", paddingLeft: 1, children: _jsx(Text, { color: Colors.Gray, children: "\u2022 No tool usage data available" }) }));
    }
    return (_jsxs(Box, { flexDirection: "column", paddingLeft: 1, children: [_jsxs(Text, { children: ["\u2022 ", _jsx(Text, { children: "Total Calls:" }), " ", executionSummary.totalToolCalls] }), _jsxs(Text, { children: ["\u2022 ", _jsx(Text, { children: "Success Rate:" }), ' ', _jsxs(Text, { color: Colors.AccentGreen, children: [executionSummary.successRate.toFixed(1), "%"] }), ' ', "(", _jsxs(Text, { color: Colors.AccentGreen, children: [executionSummary.successfulToolCalls, " success"] }), ",", ' ', _jsxs(Text, { color: Colors.AccentRed, children: [executionSummary.failedToolCalls, " failed"] }), ")"] })] }));
};
/**
 * Results section for completed executions - matches the clean layout from the image
 */
const ResultsSection = ({ data, displayMode }) => (_jsxs(Box, { flexDirection: "column", gap: 1, children: [data.toolCalls && data.toolCalls.length > 0 && (_jsx(ToolCallsList, { toolCalls: data.toolCalls, displayMode: displayMode })), data.status === 'completed' && (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { flexDirection: "row", marginBottom: 1, children: _jsx(Text, { color: theme.text.primary, children: "Execution Summary:" }) }), _jsx(ExecutionSummaryDetails, { data: data, displayMode: displayMode })] })), data.status === 'completed' && data.executionSummary && (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { flexDirection: "row", marginBottom: 1, children: _jsx(Text, { color: theme.text.primary, children: "Tool Usage:" }) }), _jsx(ToolUsageStats, { executionSummary: data.executionSummary })] })), data.status === 'cancelled' && (_jsx(Box, { flexDirection: "row", children: _jsx(Text, { color: theme.status.warning, children: "\u23F9 User Cancelled" }) })), data.status === 'failed' && (_jsxs(Box, { flexDirection: "row", children: [_jsx(Text, { color: theme.status.error, children: "Task Failed: " }), _jsx(Text, { color: theme.status.error, children: data.terminateReason })] }))] }));
//# sourceMappingURL=AgentExecutionDisplay.js.map