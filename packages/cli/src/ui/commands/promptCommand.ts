/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs";
import path from "node:path";
import type { SlashCommand } from "./types.js";
import { CommandKind } from "./types.js";
import { MessageType, type HistoryItemInfo } from "../types.js";
import {
  loadCliToolConfig,
  saveCliToolConfig,
  syncCoreToolConfig,
  estimateTokenCount,
  type CustomPromptMetadata,
} from "./utils/toolConfig.js";

const TOKEN_WARNING_THRESHOLD = 2000;

/**
 * Helper to read file content (supports .md files)
 */
function readPromptFile(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(resolvedPath, "utf8");
}

/**
 * Helper to validate prompt name
 */
function validatePromptName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: "Prompt name cannot be empty" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      error:
        "Prompt name must contain only alphanumeric characters, hyphens, and underscores",
    };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: "Prompt name must be 50 characters or less" };
  }
  return { valid: true };
}

/**
 * Helper to format prompt metadata for display
 */
function formatPromptInfo(
  name: string,
  metadata: CustomPromptMetadata,
  isActive: boolean,
): string {
  const activeMarker = isActive ? " ✓ (ACTIVE)" : "";
  const exclusiveMarker = metadata.exclusive
    ? " [EXCLUSIVE]"
    : " [SUPPLEMENTAL]";
  const createdDate = new Date(metadata.createdAt).toLocaleString();
  return `  • ${name}${activeMarker}${exclusiveMarker} | ${metadata.tokenCount} tokens | Created: ${createdDate}`;
}

export const promptCommand: SlashCommand = {
  name: "prompt",
  description: "Create, manage, and use custom system prompts",
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const cfg = loadCliToolConfig();
    const reply = (message: string) => {
      const infoItem: Omit<HistoryItemInfo, "id"> = {
        type: MessageType.INFO,
        text: message,
      };
      context.ui.addItem(infoItem, Date.now());
    };

    const rawArgs = args?.trim() ?? "";

    // No arguments – show usage
    if (!rawArgs) {
      reply(
        `Usage: /prompt <list|show|create|delete|activate|disable> [name] [content|file] [--exclusive]

Subcommands:
  list                    – List all custom prompts
  show <name>             – Display a prompt's content
  create <name> <content> – Create a new prompt (string or .md file path)
  delete <name>           – Delete a prompt
  activate <names>        – Enable one or more prompts (aliases: use, set)
  disable                 – Disable the active custom prompt(s)

Options:
  --exclusive             – Replace entire system prompt (default: supplement)

Activating Multiple Prompts:
  You can activate multiple prompts at once by providing a comma-separated list.
  The prompts will be applied in order, stacking their content.

  Examples:
    /prompt activate k2so,darth-vader
    /prompt activate prompt1,prompt2,prompt3 --exclusive

Examples:
  /prompt list
  /prompt create my-prompt "Be concise and technical"
  /prompt create reviewer ./code-review-prompt.md
  /prompt activate my-prompt
  /prompt activate k2so,darth-vader --exclusive
  /prompt show my-prompt
  /prompt delete my-prompt
  /prompt disable`,
      );
      return;
    }

    const tokens = rawArgs.split(/\s+/);
    const [verb, ...rest] = tokens;
    const verbLower = verb.toLowerCase();

    // LIST subcommand
    if (verbLower === "list") {
      const prompts = cfg.customPrompts ?? {};
      const promptNames = Object.keys(prompts);

      if (promptNames.length === 0) {
        reply(
          "No custom prompts defined. Use `/prompt create <name> <content>` to add one.",
        );
        return;
      }

      const activePromptName = cfg.activeCustomPrompt?.name
        ? Array.isArray(cfg.activeCustomPrompt.name)
          ? cfg.activeCustomPrompt.name.join(", ")
          : cfg.activeCustomPrompt.name
        : null;
      const lines = ["📋 Custom Prompts:"];
      for (const name of promptNames) {
        const metadata = prompts[name]!;
        const isActive = name === activePromptName;
        lines.push(formatPromptInfo(name, metadata, isActive));
      }

      if (activePromptName) {
        lines.push(
          `\n✓ Active: ${activePromptName} (${cfg.activeCustomPrompt?.exclusive ? "EXCLUSIVE" : "SUPPLEMENTAL"})`,
        );
      } else {
        lines.push("\n(No custom prompt currently active)");
      }

      reply(lines.join("\n"));
      return;
    }

    // SHOW subcommand
    if (verbLower === "show") {
      const name = rest[0];
      if (!name) {
        reply("Usage: /prompt show <name>");
        return;
      }

      const prompts = cfg.customPrompts ?? {};
      const metadata = prompts[name];
      if (!metadata) {
        reply(`Prompt "${name}" not found.`);
        return;
      }

      const lines = [
        `📄 Prompt: ${name}`,
        `Mode: ${metadata.exclusive ? "EXCLUSIVE (replaces base prompt)" : "SUPPLEMENTAL (appended to base prompt)"}`,
        `Tokens: ${metadata.tokenCount}`,
        `Created: ${new Date(metadata.createdAt).toLocaleString()}`,
        `\n--- Content ---\n${metadata.content}\n--- End ---`,
      ];

      reply(lines.join("\n"));
      return;
    }

    // CREATE subcommand
    if (verbLower === "create") {
      const name = rest[0];
      const contentOrFile = rest.slice(1).join(" ");
      const hasExclusiveFlag = contentOrFile.includes("--exclusive");
      const contentArg = contentOrFile.replace(/\s*--exclusive\s*/, "").trim();

      if (!name || !contentArg) {
        reply("Usage: /prompt create <name> <content|file> [--exclusive]");
        return;
      }

      const nameValidation = validatePromptName(name);
      if (!nameValidation.valid) {
        reply(`Invalid prompt name: ${nameValidation.error}`);
        return;
      }

      const prompts = cfg.customPrompts ?? {};
      if (prompts[name]) {
        reply(
          `Prompt "${name}" already exists. Use /prompt delete ${name} first.`,
        );
        return;
      }

      let content: string;
      // Check if contentArg looks like a file path
      if (
        contentArg.endsWith(".md") ||
        contentArg.includes("/") ||
        contentArg.includes("\\")
      ) {
        try {
          content = readPromptFile(contentArg);
        } catch (error) {
          reply(
            `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
      } else {
        // Treat as inline string; remove surrounding quotes if present
        content = contentArg.replace(/^["']|["']$/g, "");
      }

      if (!content.trim()) {
        reply("Prompt content cannot be empty.");
        return;
      }

      const tokenCount = estimateTokenCount(content);
      if (tokenCount > TOKEN_WARNING_THRESHOLD) {
        reply(
          `⚠️  Warning: Prompt is large (${tokenCount} tokens, threshold: ${TOKEN_WARNING_THRESHOLD}). This may impact performance.`,
        );
      }

      const metadata: CustomPromptMetadata = {
        content,
        exclusive: hasExclusiveFlag,
        createdAt: Date.now(),
        tokenCount,
      };

      cfg.customPrompts = { ...prompts, [name]: metadata };
      saveCliToolConfig(cfg);

      reply(
        `✓ Prompt "${name}" created (${tokenCount} tokens, ${metadata.exclusive ? "EXCLUSIVE" : "SUPPLEMENTAL"})`,
      );
      return;
    }

    // DELETE subcommand
    if (verbLower === "delete") {
      const name = rest[0];
      if (!name) {
        reply("Usage: /prompt delete <name>");
        return;
      }

      const prompts = cfg.customPrompts ?? {};
      if (!prompts[name]) {
        reply(`Prompt "${name}" not found.`);
        return;
      }

      // If deleting the active prompt, disable it
      // If the prompt being deleted is active, remove it from the stack
      if (
        cfg.activeCustomPrompt &&
        cfg.activeCustomPrompt.name.includes(name)
      ) {
        const filtered = cfg.activeCustomPrompt.name.filter((n) => n !== name);
        if (filtered.length === 0) {
          cfg.activeCustomPrompt = null;
        } else {
          cfg.activeCustomPrompt = {
            ...cfg.activeCustomPrompt,
            name: filtered,
          };
        }
      }

      delete prompts[name];
      cfg.customPrompts = prompts;
      saveCliToolConfig(cfg);

      reply(`✓ Prompt "${name}" deleted.`);
      return;
    }

    // ACTIVATE / USE / SET subcommands
    if (["activate", "use", "set"].includes(verbLower)) {
      // Support single name, comma-separated list (e.g., prompt1,prompt2),
      // or bracketed syntax (e.g., [prompt1, prompt2])
      const hasExclusiveFlag = rest.includes("--exclusive");

      // Remove the exclusive flag from arguments for parsing names
      const argsWithoutFlags = rest.filter((a) => a !== "--exclusive");
      if (argsWithoutFlags.length === 0) {
        reply(
          `Usage: /prompt ${verbLower} <name|name1,name2,...> [--exclusive]`,
        );
        return;
      }

      // Reconstruct possible spaced list syntax into a single string
      let rawNameArg = argsWithoutFlags[0];
      if (rawNameArg.startsWith("[") && !rawNameArg.endsWith("]")) {
        // Combine subsequent tokens until we find the closing bracket
        let combined = rawNameArg;
        for (let i = 1; i < argsWithoutFlags.length; i++) {
          combined += " " + argsWithoutFlags[i];
          if (combined.endsWith("]")) break;
        }
        rawNameArg = combined;
      }

      // Parse names into an array
      let names: string[];
      if (rawNameArg.startsWith("[") && rawNameArg.endsWith("]")) {
        const inner = rawNameArg.slice(1, -1);
        names = inner
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (rawNameArg.includes(",")) {
        // Handle comma-separated list without brackets: prompt1,prompt2,prompt3
        names = rawNameArg
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        names = [rawNameArg];
      }
      const prompts = cfg.customPrompts ?? {};
      for (const n of names) {
        if (!prompts[n]) {
          reply(`Prompt "${n}" not found.`);
          return;
        }
      }

      // Use the --exclusive flag if provided, otherwise default to first prompt's setting
      const exclusive = hasExclusiveFlag
        ? true
        : (prompts[names[0]]?.exclusive ?? false);

      cfg.activeCustomPrompt = { name: names, exclusive };
      saveCliToolConfig(cfg);
      syncCoreToolConfig(cfg);

      // Reinitialize the Gemini client to pick up the new prompt(s)
      const geminiConfig = context.services.config;
      const geminiClient = geminiConfig?.getGeminiClient?.();
      try {
        if (geminiClient && typeof geminiClient.reinitialize === "function") {
          await geminiClient.reinitialize();
        }
      } catch (error) {
        console.warn(
          "[prompt] Failed to reinitialize chat after prompt change",
          error,
        );
      }

      reply(
        `✓ Prompt(s) "${names.join(", ")}" activated (${exclusive ? "EXCLUSIVE" : "SUPPLEMENTAL"} mode)`,
      );
      return;
    }

    // DISABLE subcommand
    if (verbLower === "disable") {
      if (!cfg.activeCustomPrompt) {
        reply("No custom prompt is currently active.");
        return;
      }

      const wasActive = Array.isArray(cfg.activeCustomPrompt?.name)
        ? cfg.activeCustomPrompt.name.join(", ")
        : cfg.activeCustomPrompt?.name;
      cfg.activeCustomPrompt = null;
      saveCliToolConfig(cfg);
      syncCoreToolConfig(cfg);

      // Reinitialize the Gemini client to pick up the base prompt
      const geminiConfig = context.services.config;
      const geminiClient = geminiConfig?.getGeminiClient?.();
      try {
        if (geminiClient && typeof geminiClient.reinitialize === "function") {
          await geminiClient.reinitialize();
        }
      } catch (error) {
        console.warn(
          "[prompt] Failed to reinitialize chat after disabling prompt",
          error,
        );
      }

      reply(
        `✓ Custom prompt "${wasActive}" disabled. Returning to base prompt.`,
      );
      return;
    }

    reply(
      `Unknown subcommand: "${verb}". Use /prompt (no args) for usage information.`,
    );
  },
};
