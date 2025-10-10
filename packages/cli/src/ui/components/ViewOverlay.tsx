/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import type { HistoryItemView } from "../types.js";
import { MarkdownDisplay } from "../utils/MarkdownDisplay.js";
import { useGlobalInputLock } from "../hooks/useGlobalKeyRouting.js";


interface ViewOverlayProps {
  item: HistoryItemView;
  height: number;
  width: number;
  scrollOffset: number;
  onScroll: (direction: "up" | "down") => void;
  onExit: () => void;
}

export const ViewOverlay: React.FC<ViewOverlayProps> = ({
  item,
  height,
  width,
  scrollOffset,
  onScroll,
  onExit,
}) => {
  const lines = item.text.split("\n");
  const maxHeight = Math.max(4, height - 3); // reserve space for header
  const visible = lines.slice(scrollOffset, scrollOffset + maxHeight);

  // Acquire global input lock for exclusive handling (do this in effect to avoid render-time races)
  const { requestLock, releaseLock } = useGlobalInputLock();
  const owner = `view-${item.filePath}-${item.totalLines}`;
  const [acquired, setAcquired] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    try {
      const ok = requestLock(owner);
      if (mounted && ok) setAcquired(true);
    } catch (e) {
      // ignore
    }
    return () => {
      mounted = false;
      try {
        if (acquired) releaseLock(owner);
      } catch (e) {}
    };
  }, [requestLock, releaseLock, owner]);

  // Register input handler only when we have the lock
  useInput(
    (input: string, key: any) => {
      if (!acquired) return;
      if (key.upArrow || input === "k") onScroll("up");
      else if (key.downArrow || input === "j") onScroll("down");
      else if (input === "q" || key.escape) {
        onExit();
        try { releaseLock(owner); } catch (e) {}
        setAcquired(false);
      }
    },
    { isActive: acquired },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      width={width}
      height={Math.min(height, maxHeight + 3)}
      padding={1}
      marginBottom={1}
    >
      <Box>
        <Text bold>
          Viewing file content for {item.filePath} - {item.tokenCount ?? "Unknown"} tokens
          (scroll with ↑/↓ or q to exit)
        </Text>
      </Box>
      <Box flexDirection="column" height={maxHeight}>
        <MarkdownDisplay
          text={visible.join("\n")}
          isPending={false}
          availableTerminalHeight={maxHeight}
          terminalWidth={width}
        />
      </Box>
    </Box>
  );
};
