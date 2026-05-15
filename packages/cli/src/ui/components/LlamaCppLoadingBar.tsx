/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";

interface LlamaCppLoadingBarProps {
  phase: string;
  elapsedMs: number;
  message?: string;
}

/** Animated progress bar for llama.cpp model loading with self-updating timer. */
export const LlamaCppLoadingBar: React.FC<LlamaCppLoadingBarProps> = ({
  phase,
  elapsedMs: callbackElapsedMs,
  message,
}) => {
  // Local timer that updates every 200ms between callbacks for smooth animation
  const [localElapsed, setLocalElapsed] = useState(callbackElapsedMs);

  useEffect(() => {
    // Reset local timer when callback gives new value
    setLocalElapsed(callbackElapsedMs);
  }, [callbackElapsedMs]);

  useEffect(() => {
    // If server is already healthy, don't animate
    if (phase === "healthy") return;

    const timer = setInterval(() => {
      setLocalElapsed((prev) => prev + 200);
    }, 200);

    return () => clearInterval(timer);
  }, [phase]);

  // Indeterminate progress — pulsing bar
  const barWidth = 30;
  const filled = Math.min(barWidth, Math.floor((localElapsed % 10000) / 10000 * barWidth) + 1);
  const empty = barWidth - filled;

  const phaseLabel =
    phase === "spawning"
      ? "Starting server"
      : phase === "healthy"
        ? "Model ready"
        : "Loading model";

  const elapsedSec = (localElapsed / 1000).toFixed(1);

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box>
        <Text color={theme.text.secondary}>⏳ </Text>
        <Text color={theme.text.accent}>{phaseLabel}...</Text>
        <Text color={theme.text.secondary}> ({elapsedSec}s)</Text>
      </Box>
      <Box>
        <Text color={theme.ui.symbol}>[</Text>
        <Text color={theme.status.success}>{"█".repeat(filled)}</Text>
        <Text color={theme.text.secondary}>{"░".repeat(empty)}</Text>
        <Text color={theme.ui.symbol}>]</Text>
      </Box>
      {message && message !== "Loading model..." && (
        <Box marginTop={0}>
          <Text color={theme.text.secondary} wrap="truncate-end">
            {message.length > 80 ? message.slice(0, 80) + "…" : message}
          </Text>
        </Box>
      )}
    </Box>
  );
};
