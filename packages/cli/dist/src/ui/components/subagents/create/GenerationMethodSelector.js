import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box } from 'ink';
import { RadioButtonSelect } from '../../shared/RadioButtonSelect.js';
const generationOptions = [
    {
        label: 'Generate with Qwen Code (Recommended)',
        value: 'qwen',
    },
    {
        label: 'Manual Creation',
        value: 'manual',
    },
];
/**
 * Step 2: Generation method selection.
 */
export function GenerationMethodSelector({ state, dispatch, onNext, onPrevious: _onPrevious, }) {
    const handleSelect = (selectedValue) => {
        const method = selectedValue;
        dispatch({ type: 'SET_GENERATION_METHOD', method });
        onNext();
    };
    return (_jsx(Box, { flexDirection: "column", children: _jsx(RadioButtonSelect, { items: generationOptions.map((option) => ({
                label: option.label,
                value: option.value,
            })), initialIndex: generationOptions.findIndex((opt) => opt.value === state.generationMethod), onSelect: handleSelect, isFocused: true }) }));
}
//# sourceMappingURL=GenerationMethodSelector.js.map