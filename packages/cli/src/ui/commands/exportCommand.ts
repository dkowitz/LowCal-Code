/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SlashCommand } from "./types.js";
import { CommandKind } from "./types.js";

import fs from "node:fs";
import path from "node:path";

type ExportToolDisplay = {
  name: string;
  resultDisplay?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readText(item: unknown): string | undefined {
  const record = asRecord(item);
  const textValue = record?.["text"];
  return typeof textValue === "string" ? textValue : undefined;
}

function extractToolDisplays(item: unknown): ExportToolDisplay[] {
  const record = asRecord(item);
  if (!record) {
    return [];
  }

  const toolsValue = record["tools"];
  if (Array.isArray(toolsValue)) {
    const toolDisplays: ExportToolDisplay[] = [];
    for (const tool of toolsValue) {
      const toolRecord = asRecord(tool);
      if (!toolRecord) {
        continue;
      }

      const name = toolRecord["name"];
      if (typeof name !== "string") {
        continue;
      }

      toolDisplays.push({
        name,
        resultDisplay: toolRecord["resultDisplay"] ?? toolRecord["result"],
      });
    }
    return toolDisplays;
  }

  const name = record["name"];
  if (typeof name === "string") {
    return [
      {
        name,
        resultDisplay: record["resultDisplay"] ?? record["result"],
      },
    ];
  }

  return [];
}

export const exportCommand: SlashCommand = {
  name: "export",
  description:
    "save the current conversation to a markdown file in ./conversations. Options: [compact] (user/assistant only), [report] (first user + final assistant responses), [filename.md]",
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const history = context.ui.getHistory();
    if (history.length === 0) {
      context.ui.addItem(
        {
          type: "info",
          text: "No conversation history to export.",
        },
        Date.now(),
      );
      return;
    }

    // Parse args
    const argParts = (args || "").trim().split(/\s+/).filter(Boolean);
    let option: string | null = null;
    let providedFileName: string | null = null;

    if (argParts.length === 0) {
      option = null;
    } else if (["compact", "report"].includes(argParts[0].toLowerCase())) {
      option = argParts[0].toLowerCase();
      if (argParts.length > 1) {
        providedFileName = argParts.slice(1).join(" ");
      }
    } else {
      // If the first arg is not a recognized option, treat the entire args string as the filename.
      providedFileName = argParts.join(" ");
    }

    // Validate option
    if (option && !["compact", "report"].includes(option)) {
      context.ui.addItem(
        {
          type: "error",
          text: `Invalid option '${option}'. Use 'compact' or 'report'.`,
        },
        Date.now(),
      );
      return;
    }

    // Determine filename
    let fileName: string;
    if (providedFileName) {
      fileName = providedFileName.trim();
      // Sanitize filename
      fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!fileName.endsWith(".md")) {
        fileName += ".md";
      }
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const prefix = option || "conversation";
      fileName = `${prefix}-${timestamp}.md`;
    }

    // Determine output directory based on option
    const exportDir =
      option === "report"
        ? path.join(process.cwd(), "reports")
        : path.join(process.cwd(), "conversations");
    fs.mkdirSync(exportDir, { recursive: true });
    const fullPath = path.join(exportDir, fileName);

    // Format markdown content
    let markdownContent = `# Qwen Code Conversation Export\n\n`;
    const now = new Date();
    markdownContent += `**Exported:** ${now.toLocaleString()}\n`;
    markdownContent += `**Session ID:** ${context.services.config?.getSessionId() || "unknown"}\n`;
    markdownContent += `**Mode:** ${option || "full"}\n\n`;

    let filteredHistory: typeof history = [];

    if (option === "compact") {
      // Only user and assistant messages
      filteredHistory = history.filter(
        (item) =>
          (item.type === "user" ||
            item.type === "gemini" ||
            item.type === "gemini_content") &&
          item.text,
      );
    } else if (option === "report") {
      // Report: first non-slash user message + all assistant messages after the last user message
      const firstUser = history.find(
        (item) =>
          item.type === "user" &&
          typeof item.text === "string" &&
          !item.text.trim().startsWith("/"),
      );
      if (firstUser && firstUser.text) {
        filteredHistory.push(firstUser);
      }

      // Find the index of the last *non‑slash* user message in the conversation.
      // Slash commands (messages starting with '/') are not considered when determining
      // the trailing assistant responses for a report export. This ensures that the
      // final assistant reply before the command is captured.
      let lastUserIndex = -1;
      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        if (
          item.type === "user" &&
          typeof item.text === "string" &&
          !item.text.trim().startsWith("/")
        ) {
          lastUserIndex = i;
          break;
        }
      }

      // Add all assistant messages after the last user message
      const startIdx = lastUserIndex === -1 ? 0 : lastUserIndex + 1;
      const trailingAssistants = history
        .slice(startIdx)
        .filter(
          (item) =>
            (item.type === "gemini" || item.type === "gemini_content") &&
            item.text,
        );
      filteredHistory = filteredHistory.concat(trailingAssistants);
    } else {
      // Full history
      filteredHistory = [...history];
    }

    // Process filtered history
    for (const item of filteredHistory) {
      const itemType = String(item.type);
      const text = readText(item);
      switch (itemType) {
        case "user":
          if (text) {
            // Preserve original formatting of user messages
            markdownContent += `## User Message\n\n${text}\n\n---\n\n`;
          }
          break;
        case "gemini":
        case "gemini_content":
          if (text) {
            // Preserve original formatting of assistant responses
            markdownContent += `## Assistant Response\n\n${text}\n\n---\n\n`;
          }
          break;
        case "info":
          if (text) {
            markdownContent += `### Info\n\n> ${text.trim()}\n\n`;
          }
          break;
        case "error":
          if (text) {
            markdownContent += `### Error\n\n**Error:** ${text.trim()}\n\n`;
          }
          break;
        case "tool_group":
        case "tool":
        case "tool_call":
        case "tool_call_request":
        case "tool_stats":
          // Normalize to an array of tool displays
          markdownContent += `### Tool Execution\n\n`;
          const toolsArray = extractToolDisplays(item);
          for (const tool of toolsArray) {
            markdownContent += `**Tool:** ${tool.name}\n`;
            if (tool.resultDisplay) {
              markdownContent += `**Result:** ${typeof tool.resultDisplay === "string" ? tool.resultDisplay : JSON.stringify(tool.resultDisplay)}\n`;
            }
            markdownContent += `\n`;
          }

          markdownContent += `---\n\n`;
          break;
        default:
          if (text) {
            markdownContent += `### ${itemType.toUpperCase()}\n\n${text.trim()}\n\n---\n\n`;
          }
          break;
      }
    }

    try {
      fs.writeFileSync(fullPath, markdownContent, "utf8");
      const dirName = option === "report" ? "./reports" : "./conversations";
      context.ui.addItem(
        {
          type: "info",
          text: `✅ Conversation exported successfully to ${dirName}/\`${fileName}\``,
        },
        Date.now(),
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      context.ui.addItem(
        {
          type: "error",
          text: `❌ Failed to export conversation: ${errorMsg}`,
        },
        Date.now(),
      );
    }
  },
};
