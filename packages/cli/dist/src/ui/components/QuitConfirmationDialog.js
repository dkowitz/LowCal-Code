import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect, } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
export var QuitChoice;
(function (QuitChoice) {
    QuitChoice["CANCEL"] = "cancel";
    QuitChoice["QUIT"] = "quit";
    QuitChoice["SAVE_AND_QUIT"] = "save_and_quit";
    QuitChoice["SUMMARY_AND_QUIT"] = "summary_and_quit";
})(QuitChoice || (QuitChoice = {}));
export const QuitConfirmationDialog = ({ onSelect, }) => {
    useKeypress((key) => {
        if (key.name === 'escape') {
            onSelect(QuitChoice.CANCEL);
        }
    }, { isActive: true });
    const options = [
        {
            label: 'Quit immediately (/quit)',
            value: QuitChoice.QUIT,
        },
        {
            label: 'Generate summary and quit (/summary)',
            value: QuitChoice.SUMMARY_AND_QUIT,
        },
        {
            label: 'Save conversation and quit (/chat save)',
            value: QuitChoice.SAVE_AND_QUIT,
        },
        {
            label: 'Cancel (stay in application)',
            value: QuitChoice.CANCEL,
        },
    ];
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentYellow, padding: 1, width: "100%", marginLeft: 1, children: [_jsx(Box, { flexDirection: "column", marginBottom: 1, children: _jsx(Text, { children: "What would you like to do before exiting?" }) }), _jsx(RadioButtonSelect, { items: options, onSelect: onSelect, isFocused: true })] }));
};
//# sourceMappingURL=QuitConfirmationDialog.js.map