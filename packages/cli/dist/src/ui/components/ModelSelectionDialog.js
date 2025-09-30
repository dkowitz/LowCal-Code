import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { TextInput } from "./shared/TextInput.js";
export const ModelSelectionDialog = ({ availableModels, currentModel, onSelect, onCancel, }) => {
    const [searchQuery, setSearchQuery] = useState("");
    useKeypress((key) => {
        if (key.name === "escape") {
            onCancel();
        }
    }, { isActive: true });
    const filteredModels = availableModels.filter((model) => model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.id.toLowerCase().includes(searchQuery.toLowerCase()));
    const options = filteredModels.map((model) => {
        const visionIndicator = model.isVision ? " [Vision]" : "";
        const currentIndicator = model.id === currentModel ? " (current)" : "";
        return {
            label: `${model.label}${visionIndicator}${currentIndicator}`,
            value: model.id,
        };
    });
    const initialIndex = Math.max(0, filteredModels.findIndex((model) => model.id === currentModel));
    const handleSelect = (modelId) => {
        onSelect(modelId);
    };
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: Colors.AccentBlue, padding: 1, width: "100%", marginLeft: 1, children: [_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsx(Text, { bold: true, children: "Select Model" }), _jsx(Text, { children: "Choose a model for this session:" })] }), _jsx(Box, { marginBottom: 1, children: _jsx(TextInput, { value: searchQuery, onChange: setSearchQuery, placeholder: "Search models..." }) }), _jsx(Box, { marginBottom: 1, children: _jsx(RadioButtonSelect, { items: options, initialIndex: initialIndex, onSelect: handleSelect, isFocused: true }) }), _jsx(Box, { children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to select, Esc to cancel" }) })] }));
};
//# sourceMappingURL=ModelSelectionDialog.js.map