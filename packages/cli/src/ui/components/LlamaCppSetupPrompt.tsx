/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import {
  LLAMA_CPP_BACKENDS,
  normalizeLlamaCppBackend,
  type LlamaCppBackend,
} from "@qwen-code/qwen-code-core";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";

interface LlamaCppSetupPromptProps {
  prepopulatedModelsDir: string;
  prepopulatedPort: string;
  prepopulatedBackend?: string;
  prepopulatedBinaryPath?: string;
  onSubmit: (
    modelsDir: string,
    port: string,
    backend: LlamaCppBackend,
    binaryPath: string,
  ) => void;
  onCancel: () => void;
}

const BACKEND_LABELS: Record<LlamaCppBackend, string> = {
  auto: "Auto",
  vulkan: "Vulkan",
  rocm: "ROCm",
  cpu: "CPU",
  custom: "Custom binary",
};

type Field = "modelsDir" | "port" | "backend" | "binaryPath";
const FIELDS: Field[] = ["modelsDir", "port", "backend", "binaryPath"];

function nextField(field: Field): Field {
  const index = FIELDS.indexOf(field);
  return FIELDS[(index + 1) % FIELDS.length];
}

function previousField(field: Field): Field {
  const index = FIELDS.indexOf(field);
  return FIELDS[(index + FIELDS.length - 1) % FIELDS.length];
}

export function LlamaCppSetupPrompt({
  prepopulatedModelsDir,
  prepopulatedPort,
  prepopulatedBackend,
  prepopulatedBinaryPath,
  onSubmit,
  onCancel,
}: LlamaCppSetupPromptProps): React.JSX.Element {
  const [modelsDir, setModelsDir] = useState(prepopulatedModelsDir || "");
  const [port, setPort] = useState(prepopulatedPort || "8080");
  const [backend, setBackend] = useState<LlamaCppBackend>(
    normalizeLlamaCppBackend(
      prepopulatedBackend || process.env["LLAMA_CPP_BACKEND"],
    ),
  );
  const [binaryPath, setBinaryPath] = useState(
    prepopulatedBinaryPath || process.env["LLAMA_CPP_BINARY"] || "",
  );
  const [currentField, setCurrentField] = useState<Field>(
    !prepopulatedModelsDir ? "modelsDir" : "port",
  );

  const cycleBackend = (direction: 1 | -1) => {
    setBackend((current) => {
      const index = LLAMA_CPP_BACKENDS.indexOf(current);
      const nextIndex =
        (index + direction + LLAMA_CPP_BACKENDS.length) %
        LLAMA_CPP_BACKENDS.length;
      return LLAMA_CPP_BACKENDS[nextIndex];
    });
  };

  useInput((input, key) => {
    let cleanInput = (input || "")
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\[200~/g, "")
      .replace(/\[201~/g, "")
      .replace(/^\[|~$/g, "");

    cleanInput = cleanInput
      .split("")
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join("");

    if (cleanInput.length > 0) {
      if (currentField === "modelsDir") {
        setModelsDir((p) => p + cleanInput);
      } else if (currentField === "port") {
        setPort((p) => p + cleanInput);
      } else if (currentField === "binaryPath") {
        setBinaryPath((p) => p + cleanInput);
      }
      return;
    }

    if (input.includes("\n") || input.includes("\r")) {
      if (currentField === "binaryPath") {
        onSubmit(modelsDir.trim(), port.trim(), backend, binaryPath.trim());
      } else {
        setCurrentField(nextField(currentField));
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.tab || key.upArrow || key.downArrow) {
      setCurrentField((c) => (key.upArrow ? previousField(c) : nextField(c)));
      return;
    }

    if (currentField === "backend" && (key.leftArrow || key.rightArrow)) {
      cycleBackend(key.leftArrow ? -1 : 1);
      return;
    }

    if (key.backspace || key.delete) {
      if (currentField === "modelsDir") {
        setModelsDir((p) => p.slice(0, -1));
      } else if (currentField === "port") {
        setPort((p) => p.slice(0, -1));
      } else if (currentField === "binaryPath") {
        setBinaryPath((p) => p.slice(0, -1));
      }
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
          Configure your GGUF models directory, server port, and llama.cpp
          backend.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Box width={17}>
          <Text
            color={
              currentField === "modelsDir" ? Colors.AccentBlue : Colors.Gray
            }
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
        <Box width={17}>
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

      <Box marginTop={1} flexDirection="row">
        <Box width={17}>
          <Text
            color={currentField === "backend" ? Colors.AccentBlue : Colors.Gray}
          >
            Backend:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === "backend" ? "> " : "  "}
            {BACKEND_LABELS[backend]} ({backend})
          </Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Box width={17}>
          <Text
            color={
              currentField === "binaryPath" ? Colors.AccentBlue : Colors.Gray
            }
          >
            Custom Binary:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === "binaryPath" ? "> " : "  "}
            {binaryPath || " bundled backend binary"}
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          ROCm uses upstream ubuntu-rocm-7.2 x64 builds. Custom sets
          LLAMA_CPP_BINARY.
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Enter to continue, Tab/↑↓ to navigate, ←→ to change backend, Esc to
          cancel
        </Text>
      </Box>
    </Box>
  );
}

export default LlamaCppSetupPrompt;
