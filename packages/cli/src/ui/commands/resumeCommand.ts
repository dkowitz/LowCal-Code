/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CommandContext,
  SlashCommand,
  MessageActionReturn,
} from "./types.js";
import { CommandKind } from "./types.js";
import { CheckpointService } from "@qwen-code/qwen-code-core";
import { startSessionRegistration } from "../../session/sessionManager.js";
import type { HistoryItemWithoutId } from "../types.js";
import { MessageType } from "../types.js";

interface ResumeDetail {
  id: string;
  createdAt: Date;
  messageCount: number;
  sessionId: string;
  lastMessagePreview?: string;
  fullContent: string; // Full conversation content for search
}

const getResumeDetails = async (
  context: CommandContext,
): Promise<ResumeDetail[]> => {
  const config = context.services.config;
  if (!config) {
    return [];
  }

  try {
    const checkpointService = new CheckpointService(config);
    const checkpoints = checkpointService.listCheckpoints();

    return checkpoints.map((checkpoint) => {
      // Get a preview of the last message for easy identification
      let lastMessagePreview: string | undefined;
      if (checkpoint.messages.length > 0) {
        const lastMsg = checkpoint.messages[checkpoint.messages.length - 1];
        if (lastMsg.content) {
          // Strip newlines and collapse whitespace for single-line display
          const cleanedContent = lastMsg.content.replace(/\s+/g, " ").trim();
          lastMessagePreview = cleanedContent.substring(0, 40);
          if (cleanedContent.length > 40) {
            lastMessagePreview += "...";
          }
        }
      }

      // Build full content string for search (all messages concatenated)
      const fullContent = checkpoint.messages
        .map((msg) => msg.content || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: checkpoint.id,
        createdAt: new Date(checkpoint.createdAt),
        messageCount: checkpoint.messages.length,
        sessionId: checkpoint.sessionId,
        lastMessagePreview,
        fullContent,
      };
    });
  } catch (_err) {
    return [];
  }
};

// Color codes for different session IDs
const getSessionColor = (sessionId: string): number => {
  // Use the first few characters of the session ID to generate a consistent color
  const hash = sessionId.substring(0, 8);
  const num = parseInt(hash, 16) || 0;
  // Map to ANSI colors 31-37 (red through white)
  return 31 + (num % 7);
};

const formatSessionId = (sessionId: string): string => {
  // Show first 8 chars of session ID
  const shortId = sessionId.substring(0, 8);
  const colorCode = getSessionColor(sessionId);
  return `\u001b[${colorCode}m${shortId}\u001b[0m`;
};

const listCommand: SlashCommand = {
  name: "list",
  description: "List saved conversation checkpoints (newest first)",
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const resumeDetails = await getResumeDetails(context);

    if (resumeDetails.length === 0) {
      return {
        type: "message",
        messageType: "info",
        content: "No saved conversation checkpoints found.",
      };
    }

    let message = "List of saved conversations:\n\n";

    for (let i = 0; i < resumeDetails.length; i++) {
      const detail = resumeDetails[i];
      const index = i + 1;
      const isoString = detail.createdAt.toISOString();
      const match = isoString.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      const formattedDate = match ? `${match[1]} ${match[2]}` : "Invalid Date";

      // Format: index. [messages] session_id date - preview
      message += `  ${index}. [${detail.messageCount} messages] `;
      message += `${formatSessionId(detail.sessionId)} `;
      message += `${formattedDate}`;
      if (detail.lastMessagePreview) {
        message += ` - ${detail.lastMessagePreview}`;
      }
      message += "\n";
    }

    message += `\nUse /resume for interactive selection.\n`;
    message += `You can also run /resume <number> or /resume <checkpoint-id>.\n`;

    return {
      type: "message",
      messageType: "info",
      content: message,
    };
  },
};

const deleteCommand: SlashCommand = {
  name: "delete",
  description:
    "Delete a conversation checkpoint. Usage: /resume delete <index>",
  kind: CommandKind.BUILT_IN,
  action: async (context, args): Promise<MessageActionReturn> => {
    const trimmedArgs = args.trim();

    if (!trimmedArgs) {
      return {
        type: "message",
        messageType: "error",
        content: "Missing checkpoint index. Usage: /resume delete <index>",
      };
    }

    let index: number;

    try {
      index = parseInt(trimmedArgs, 10);
      if (isNaN(index) || index < 1) {
        throw new Error("Invalid index");
      }
    } catch (_err) {
      return {
        type: "message",
        messageType: "error",
        content: `Invalid checkpoint index: ${trimmedArgs}.`,
      };
    }

    const config = context.services.config;
    if (!config) {
      return {
        type: "message",
        messageType: "error",
        content: "Configuration not available.",
      };
    }

    const checkpointService = new CheckpointService(config);

    // Get all checkpoints
    const checkpoints = checkpointService.listCheckpoints();

    if (index > checkpoints.length) {
      return {
        type: "message",
        messageType: "error",
        content: `Checkpoint index ${index} not found. You have ${checkpoints.length} saved conversation(s).`,
      };
    }

    const checkpointId = checkpoints[index - 1].id;
    const deleted = checkpointService.deleteCheckpoint(checkpointId);

    if (deleted) {
      return {
        type: "message",
        messageType: "info",
        content: `Conversation checkpoint at index ${index} has been deleted.`,
      };
    } else {
      return {
        type: "message",
        messageType: "error",
        content: `Error: Failed to delete checkpoint at index ${index}.`,
      };
    }
  },
  completion: async (context, partialArg) => {
    const details = await getResumeDetails(context);

    // Return indices for tab completion
    return details
      .map((_, i) => String(i + 1))
      .filter((idx) => idx.startsWith(partialArg));
  },
};

export const resumeCommandGroup: SlashCommand = {
  name: "resume",
  description: "Resume a previous conversation checkpoint.",
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, deleteCommand],
  action: async (context, args) => {
    const trimmedArgs = args.trim();

    if (!trimmedArgs) {
      return {
        type: "dialog",
        dialog: "resume",
      };
    }

    if (trimmedArgs.toLowerCase() === "list") {
      return listCommand.action?.(context, "");
    }

    const config = context.services.config;
    if (!config) {
      return {
        type: "message",
        messageType: "error",
        content: "Configuration not available.",
      };
    }

    const checkpointService = new CheckpointService(config);
    const checkpoints = checkpointService.listCheckpoints();

    let checkpoint = null;
    if (/^\d+$/.test(trimmedArgs)) {
      const index = parseInt(trimmedArgs, 10);

      if (index < 1 || index > checkpoints.length) {
        return {
          type: "message",
          messageType: "error",
          content: `Checkpoint index ${index} not found. You have ${checkpoints.length} saved conversation(s).`,
        };
      }

      checkpoint = checkpoints[index - 1] ?? null;
    } else {
      checkpoint =
        checkpoints.find((candidate) => candidate.id === trimmedArgs) ??
        checkpointService.loadCheckpoint(trimmedArgs);
    }

    if (!checkpoint) {
      return {
        type: "message",
        messageType: "error",
        content: `Checkpoint not found: ${trimmedArgs}. Run /resume to choose an available checkpoint.`,
      };
    }

    // Convert checkpoint messages to history items for the UI
    const rolemap: { [key: string]: MessageType } = {
      user: MessageType.USER,
      gemini: MessageType.GEMINI,
    };

    const uiHistory: HistoryItemWithoutId[] = [];

    for (const item of checkpoint.messages) {
      if (!item.content) {
        continue;
      }

      uiHistory.push({
        type: rolemap[item.type] || MessageType.GEMINI,
        text: item.content,
      } as HistoryItemWithoutId);
    }

    const snapshotClientHistory = checkpoint.contextSnapshot?.clientHistory;

    if (uiHistory.length === 0 && Array.isArray(snapshotClientHistory)) {
      for (const content of snapshotClientHistory) {
        const text =
          content.parts
            ?.filter(
              (
                part,
              ): part is {
                text: string;
              } =>
                !!part &&
                typeof part === "object" &&
                "text" in part &&
                typeof part.text === "string",
            )
            .map((part) => part.text)
            .join("") ?? "";

        if (!text) {
          continue;
        }

        uiHistory.push({
          type:
            content.role === "user" ? MessageType.USER : MessageType.GEMINI,
          text,
        } as HistoryItemWithoutId);
      }
    }

    const clientHistory =
      Array.isArray(snapshotClientHistory) && snapshotClientHistory.length > 0
        ? snapshotClientHistory
        : checkpoint.messages.map((msg) => ({
            role: msg.type === "user" ? "user" : "model",
            parts: [{ text: msg.content }],
          }));

    // Restore session registration if session metadata is available
    if (checkpoint.sessionMeta && config) {
      try {
        await startSessionRegistration({
          id: checkpoint.sessionId,
          mode: checkpoint.sessionMeta.mode as "tui" | "headless" | "noninteractive" | "scheduler" | "orchestrator",
          cwd: checkpoint.sessionMeta.cwd,
          details: checkpoint.sessionMeta.details,
          capabilities: checkpoint.sessionMeta.capabilities,
        });
        // Update the config's session ID to match the restored session
        config.setSessionId(checkpoint.sessionId);
      } catch (error) {
        console.debug(
          `[Resume] Failed to restore session registration:`,
          error,
        );
      }
    }

    return {
      type: "load_history",
      history: uiHistory,
      clientHistory,
      restoredSessionId: checkpoint.sessionId,
      ...(typeof checkpoint.contextSnapshot?.promptTokenCount === "number"
        ? {
            restoredContext: {
              promptTokenCount: checkpoint.contextSnapshot.promptTokenCount,
            },
          }
        : {}),
    };
  },
};
