/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";

interface LlamaCppInferenceProgress {
  phase: "processing" | "generating";
  value: number;
  total?: number;
  tokensPerSec?: number;
  message?: string;
}

interface LlamaCppInferenceIndicatorProps {
  progress: LlamaCppInferenceProgress;
}

/**
 * Visual indicator for llama.cpp inference progress, mirroring LM Studio's
 * "Processing xx%" (context encoding) and "Generating xx tok" (token generation)
 * displays.
 *
 * Shows a filled progress bar for the processing phase and a token counter
 * for the generating phase.
 */
export const LlamaCppInferenceIndicator: React.FC<
  LlamaCppInferenceIndicatorProps
> = ({ progress }) => {
  const { phase, value, total, tokensPerSec, message } = progress;

  // Spinner that advances over time regardless of token count changes
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  // Smooth tokens: interpolate using tokensPerSec between updates (hooks stay at top level)
  const lastValueRef = useRef(value);
  const lastTsRef = useRef<number>(Date.now());
  const displayedValueRef = useRef(value);

  useEffect(() => {
    const id = setInterval(() => setSpinnerIndex((i) => (i + 1) % spinnerFrames.length), 70);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const now = Date.now();
    displayedValueRef.current = value;
    lastValueRef.current = value;
    lastTsRef.current = now;
  }, [value]);

  if (phase === "processing") {
    // Determinate progress bar — shows context encoding percentage
    const pct = Math.min(100, Math.max(0, value));
    const barWidth = 30;
    const filled = Math.round((pct / 100) * barWidth);
    const empty = barWidth - filled;

    return (
      <Box flexDirection="column" alignItems="center" paddingY={0}>
        <Box>
          <Text color={theme.text.secondary}>⚙ </Text>
          <Text color={theme.text.accent}>Processing {pct}%</Text>
          {total && (
            <Text color={theme.text.secondary}> ({Math.round((pct / 100) * total)}/{total} tokens)</Text>
          )}
        </Box>
        <Box>
          <Text color={theme.ui.symbol}>[</Text>
          <Text color={theme.status.success}>{"█".repeat(filled)}</Text>
          <Text color={theme.text.secondary}>{"░".repeat(empty)}</Text>
          <Text color={theme.ui.symbol}>]</Text>
        </Box>
        {message && (
          <Box marginTop={0}>
            <Text color={theme.text.secondary} wrap="truncate-end">
              {message.length > 80 ? message.slice(0, 80) + "…" : message}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Generating phase — show cumulative tokens (with smoothing) and a live spinner
  const spinner = spinnerFrames[spinnerIndex];

  let smoothedValue = displayedValueRef.current;
  if (tokensPerSec !== undefined) {
    const now = Date.now();
    const dtSec = Math.max(0, (now - lastTsRef.current) / 1000);
    smoothedValue = Math.max(value, Math.floor(lastValueRef.current + tokensPerSec * dtSec));
  }

  return (
    <Box flexDirection="column" alignItems="center" paddingY={0}>
      <Box>
        <Text color={theme.text.secondary}>📤 </Text>
        <Text color={theme.status.success}>Generating {smoothedValue} tok</Text>
        {total && (
          <Text color={theme.text.secondary}> / {total}</Text>
        )}
        {tokensPerSec !== undefined && (
          <Text color={theme.text.secondary}> ({tokensPerSec.toFixed(1)} tok/s)</Text>
        )}
      </Box>
      <Box>
        <Text color={theme.status.success}>{spinner}</Text>
      </Box>
      {message && (
        <Box marginTop={0}>
          <Text color={theme.text.secondary} wrap="truncate-end">
            {message.length > 80 ? message.slice(0, 80) + "…" : message}
          </Text>
        </Box>
      )}
    </Box>
  );
};