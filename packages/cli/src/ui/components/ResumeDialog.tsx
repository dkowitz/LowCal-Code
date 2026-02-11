/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";

export interface ResumeCheckpointOption {
  id: string;
  createdAt: Date;
  messageCount: number;
  sessionId: string;
  lastMessagePreview?: string;
}

interface ResumeDialogProps {
  checkpoints: ResumeCheckpointOption[];
  onSelect: (checkpointId: string) => void;
  onClose: () => void;
}

// Color codes for different session IDs - consistent with resumeCommand.ts
const getSessionColor = (sessionId: string): string => {
  // Use the first few characters of the session ID to generate a consistent color
  const hash = sessionId.substring(0, 8);
  const num = parseInt(hash, 16) || 0;
  // Map to Ink colors that work well with themes
  const colors = [
    Colors.AccentBlue,
    Colors.AccentPurple,
    Colors.AccentCyan,
    Colors.AccentGreen,
    Colors.AccentYellow,
    Colors.AccentRed,
    Colors.LightBlue,
  ];
  return colors[num % colors.length];
};

function formatCheckpointLabel(checkpoint: ResumeCheckpointOption): React.ReactNode {
  const isoString = checkpoint.createdAt.toISOString();
  const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  const formattedDate = match ? `${match[1]} ${match[2]}` : "Invalid Date";
  const shortSessionId = checkpoint.sessionId.slice(0, 8);
  const sessionColor = getSessionColor(checkpoint.sessionId);
  const preview = checkpoint.lastMessagePreview
    ? ` - ${checkpoint.lastMessagePreview}`
    : "";

  return (
    <Text>
      <Text color={Colors.Gray}>[{checkpoint.messageCount} messages]</Text>{" "}
      <Text color={sessionColor}>{shortSessionId}</Text> {formattedDate}{preview}
    </Text>
  );
}

export const ResumeDialog: React.FC<ResumeDialogProps> = ({
  checkpoints,
  onSelect,
  onClose,
}) => {
  useKeypress(
    (key) => {
      if (key.name === "escape") {
        onClose();
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<string>> = checkpoints.map(
    (checkpoint) => ({
      label: formatCheckpointLabel(checkpoint),
      value: checkpoint.id,
    }),
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      padding={1}
      width="100%"
      marginLeft={1}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Resume Conversation</Text>
        <Text>Select a checkpoint to restore:</Text>
      </Box>

      {options.length === 0 ? (
        <Text color={Colors.Gray}>
          No saved conversation checkpoints found.
        </Text>
      ) : (
        <Box marginBottom={1}>
          <RadioButtonSelect
            items={options}
            initialIndex={0}
            onSelect={onSelect}
            isFocused
            showScrollArrows
            maxItemsToShow={12}
          />
        </Box>
      )}

      <Box>
        <Text color={Colors.Gray}>Press Enter to select, Esc to cancel</Text>
      </Box>
    </Box>
  );
};
