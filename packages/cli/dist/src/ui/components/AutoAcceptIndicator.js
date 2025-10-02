import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ApprovalMode } from '@qwen-code/qwen-code-core';
export const AutoAcceptIndicator = ({ approvalMode, }) => {
    let textColor = '';
    let textContent = '';
    let subText = '';
    switch (approvalMode) {
        case ApprovalMode.PLAN:
            textColor = Colors.AccentBlue;
            textContent = 'plan mode';
            subText = ' (shift + tab to cycle)';
            break;
        case ApprovalMode.AUTO_EDIT:
            textColor = Colors.AccentGreen;
            textContent = 'auto-accept edits';
            subText = ' (shift + tab to cycle)';
            break;
        case ApprovalMode.YOLO:
            textColor = Colors.AccentRed;
            textContent = 'YOLO mode';
            subText = ' (shift + tab to cycle)';
            break;
        case ApprovalMode.DEFAULT:
        default:
            break;
    }
    return (_jsx(Box, { children: _jsxs(Text, { color: textColor, children: [textContent, subText && _jsx(Text, { color: Colors.Gray, children: subText })] }) }));
};
//# sourceMappingURL=AutoAcceptIndicator.js.map