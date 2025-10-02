import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect, } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
export var VisionSwitchOutcome;
(function (VisionSwitchOutcome) {
    VisionSwitchOutcome["SwitchOnce"] = "once";
    VisionSwitchOutcome["SwitchSessionToVL"] = "session";
    VisionSwitchOutcome["ContinueWithCurrentModel"] = "persist";
})(VisionSwitchOutcome || (VisionSwitchOutcome = {}));
export const ModelSwitchDialog = ({ onSelect, }) => {
    useKeypress((key) => {
        if (key.name === 'escape') {
            onSelect(VisionSwitchOutcome.ContinueWithCurrentModel);
        }
    }, { isActive: true });
    const options = [
        {
            label: 'Switch for this request only',
            value: VisionSwitchOutcome.SwitchOnce,
        },
        {
            label: 'Switch session to vision model',
            value: VisionSwitchOutcome.SwitchSessionToVL,
        },
        {
            label: 'Continue with current model',
            value: VisionSwitchOutcome.ContinueWithCurrentModel,
        },
    ];
    const handleSelect = (outcome) => {
        onSelect(outcome);
    };
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentYellow, padding: 1, width: "100%", marginLeft: 1, children: [_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Vision Model Switch Required" }), _jsx(Text, { children: "Your message contains an image, but the current model doesn't support vision." }), _jsx(Text, { children: "How would you like to proceed?" })] }), _jsx(Box, { marginBottom: 1, children: _jsx(RadioButtonSelect, { items: options, initialIndex: 0, onSelect: handleSelect, isFocused: true }) }), _jsx(Box, { children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to select, Esc to cancel" }) })] }));
};
//# sourceMappingURL=ModelSwitchDialog.js.map