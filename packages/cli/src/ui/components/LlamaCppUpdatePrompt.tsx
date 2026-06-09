/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";

export type UpdateAction = "update" | "later" | "release" | "dismiss";

interface LlamaCppUpdatePromptProps {
  latestTag: string;
  currentTag?: string;
  backend?: string;
  assetName?: string;
  releaseUrl: string;
  onAction: (action: UpdateAction) => void;
}

/**
 * Interactive prompt shown when a llama.cpp update is available.
 * Lets the user choose: Update Now, Remind Later, or Don't Ask Again.
 */
export function LlamaCppUpdatePrompt({
  latestTag,
  currentTag,
  backend,
  assetName,
  releaseUrl,
  onAction,
}: LlamaCppUpdatePromptProps): React.JSX.Element {
  const options: UpdateAction[] = ["update", "release", "later", "dismiss"];
  const [selected, setSelected] = useState(options.indexOf("later"));

  useInput((input, key) => {
    if (key.upArrow || key.leftArrow) {
      setSelected((s) => (s > 0 ? s - 1 : s));
      return true;
    }
    if (key.downArrow || key.rightArrow) {
      setSelected((s) => (s < options.length - 1 ? s + 1 : s));
      return true;
    }
    if (input.includes("\n") || input.includes("\r")) {
      onAction(options[selected]);
      return true;
    }
    if (key.escape) {
      onAction("later");
      return true;
    }
    // Number shortcuts: 1=update, 2=release notes, 3=later, 4=dismiss
    if (input === "1") {
      onAction("update");
      return true;
    }
    if (input === "2") {
      onAction("release");
      return true;
    }
    if (input === "3") {
      onAction("later");
      return true;
    }
    if (input === "4") {
      onAction("dismiss");
      return true;
    }
    return false;
  });

  const optionLabels = [
    { key: "1", label: "Update Now", color: Colors.AccentGreen },
    { key: "2", label: "View Release Notes", color: Colors.AccentBlue },
    { key: "3", label: "Remind Later", color: Colors.Gray },
    { key: "4", label: "Don't Ask Again", color: Colors.Gray },
  ];

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentYellow}
      flexDirection="column"
      paddingX={1}
      paddingY={1}
      width="100%"
    >
      <Text bold color={Colors.AccentYellow}>
        🔄 llama.cpp Update Available
      </Text>
      <Box marginTop={1}>
        <Text color={Colors.Foreground}>
          A new version of llama.cpp is available:{" "}
          <Text bold color={Colors.AccentBlue}>
            {latestTag}
          </Text>
        </Text>
      </Box>
      {(backend || currentTag || assetName) && (
        <Box marginTop={0.5}>
          <Text color={Colors.Gray}>
            {backend ? `Backend: ${backend}` : ""}
            {currentTag ? `  Current: ${currentTag}` : ""}
            {assetName ? `  Asset: ${assetName}` : ""}
          </Text>
        </Box>
      )}
      <Box marginTop={0.5}>
        <Text color={Colors.Gray} wrap="truncate-end">
          View release notes: {releaseUrl}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {optionLabels.map((opt, i) => (
          <Box
            key={i}
            flexDirection="row"
            marginBottom={i < optionLabels.length - 1 ? 0.5 : 0}
          >
            <Text color={selected === i ? opt.color : Colors.Gray}>
              {selected === i ? "▸ " : "  "}[{opt.key}] {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={0.5}>
        <Text color={Colors.Gray}>
          ↑↓ select · Enter confirm · Esc skip · 2 = release notes
        </Text>
      </Box>
    </Box>
  );
}

export default LlamaCppUpdatePrompt;
