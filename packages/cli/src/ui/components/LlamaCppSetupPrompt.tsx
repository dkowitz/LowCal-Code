/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";

interface LlamaCppSetupPromptProps {
  prepopulatedModelsDir: string;
  prepopulatedPort: string;
  onSubmit: (modelsDir: string, port: string) => void;
  onCancel: () => void;
}

export function LlamaCppSetupPrompt({
  prepopulatedModelsDir,
  prepopulatedPort,
  onSubmit,
  onCancel,
}: LlamaCppSetupPromptProps): React.JSX.Element {
  const [modelsDir, setModelsDir] = useState(prepopulatedModelsDir || "");
  const [port, setPort] = useState(prepopulatedPort || "8080");
  const [currentField, setCurrentField] = useState<"modelsDir" | "port">(
    !prepopulatedModelsDir ? "modelsDir" : "port",
  );

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
      if (currentField === "modelsDir") setModelsDir((p) => p + cleanInput);
      else setPort((p) => p + cleanInput);
      return;
    }

    if (input.includes("\n") || input.includes("\r")) {
      if (currentField === "modelsDir") setCurrentField("port");
      else onSubmit(modelsDir.trim(), port.trim());
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.tab || key.upArrow || key.downArrow) {
      setCurrentField((c) => (c === "modelsDir" ? "port" : "modelsDir"));
      return;
    }

    if (key.backspace || key.delete) {
      if (currentField === "modelsDir") setModelsDir((p) => p.slice(0, -1));
      else setPort((p) => p.slice(0, -1));
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
        llama.cpp Setup
      </Text>
      <Box marginTop={1}>
        <Text>
          Configure the path to your GGUF models directory and the server port.
          {"\n"}
          The llama-server binary will be searched for on PATH, or you can set{" "}
          {Colors.AccentBlue}LLAMA_CPP_BINARY{""} env var.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Box width={14}>
          <Text
            color={currentField === "modelsDir" ? Colors.AccentBlue : Colors.Gray}
          >
            Models Directory:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === "modelsDir" ? "> " : "  "}
            {modelsDir || " /path/to/your/gguf/models"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Box width={14}>
          <Text
            color={currentField === "port" ? Colors.AccentBlue : Colors.Gray}
          >
            Server Port:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === "port" ? "> " : "  "}
            {port || "8080"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Press Enter to continue, Tab/↑↓ to navigate, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}

export default LlamaCppSetupPrompt;
