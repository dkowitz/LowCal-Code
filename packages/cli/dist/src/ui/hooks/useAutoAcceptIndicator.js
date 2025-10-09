/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { APPROVAL_MODES, } from "@qwen-code/qwen-code-core";
import { useEffect, useState } from "react";
import { useKeypress } from "./useKeypress.js";
import { MessageType } from "../types.js";
export function useAutoAcceptIndicator({ config, addItem, }) {
    const currentConfigValue = config.getApprovalMode();
    const [showAutoAcceptIndicator, setShowAutoAcceptIndicator] = useState(currentConfigValue);
    useEffect(() => {
        setShowAutoAcceptIndicator(currentConfigValue);
    }, [currentConfigValue]);
    useKeypress((key) => {
        if (!(key.shift && key.name === "tab")) {
            return;
        }
        const currentMode = config.getApprovalMode();
        const currentIndex = APPROVAL_MODES.indexOf(currentMode);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % APPROVAL_MODES.length;
        const nextApprovalMode = APPROVAL_MODES[nextIndex];
        try {
            config.setApprovalMode(nextApprovalMode);
            // Update local state immediately for responsiveness
            setShowAutoAcceptIndicator(nextApprovalMode);
        }
        catch (e) {
            addItem({
                type: MessageType.INFO,
                text: e.message,
            }, Date.now());
        }
    }, { isActive: true });
    return showAutoAcceptIndicator;
}
//# sourceMappingURL=useAutoAcceptIndicator.js.map