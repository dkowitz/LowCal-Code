/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";
import { shortenPath, tildeifyPath } from "@qwen-code/qwen-code-core";
import { ConsoleSummaryDisplay } from "./ConsoleSummaryDisplay.js";
import process from "node:process";
import path from "node:path";
import Gradient from "ink-gradient";
import { ContextUsageDisplay } from "./ContextUsageDisplay.js";
import { DebugProfiler } from "./DebugProfiler.js";

import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { isNarrowWidth } from "../utils/isNarrowWidth.js";
import { loadCliToolConfig } from "../commands/utils/toolConfig.js";

interface FooterProps {
  model: string;
  /** Optional precomputed model context limit in tokens (preferred) */
  modelLimit?: number;
  targetDir: string;
  branchName?: string;
  debugMode: boolean;
  debugMessage: string;
  corgiMode: boolean;
  errorCount: number;
  showErrorDetails: boolean;
  showMemoryUsage?: boolean;
  promptTokenCount: number;
  nightly: boolean;
  vimMode?: string;
  isTrustedFolder?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  model,
  modelLimit,
  targetDir,
  branchName,
  debugMode,
  debugMessage,
  corgiMode,
  errorCount,
  showErrorDetails,
  showMemoryUsage, // eslint-disable-line @typescript-eslint/no-unused-vars
  promptTokenCount,
  nightly,
  vimMode,
  isTrustedFolder,
}) => {
  const { columns: terminalWidth } = useTerminalSize();

  const isNarrow = isNarrowWidth(terminalWidth);

  // Adjust path length based on terminal width
  const pathLength = Math.max(20, Math.floor(terminalWidth * 0.4));
  const displayPath = isNarrow
    ? path.basename(tildeifyPath(targetDir))
    : shortenPath(tildeifyPath(targetDir), pathLength);

  // Load tool config for status display
  let promptMode = "auto";
  let activeCollection = "full";
  let customPromptName: string | null = null;
  let customPromptExclusive = false;
  try {
    const cfg = loadCliToolConfig();
    promptMode = cfg.promptMode;
    activeCollection = cfg.activeCollection;
    if (cfg.activeCustomPrompt) {
      // Join multiple prompt names for display
      customPromptName = Array.isArray(cfg.activeCustomPrompt.name)
        ? cfg.activeCustomPrompt.name.join(", ")
        : cfg.activeCustomPrompt.name;
      customPromptExclusive = cfg.activeCustomPrompt.exclusive;
    }
  } catch {
    // Silently ignore errors - status display is not critical
  }

  return (
    <Box
      justifyContent="space-between"
      width="100%"
      flexDirection={isNarrow ? "column" : "row"}
      alignItems={isNarrow ? "flex-start" : "center"}
    >
      <Box>
        {debugMode && <DebugProfiler />}
        {vimMode && <Text color={theme.text.secondary}>[{vimMode}] </Text>}
        {nightly ? (
          <Gradient colors={theme.ui.gradient}>
            <Text>
              {displayPath}
              {branchName && <Text> ({branchName}*)</Text>}
            </Text>
          </Gradient>
        ) : (
          <Text color={theme.text.link}>
            {displayPath}
            {branchName && (
              <Text color={theme.text.secondary}> ({branchName}*)</Text>
            )}
          </Text>
        )}
        {debugMode && (
          <Text color={theme.status.error}>
            {" " + (debugMessage || "--debug")}
          </Text>
        )}
      </Box>

      {/* Middle Section: Centered Trust/Sandbox Info and Status */}
      <Box
        flexGrow={isNarrow ? 0 : 1}
        alignItems="center"
        justifyContent={isNarrow ? "flex-start" : "center"}
        display="flex"
        paddingX={isNarrow ? 0 : 1}
        paddingTop={isNarrow ? 1 : 0}
      >
        {isTrustedFolder === false ? (
          <Text color={theme.status.warning}>untrusted</Text>
        ) : process.env["SANDBOX"] &&
          process.env["SANDBOX"] !== "sandbox-exec" ? (
          <Text color="green">
            {process.env["SANDBOX"].replace(/^gemini-(?:cli-)?/, "")}
          </Text>
        ) : process.env["SANDBOX"] === "sandbox-exec" ? (
          <Text color={theme.status.warning}>
            macOS Seatbelt{" "}
            <Text color={theme.text.secondary}>
              ({process.env["SEATBELT_PROFILE"]})
            </Text>
          </Text>
        ) : (
          <Text color={theme.status.error}>
            no sandbox <Text color={theme.text.secondary}>(see /docs)</Text>
          </Text>
        )}
        
        {/* Status Indicator: Prompt Mode, Custom Prompt, and Toolset */}
        <Text color={theme.ui.symbol}> | </Text>
        <Text color={theme.text.secondary}>
          {promptMode}
        </Text>
        {customPromptName && (
          <>
            <Text color={theme.ui.symbol}> / </Text>
            <Text color={theme.status.warning}>
              {customPromptName}
              {customPromptExclusive ? "✕" : "✓"}
            </Text>
          </>
        )}
        <Text color={theme.ui.symbol}> / </Text>
        <Text color={theme.text.secondary}>
          {activeCollection}
        </Text>
      </Box>

      {/* Right Section: Gemini Label and Console Summary */}
      <Box alignItems="center" paddingTop={isNarrow ? 1 : 0}>
        <Text color={theme.text.accent}>
          {isNarrow ? "" : " "}
          {model}{" "}
          <ContextUsageDisplay
            promptTokenCount={promptTokenCount}
            model={model}
            modelLimit={modelLimit}
            // modelLimitVersion removed — kept only in App to avoid unused warnings
          />
          {/* Removed MB display to avoid confusion - tokens are authoritative */}
        </Text>
        {corgiMode && (
          <Text>
            <Text color={theme.ui.symbol}>| </Text>
            <Text color={theme.status.error}>▼</Text>
            <Text color={theme.text.primary}>(´</Text>
            <Text color={theme.status.error}>ᴥ</Text>
            <Text color={theme.text.primary}>`)</Text>
            <Text color={theme.status.error}>▼ </Text>
          </Text>
        )}
        {!showErrorDetails && errorCount > 0 && (
          <Box>
            <Text color={theme.ui.symbol}>| </Text>
            <ConsoleSummaryDisplay errorCount={errorCount} />
          </Box>
        )}
      </Box>
    </Box>
  );
};
