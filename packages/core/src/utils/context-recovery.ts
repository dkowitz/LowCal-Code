/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from "@google/genai";
import { isFunctionResponse } from "./messageInspectors.js";

/**
 * Strategies for recovering from context overflow errors
 */

export interface CompressionOptions {
  /** Fraction of history to preserve (0.0 - 1.0) */
  preserveFraction: number;
  /** Whether to aggressively compress tool results */
  compressToolResults: boolean;
  /** Whether to drop intermediate assistant messages */
  dropIntermediateMessages: boolean;
}

/**
 * Summarizes a tool result to reduce its size
 */
function summarizeToolResult(content: Content): Content {
  if (!content.parts || content.parts.length === 0) {
    return content;
  }

  const summarizedParts = content.parts.map((part) => {
    if ("text" in part && part.text) {
      const text = part.text;

      // If already short, keep as-is
      if (text.length <= 500) {
        return part;
      }

      // Extract key information
      const lines = text.split("\n");
      const firstLine = lines[0] || "";

      // Check if it's a search result
      if (firstLine.match(/Found \d+ match/)) {
        const matchCount = firstLine.match(/Found (\d+) match/)?.[1] || "?";
        return {
          text: `[Tool Result Summary: Found ${matchCount} matches. Original result was ${text.length} chars. Use more specific queries if needed.]`,
        };
      }

      // Check if it's a file read result
      if (text.includes("--- ") && text.includes(" ---")) {
        const fileCount = (text.match(/^--- .+ ---$/gm) || []).length;
        return {
          text: `[Tool Result Summary: Read ${fileCount} file(s). Original result was ${text.length} chars. Use read_file for specific files if needed.]`,
        };
      }

      // Generic summarization - keep first and last parts
      const head = lines.slice(0, 5).join("\n");
      const tail = lines.slice(-5).join("\n");
      return {
        text: `[Tool Result Summary - Compressed]\n${head}\n...\n[${lines.length - 10} lines omitted]\n...\n${tail}\n[Original: ${text.length} chars]`,
      };
    }

    // Keep non-text parts as-is (function calls, etc.)
    return part;
  });

  return {
    ...content,
    parts: summarizedParts,
  };
}

/**
 * Aggressively compresses history by summarizing tool results
 */
export function compressToolResults(history: Content[]): Content[] {
  return history.map((content) => {
    // Compress function responses (tool results)
    if (isFunctionResponse(content)) {
      return summarizeToolResult(content);
    }
    return content;
  });
}

/**
 * Removes intermediate assistant messages, keeping only the last one in each turn
 */
export function dropIntermediateAssistantMessages(
  history: Content[],
): Content[] {
  const compressed: Content[] = [];
  let lastAssistantIndex = -1;

  for (let i = 0; i < history.length; i++) {
    const content = history[i];

    if (content.role === "model") {
      // If we already have an assistant message and this is another one,
      // check if there's a user message between them
      if (lastAssistantIndex !== -1) {
        const hasUserBetween = history
          .slice(lastAssistantIndex + 1, i)
          .some((c) => c.role === "user");

        if (!hasUserBetween) {
          // Replace the previous assistant message with this one
          compressed[lastAssistantIndex] = content;
          continue;
        }
      }

      lastAssistantIndex = compressed.length;
      compressed.push(content);
    } else {
      compressed.push(content);
    }
  }

  return compressed;
}

/**
 * Implements a sliding window to keep only recent history
 */
export function applySlidingWindow(
  history: Content[],
  preserveFraction: number,
): Content[] {
  if (preserveFraction >= 1.0) {
    return history;
  }

  const targetLength = Math.max(
    4, // Keep at least 2 turns (user + assistant)
    Math.floor(history.length * preserveFraction),
  );

  // Always keep the first message (system context) if it exists
  const hasSystemContext = history[0]?.role === "user";

  if (hasSystemContext && history.length > targetLength) {
    const systemMessage = history[0];
    const recentMessages = history.slice(-(targetLength - 1));
    return [systemMessage, ...recentMessages];
  }

  return history.slice(-targetLength);
}

/**
 * Multi-stage compression strategy
 */
export function applyAdaptiveCompression(
  history: Content[],
  options: CompressionOptions,
): Content[] {
  let compressed = [...history];

  // Stage 1: Compress tool results if requested
  if (options.compressToolResults) {
    compressed = compressToolResults(compressed);
  }

  // Stage 2: Drop intermediate messages if requested
  if (options.dropIntermediateMessages) {
    compressed = dropIntermediateAssistantMessages(compressed);
  }

  // Stage 3: Apply sliding window
  compressed = applySlidingWindow(compressed, options.preserveFraction);

  return compressed;
}

/**
 * Estimates the size reduction from compression
 */
export function estimateCompressionRatio(
  original: Content[],
  compressed: Content[],
): number {
  const originalSize = JSON.stringify(original).length;
  const compressedSize = JSON.stringify(compressed).length;

  if (originalSize === 0) return 1.0;

  return compressedSize / originalSize;
}

/**
 * Progressive compression strategies, from least to most aggressive
 */
export const COMPRESSION_STRATEGIES: CompressionOptions[] = [
  // Strategy 1: Just compress tool results
  {
    preserveFraction: 1.0,
    compressToolResults: true,
    dropIntermediateMessages: false,
  },
  // Strategy 2: Compress tool results + drop intermediate messages
  {
    preserveFraction: 1.0,
    compressToolResults: true,
    dropIntermediateMessages: true,
  },
  // Strategy 3: Above + keep 80% of history
  {
    preserveFraction: 0.8,
    compressToolResults: true,
    dropIntermediateMessages: true,
  },
  // Strategy 4: Above + keep 60% of history
  {
    preserveFraction: 0.6,
    compressToolResults: true,
    dropIntermediateMessages: true,
  },
  // Strategy 5: Above + keep 40% of history
  {
    preserveFraction: 0.4,
    compressToolResults: true,
    dropIntermediateMessages: true,
  },
  // Strategy 6: Most aggressive - keep only 20%
  {
    preserveFraction: 0.2,
    compressToolResults: true,
    dropIntermediateMessages: true,
  },
];
