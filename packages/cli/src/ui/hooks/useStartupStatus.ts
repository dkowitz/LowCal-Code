/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";
import { MessageType, type HistoryItemInfo } from "../types.js";
import {
  loadCliToolConfig,
  syncCoreToolConfig,
  type PromptMode,
} from "../commands/utils/toolConfig.js";

export interface UseStartupStatusProps {
  addItem: (itemData: Omit<HistoryItemInfo, "id">, baseTimestamp: number) => void;
}

/**
 * Hook to display startup status message showing active promptMode and toolset
 */
export function useStartupStatus({ addItem }: UseStartupStatusProps): void {
  const hasShownStartupStatus = useRef(false);

  useEffect(() => {
    if (hasShownStartupStatus.current) {
      return;
    }

    try {
      const cfg = loadCliToolConfig();
      syncCoreToolConfig(cfg);
      const toolset = cfg.collections[cfg.activeCollection];
      const toolCount = toolset?.length ?? 0;
      const toolList = toolset?.join(", ") ?? "(empty)";

      const modeDescriptions: Record<PromptMode, string> = {
        auto: "auto (concise for LM Studio, full otherwise)",
        full: "full (comprehensive system prompt)",
        concise: "concise (always short)",
      };

      const customPromptInfo = cfg.activeCustomPrompt
        ? ` | Custom Prompt: ${Array.isArray(cfg.activeCustomPrompt.name) ? cfg.activeCustomPrompt.name.join(", ") : cfg.activeCustomPrompt.name} (${cfg.activeCustomPrompt.exclusive ? "EXCLUSIVE" : "SUPPLEMENTAL"})`
        : "";

      const statusMessage = `📋 Status: Prompt Mode: ${cfg.promptMode} (${modeDescriptions[cfg.promptMode]})${customPromptInfo} | Active Toolset: ${cfg.activeCollection} (${toolCount} tool${toolCount === 1 ? "" : "s"})\n\n🔧 Tools: ${toolList}`;

      const infoItem: Omit<HistoryItemInfo, "id"> = {
        type: MessageType.INFO,
        text: statusMessage,
      };

      addItem(infoItem, Date.now());
      hasShownStartupStatus.current = true;
    } catch (error) {
      console.warn("[useStartupStatus] Failed to display startup status:", error);
      hasShownStartupStatus.current = true;
    }
  }, [addItem]);
}
