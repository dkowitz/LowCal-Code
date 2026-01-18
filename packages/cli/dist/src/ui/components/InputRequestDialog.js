import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useState } from "react";
import { Box, Text } from "ink";
import { TextInput } from "./shared/TextInput.js";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { Command, keyMatchers } from "../keyMatchers.js";
export function InputRequestDialog({ prompt, placeholder, onSubmit, onCancel, inputWidth = 80, }) {
    const [value, setValue] = useState("");
    const handleCancel = useCallback(() => {
        onCancel();
    }, [onCancel]);
    useKeypress((key) => {
        if (keyMatchers[Command.ESCAPE](key)) {
            handleCancel();
        }
    }, { isActive: true });
    return (_jsxs(Box, { flexDirection: "column", children: [prompt, _jsx(Box, { marginTop: 1, children: _jsx(TextInput, { value: value, onChange: setValue, onSubmit: () => onSubmit(value), placeholder: placeholder, height: 6, inputWidth: inputWidth }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to continue, Esc to cancel." }) })] }));
}
//# sourceMappingURL=InputRequestDialog.js.map