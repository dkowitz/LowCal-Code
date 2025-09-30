/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from "./types.js";

const USAGE_MESSAGE =
  "Usage: /logging <on|off|status>. Enables or disables enhanced session logging.";

export const loggingCommand: SlashCommand = {
  name: "logging",
  description:
    "enable, disable, or check the status of enhanced session logging for this session",
  kind: CommandKind.BUILT_IN,
  async action(context, args) {
    const logging = context.services.logging;
    const input = args.trim().toLowerCase();

    const showStatus = () => {
      const status = logging.getStatus();
      const messageLines = [
        `Logging is currently ${status.enabled ? "enabled" : "disabled"}.`,
      ];
      if (status.logFilePath) {
        messageLines.push(`Log file: \`${status.logFilePath}\``);
      }
      if (status.lastError) {
        messageLines.push(`Last error: ${status.lastError}`);
      }
      context.ui.addItem(
        {
          type: "info",
          text: messageLines.join(" "),
        },
        Date.now(),
      );
    };

    if (!input || input === "status") {
      showStatus();
      return;
    }

    if (input === "on" || input === "enable") {
      try {
        const status = await logging.enableLogging();
        const parts = ["Enhanced session logging enabled."];
        if (status.logFilePath) {
          parts.push(`Writing to \`${status.logFilePath}\`.`);
        }
        context.ui.addItem(
          {
            type: "info",
            text: parts.join(" "),
          },
          Date.now(),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.ui.addItem(
          {
            type: "error",
            text: `Failed to enable logging: ${message}`,
          },
          Date.now(),
        );
      }
      return;
    }

    if (input === "off" || input === "disable") {
      try {
        await logging.disableLogging("Disabled via /logging command");
        context.ui.addItem(
          {
            type: "info",
            text: "Enhanced session logging disabled.",
          },
          Date.now(),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.ui.addItem(
          {
            type: "error",
            text: `Failed to disable logging: ${message}`,
          },
          Date.now(),
        );
      }
      return;
    }

    context.ui.addItem(
      {
        type: "error",
        text: USAGE_MESSAGE,
      },
      Date.now(),
    );
    return;
  },
};
