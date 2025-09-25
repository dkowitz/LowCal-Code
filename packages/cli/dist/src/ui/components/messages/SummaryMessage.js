import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../../colors.js';
/*
 * Summary messages appear when the /chat summary command is run, and show a loading spinner
 * while summary generation is in progress, followed up by success confirmation.
 */
export const SummaryMessage = ({ summary }) => {
    const getText = () => {
        if (summary.isPending) {
            switch (summary.stage) {
                case 'generating':
                    return 'Generating project summary...';
                case 'saving':
                    return 'Saving project summary...';
                default:
                    return 'Processing summary...';
            }
        }
        const baseMessage = 'Project summary generated and saved successfully!';
        if (summary.filePath) {
            return `${baseMessage} Saved to: ${summary.filePath}`;
        }
        return baseMessage;
    };
    const getIcon = () => {
        if (summary.isPending) {
            return _jsx(Spinner, { type: "dots" });
        }
        return _jsx(Text, { color: Colors.AccentGreen, children: "\u2705" });
    };
    return (_jsxs(Box, { flexDirection: "row", children: [_jsx(Box, { marginRight: 1, children: getIcon() }), _jsx(Box, { children: _jsx(Text, { color: summary.isPending ? Colors.AccentPurple : Colors.AccentGreen, children: getText() }) })] }));
};
//# sourceMappingURL=SummaryMessage.js.map