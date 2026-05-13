/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Box, Text } from "ink";
import type { TerminalSnapshot } from "@qwen-code/qwen-code-core";
import { Colors } from "../colors.js";

interface LiveTerminalPanelProps {
  snapshot: TerminalSnapshot;
  height: number;
  width: number;
  /** Number of lines scrolled up from the bottom. 0 = follow mode (showing latest). */
  scrollOffset: number;
}

function fitLine(line: string, width: number): string {
  if (line.length <= width) {
    return line;
  }
  return line.slice(0, Math.max(0, width - 1));
}

/**
 * Layout is strictly fixed-height to prevent Ink re-render artifacts:
 *   Row 1: Title bar (Terminal id: name ............ running)
 *   Row 2: Info bar  (cwd ......................... 80x24)
 *   Rows 3..N: Terminal body (fixed count, padded if short)
 *
 * Scroll state is NOT shown inside the panel — it lives in the conversation
 * status bar below. This keeps the terminal looking like a real terminal window.
 */

export const HEADER_ROWS = 2;

export const LiveTerminalPanel: React.FC<LiveTerminalPanelProps> = ({
  snapshot,
  height,
  width,
  scrollOffset,
}) => {
  const bodyHeight = Math.max(1, height - HEADER_ROWS);
  const bodyWidth = Math.max(10, width - 4);

  // Parse all lines from the terminal screen buffer.
  const allLines = React.useMemo(() => {
    return snapshot.screen ? snapshot.screen.split("\n") : [""];
  }, [snapshot.screen]);

  const totalLines = allLines.length;

  // Clamp scrollOffset to valid range: 0 (bottom) .. maxScrollUp
  const maxScrollUp = Math.max(0, totalLines - bodyHeight);
  const clampedOffset = Math.min(scrollOffset, maxScrollUp);

  // Compute visible window: slice from (totalLines - bodyHeight - offset) to end of that window.
  const startLine = Math.max(0, totalLines - bodyHeight - clampedOffset);
  const visibleLines = React.useMemo(() => {
    const sliced = allLines.slice(startLine, startLine + bodyHeight);
    // Pad with empty lines if content is shorter than viewport — keeps Ink box stable.
    while (sliced.length < bodyHeight) {
      sliced.push(" ");
    }
    return sliced;
  }, [allLines, startLine, bodyHeight]);

  const statusColor = snapshot.running ? Colors.AccentGreen : Colors.Gray;

  // Show a visible cursor block at the end of the last line for running PTY sessions in follow mode.
  const showCursor =
    snapshot.running &&
    snapshot.backend === "pty" &&
    clampedOffset === 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={snapshot.running ? Colors.AccentCyan : Colors.Gray}
      paddingX={1}
      width={width}
      height={height}
      flexShrink={0}
    >
      {/* Row 1: Title bar */}
      <Box justifyContent="space-between" width="100%">
        <Text bold color={Colors.AccentCyan} wrap="truncate">
          Terminal {snapshot.id}: {snapshot.name}
        </Text>
        <Text color={statusColor}>{snapshot.running ? "running" : "exited"}</Text>
      </Box>

      {/* Row 2: Info bar */}
      <Box justifyContent="space-between" width="100%">
        <Text color={Colors.Gray} wrap="truncate">
          {snapshot.cwd}
        </Text>
        <Text color={Colors.Gray}>
          {snapshot.cols}x{snapshot.rows}
        </Text>
      </Box>

      {/* Terminal body — fixed height, exactly bodyHeight lines */}
      <Box flexDirection="column" height={bodyHeight} width="100%">
        {visibleLines.map((line, index) => {
          const isLastLine = index === visibleLines.length - 1;
          if (showCursor && isLastLine) {
            return (
              <Text key={`${snapshot.outputVersion}-${index}`} wrap="truncate">
                {fitLine(line, bodyWidth)}
                <Text color={Colors.AccentCyan} bold>
                  {"\u2588"}
                </Text>
              </Text>
            );
          }
          return (
            <Text key={`${snapshot.outputVersion}-${index}`} wrap="truncate">
              {fitLine(line, bodyWidth) || " "}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};
