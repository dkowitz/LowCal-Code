/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from "./shared/RadioButtonSelect.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { TextInput } from "./shared/TextInput.js";

export interface ResumeCheckpointOption {
  id: string;
  createdAt: Date;
  messageCount: number;
  sessionId: string;
  lastMessagePreview?: string;
  fullContent: string; // Full conversation content for search
  searchContext?: string; // Context snippet with highlighted search term
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

/**
 * Extract a context snippet around the first occurrence of the search term.
 * Returns a string with the search term surrounded by context.
 */
function extractSearchContext(
  fullContent: string,
  searchTerm: string,
  contextSize: number = 25,
): string {
  const searchLower = searchTerm.toLowerCase();
  const contentLower = fullContent.toLowerCase();
  const index = contentLower.indexOf(searchLower);

  if (index === -1) return "";

  const start = Math.max(0, index - contextSize);
  const end = Math.min(fullContent.length, index + searchTerm.length + contextSize);

  let snippet = fullContent.substring(start, end);

  // Add ellipsis if truncated
  if (start > 0) snippet = "…" + snippet;
  if (end < fullContent.length) snippet = snippet + "…";

  return snippet;
}

/**
 * Format a text string with the search term highlighted.
 * Returns React nodes with the matched term in bold/highlighted color.
 */
function formatWithHighlight(
  text: string,
  searchTerm: string,
): React.ReactNode[] {
  if (!searchTerm.trim()) return [text];

  const searchLower = searchTerm.toLowerCase();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(searchLower);

  if (index === -1) return [text];

  const before = text.substring(0, index);
  const match = text.substring(index, index + searchTerm.length);
  const after = text.substring(index + searchTerm.length);

  return [
    <Text key="before">{before}</Text>,
    <Text key="match" bold color={Colors.AccentCyan}>
      {match}
    </Text>,
    <Text key="after">{after}</Text>,
  ];
}

function formatCheckpointLabel(
  checkpoint: ResumeCheckpointOption,
  searchTerm?: string,
): React.ReactNode {
  const isoString = checkpoint.createdAt.toISOString();
  const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  const formattedDate = match ? `${match[1]} ${match[2]}` : "Invalid Date";
  const shortSessionId = checkpoint.sessionId.slice(0, 8);
  const sessionColor = getSessionColor(checkpoint.sessionId);

  // Build the preview part
  let previewNode: React.ReactNode = "";
  
  if (searchTerm && checkpoint.searchContext) {
    // Show search context with highlighting
    previewNode = formatWithHighlight(
      ` - ${checkpoint.searchContext}`,
      searchTerm,
    );
  } else if (checkpoint.lastMessagePreview) {
    // Show regular last message preview
    previewNode = ` - ${checkpoint.lastMessagePreview}`;
  }

  return (
    <Text>
      <Text color={Colors.Gray}>[{checkpoint.messageCount} messages]</Text>{" "}
      <Text color={sessionColor}>{shortSessionId}</Text> {formattedDate}
      {previewNode}
    </Text>
  );
}

export const ResumeDialog: React.FC<ResumeDialogProps> = ({
  checkpoints,
  onSelect,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  useKeypress(
    (key) => {
      if (key.name === "escape") {
        onClose();
      }
    },
    { isActive: true },
  );

  // Filter checkpoints based on search term
  const filteredCheckpoints = checkpoints.filter((checkpoint) => {
    if (!searchTerm.trim()) return true;
    const searchLower = searchTerm.toLowerCase();
    return checkpoint.fullContent.toLowerCase().includes(searchLower);
  }).map((checkpoint) => {
    // Add search context if there's a search term
    if (searchTerm.trim()) {
      return {
        ...checkpoint,
        searchContext: extractSearchContext(checkpoint.fullContent, searchTerm),
      };
    }
    return checkpoint;
  });

  const options: Array<RadioSelectItem<string>> = filteredCheckpoints.map(
    (checkpoint) => ({
      label: formatCheckpointLabel(checkpoint, searchTerm),
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

      {/* Search input */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.Gray}>Search conversations:</Text>
        <TextInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Type to search across all conversations..."
          onSubmit={() => {}}
          inputWidth={60}
        />
        {searchTerm && (
          <Box marginTop={1}>
            <Text color={Colors.Gray}>
              Found {filteredCheckpoints.length} of {checkpoints.length} checkpoint
              {filteredCheckpoints.length !== 1 ? "s" : ""}
            </Text>
          </Box>
        )}
      </Box>

      {options.length === 0 ? (
        <Text color={Colors.Gray}>
          {searchTerm
            ? `No conversations match "${searchTerm}".`
            : "No saved conversation checkpoints found."}
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
