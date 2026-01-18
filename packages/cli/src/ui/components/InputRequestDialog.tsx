/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from "react";
import { Box, Text } from "ink";
import { TextInput } from "./shared/TextInput.js";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { Command, keyMatchers } from "../keyMatchers.js";

export interface InputRequestDialogProps {
  prompt: React.ReactNode;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  inputWidth?: number;
}

export function InputRequestDialog({
  prompt,
  placeholder,
  onSubmit,
  onCancel,
  inputWidth = 80,
}: InputRequestDialogProps) {
  const [value, setValue] = useState("");

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  useKeypress(
    (key) => {
      if (keyMatchers[Command.ESCAPE](key)) {
        handleCancel();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column">
      {prompt}
      <Box marginTop={1}>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={() => onSubmit(value)}
          placeholder={placeholder}
          height={6}
          inputWidth={inputWidth}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Press Enter to continue, Esc to cancel.
        </Text>
      </Box>
    </Box>
  );
}
