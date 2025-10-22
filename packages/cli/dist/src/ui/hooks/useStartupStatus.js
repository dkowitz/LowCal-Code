/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef } from "react";
import { MessageType } from "../types.js";
import { loadCliToolConfig, } from "../commands/utils/toolConfig.js";
/**
 * Hook to display startup status message showing active promptMode and toolset
 */
export function useStartupStatus({ addItem }) {
    const hasShownStartupStatus = useRef(false);
    useEffect(() => {
        if (hasShownStartupStatus.current) {
            return;
        }
        try {
            const cfg = loadCliToolConfig();
            const toolset = cfg.collections[cfg.activeCollection];
            const toolCount = toolset?.length ?? 0;
            const toolList = toolset?.join(", ") ?? "(empty)";
            const modeDescriptions = {
                auto: "auto (concise for LM Studio, full otherwise)",
                full: "full (comprehensive system prompt)",
                concise: "concise (always short)",
            };
            const customPromptInfo = cfg.activeCustomPrompt
                ? ` | Custom Prompt: ${cfg.activeCustomPrompt.name} (${cfg.activeCustomPrompt.exclusive ? "EXCLUSIVE" : "SUPPLEMENTAL"})`
                : "";
            const statusMessage = `📋 Status: Prompt Mode: ${cfg.promptMode} (${modeDescriptions[cfg.promptMode]})${customPromptInfo} | Active Toolset: ${cfg.activeCollection} (${toolCount} tool${toolCount === 1 ? "" : "s"})\n\n🔧 Tools: ${toolList}`;
            const infoItem = {
                type: MessageType.INFO,
                text: statusMessage,
            };
            addItem(infoItem, Date.now());
            hasShownStartupStatus.current = true;
        }
        catch (error) {
            console.warn("[useStartupStatus] Failed to display startup status:", error);
            hasShownStartupStatus.current = true;
        }
    }, [addItem]);
}
//# sourceMappingURL=useStartupStatus.js.map