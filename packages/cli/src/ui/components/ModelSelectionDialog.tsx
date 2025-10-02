/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import type { AvailableModel } from '../models/availableModels.js';
import { TextInput } from './shared/TextInput.js';

export interface ModelSelectionDialogProps {
  availableModels: AvailableModel[];
  currentModel: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export const ModelSelectionDialog: React.FC<ModelSelectionDialogProps> = ({
  availableModels,
  currentModel,
  onSelect,
  onCancel,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: true },
  );

  const filteredModels = availableModels.filter(
    (model) =>
      model.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const options: Array<RadioSelectItem<string>> = filteredModels.map(
    (model) => {
      const visionIndicator = model.isVision ? ' [Vision]' : '';
      const currentIndicator = model.id === currentModel ? ' (current)' : '';
      return {
        label: `${model.label}${visionIndicator}${currentIndicator}`,
        value: model.id,
      };
    },
  );

  const initialIndex = Math.max(
    0,
    filteredModels.findIndex((model) => model.id === currentModel),
  );

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
  };

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
        <Text bold>Select Model</Text>
        <Text>Choose a model for this session:</Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search models..."
        />
      </Box>

      <Box marginBottom={1}>
        <RadioButtonSelect
          items={options}
          initialIndex={initialIndex}
          onSelect={handleSelect}
          isFocused
        />
      </Box>

      <Box>
        <Text color={Colors.Gray}>Press Enter to select, Esc to cancel</Text>
      </Box>
    </Box>
  );
};
