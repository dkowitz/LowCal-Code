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
}

function fitLine(line: string, width: number): string {
  if (line.length <= width) {
    return line;
  }
  return line.slice(0, Math.max(0, width - 1));
}

export const LiveTerminalPanel: React.FC<LiveTerminalPanelProps> = ({
  snapshot,
  height,
  width,
}) => {
  const bodyHeight = Math.max(1, height - 4);
  const bodyWidth = Math.max(10, width - 4);
  const screenLines = React.useMemo(() => {
    const lines = snapshot.screen ? snapshot.screen.split("\n") : [""];
    return lines.slice(Math.max(0, lines.length - bodyHeight));
  }, [snapshot.screen, bodyHeight]);

  const status = snapshot.running ? "running" : "exited";
  const statusColor = snapshot.running ? Colors.AccentGreen : Colors.Gray;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={snapshot.running ? Colors.AccentCyan : Colors.Gray}
      paddingX={1}
      width={width}
      height={height}
      marginBottom={1}
    >
      <Box justifyContent="space-between" width="100%">
        <Text bold color={Colors.AccentCyan} wrap="truncate">
          Terminal {snapshot.id}: {snapshot.name}
        </Text>
        <Text color={statusColor}>{status}</Text>
      </Box>
      <Box justifyContent="space-between" width="100%">
        <Text color={Colors.Gray} wrap="truncate">
          {snapshot.cwd}
        </Text>
        <Text color={Colors.Gray}>
          {snapshot.cols}x{snapshot.rows}
        </Text>
      </Box>
      <Box flexDirection="column" height={bodyHeight} width="100%">
        {screenLines.map((line, index) => (
          <Text key={`${snapshot.outputVersion}-${index}`} wrap="truncate">
            {fitLine(line, bodyWidth) || " "}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
