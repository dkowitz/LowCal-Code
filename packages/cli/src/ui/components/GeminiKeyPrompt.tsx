/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";

interface GeminiKeyPromptProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
  prepopulatedApiKey?: string;
}

export function GeminiKeyPrompt({
  onSubmit,
  onCancel,
  prepopulatedApiKey,
}: GeminiKeyPromptProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState(prepopulatedApiKey || "");

  useInput((input, key) => {
    let cleanInput = (input || "")
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\[200~/g, "")
      .replace(/\[201~/g, "")
      .replace(/^\[|~$/g, "");

    cleanInput = cleanInput
      .split("")
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join("");

    if (cleanInput.length > 0) {
      setApiKey((prev) => prev + cleanInput);
      return;
    }

    if (input.includes("\n") || input.includes("\r")) {
      if (apiKey.trim()) {
        onSubmit(apiKey.trim());
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.backspace || key.delete) {
      setApiKey((prev) => prev.slice(0, -1));
      return;
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        Google Gemini API Key
      </Text>
      <Box marginTop={1}>
        <Text>Enter your Gemini API key to continue.</Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text color={Colors.AccentBlue}>API Key:</Text>
        </Box>
        <Box flexGrow={1}>
          <Text>{"> "}{apiKey || " "}</Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>Press Enter to continue, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
