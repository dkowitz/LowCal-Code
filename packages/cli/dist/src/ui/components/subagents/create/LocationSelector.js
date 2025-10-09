import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box } from "ink";
import { RadioButtonSelect } from "../../shared/RadioButtonSelect.js";
const locationOptions = [
    {
        label: "Project Level (.qwen/agents/)",
        value: "project",
    },
    {
        label: "User Level (~/.qwen/agents/)",
        value: "user",
    },
];
/**
 * Step 1: Location selection for subagent storage.
 */
export function LocationSelector({ state, dispatch, onNext }) {
    const handleSelect = (selectedValue) => {
        const location = selectedValue;
        dispatch({ type: "SET_LOCATION", location });
        onNext();
    };
    return (_jsx(Box, { flexDirection: "column", children: _jsx(RadioButtonSelect, { items: locationOptions.map((option) => ({
                label: option.label,
                value: option.value,
            })), initialIndex: locationOptions.findIndex((opt) => opt.value === state.location), onSelect: handleSelect, isFocused: true }) }));
}
//# sourceMappingURL=LocationSelector.js.map