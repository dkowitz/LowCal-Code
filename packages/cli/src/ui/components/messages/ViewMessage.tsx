/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import { MarkdownDisplay } from "../../utils/MarkdownDisplay.js";

// SCROLL_STEP intentionally unused; kept for future adjustments

interface ViewMessageProps {
  text: string;
  filePath: string;
  tokenCount?: number;
  onExit: () => void;
  isActive: boolean;
  scrollOffset: number;
  maxHeight: number;
  onScroll: (direction: "up" | "down") => void;
  terminalWidth?: number;
}

export const ViewMessage: React.FC<ViewMessageProps> = ({
  text,
  filePath,
  tokenCount,
  onExit,
  isActive,
  scrollOffset,
  maxHeight,
  onScroll,
  terminalWidth,
}) => {
  useInput(
    (input, key) => {
      if (!isActive) {
        return;
      }

      if (key.upArrow || input === "k") {
        onScroll("up");
      } else if (key.downArrow || input === "j") {
        onScroll("down");
      } else if (input === "q" || key.escape) {
        onExit();
      }
    },
    { isActive },
  );

  const lines = text.split("\n");
  const visibleLines = lines.slice(scrollOffset, scrollOffset + maxHeight);

  return (
    <Box flexDirection="column" borderStyle="single">
      <Text bold>
        Viewing file content for {filePath} - {tokenCount ?? "Unknown"} tokens
        (scroll with ↑/↓ or q to exit)
      </Text>
      <Box flexDirection="column" height={maxHeight}>
        <MarkdownDisplay
            text={visibleLines.join("\n")}
            isPending={false}
            availableTerminalHeight={maxHeight}
            terminalWidth={(terminalWidth ?? Math.max(80, filePath.length)) as number}
          />
      </Box>
    </Box>
  );
};