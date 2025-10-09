import { jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from "react";
import { Box } from "ink";
import { RadioButtonSelect } from "../../shared/RadioButtonSelect.js";
import { MANAGEMENT_STEPS } from "../types.js";
import {} from "@qwen-code/qwen-code-core";
export const ActionSelectionStep = ({ selectedAgent, onNavigateToStep, onNavigateBack, }) => {
    const [selectedAction, setSelectedAction] = useState(null);
    // Filter actions based on whether the agent is built-in
    const allActions = [
        { label: "View Agent", value: "view" },
        { label: "Edit Agent", value: "edit" },
        { label: "Delete Agent", value: "delete" },
        { label: "Back", value: "back" },
    ];
    const actions = selectedAgent?.isBuiltin
        ? allActions.filter((action) => action.value === "view" || action.value === "back")
        : allActions;
    const handleActionSelect = (value) => {
        if (value === "back") {
            onNavigateBack();
            return;
        }
        setSelectedAction(value);
        // Navigate to appropriate step based on action
        if (value === "view") {
            onNavigateToStep(MANAGEMENT_STEPS.AGENT_VIEWER);
        }
        else if (value === "edit") {
            onNavigateToStep(MANAGEMENT_STEPS.EDIT_OPTIONS);
        }
        else if (value === "delete") {
            onNavigateToStep(MANAGEMENT_STEPS.DELETE_CONFIRMATION);
        }
    };
    const selectedIndex = selectedAction
        ? actions.findIndex((action) => action.value === selectedAction)
        : 0;
    return (_jsx(Box, { flexDirection: "column", children: _jsx(RadioButtonSelect, { items: actions, initialIndex: selectedIndex, onSelect: handleActionSelect, showNumbers: false }) }));
};
//# sourceMappingURL=ActionSelectionStep.js.map