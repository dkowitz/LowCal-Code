import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect, } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
export const ModelSelectionDialog = ({ availableModels, currentModel, onSelect, onCancel, }) => {
    useKeypress((key) => {
        if (key.name === 'escape') {
            onCancel();
        }
    }, { isActive: true });
    const options = availableModels.map((model) => {
        const visionIndicator = model.isVision ? ' [Vision]' : '';
        const currentIndicator = model.id === currentModel ? ' (current)' : '';
        return {
            label: `${model.label}${visionIndicator}${currentIndicator}`,
            value: model.id,
        };
    });
    const initialIndex = Math.max(0, availableModels.findIndex((model) => model.id === currentModel));
    const handleSelect = (modelId) => {
        onSelect(modelId);
    };
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentBlue, padding: 1, width: "100%", marginLeft: 1, children: [_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Select Model" }), _jsx(Text, { children: "Choose a model for this session:" })] }), _jsx(Box, { marginBottom: 1, children: _jsx(RadioButtonSelect, { items: options, initialIndex: initialIndex, onSelect: handleSelect, isFocused: true }) }), _jsx(Box, { children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to select, Esc to cancel" }) })] }));
};
//# sourceMappingURL=ModelSelectionDialog.js.map