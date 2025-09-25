import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import { Colors } from '../colors.js';
export const PlanSummaryDisplay = ({ data, availableHeight, childWidth, }) => {
    const { message, plan } = data;
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: Colors.AccentGreen, wrap: "wrap", children: message }) }), _jsx(MarkdownDisplay, { text: plan, isPending: false, availableTerminalHeight: availableHeight, terminalWidth: childWidth })] }));
};
//# sourceMappingURL=PlanSummaryDisplay.js.map