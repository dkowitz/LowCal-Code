/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getOrchestratorStatus,
  isOrchestratorRunning,
  startOrchestrator,
  stopOrchestrator,
} from "../../orchestrator/daemon.js";
import {
  CommandKind,
  type MessageActionReturn,
  type SlashCommand,
} from "./types.js";

function info(content: string): MessageActionReturn {
  return {
    type: "message",
    messageType: "info",
    content,
  };
}

function usageError(content: string): MessageActionReturn {
  return {
    type: "message",
    messageType: "error",
    content,
  };
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return tokens;
}

function formatStatusSummary(status: Awaited<ReturnType<typeof getOrchestratorStatus>>): string {
  const lines = [
    `Running: ${status.running ? "yes" : "no"}`,
    `PID: ${status.pid ?? "n/a"}`,
    `Last tick: ${status.last_tick ? new Date(status.last_tick).toLocaleString() : "n/a"}`,
    `Sessions scanned: ${status.sessions_scanned}`,
    `Stalled sessions: ${status.stalled_sessions}`,
    `Recoveries attempted/succeeded: ${status.recoveries_attempted}/${status.recoveries_succeeded}`,
  ];
  return lines.join("\n");
}

export const orchestratorCommand: SlashCommand = {
  name: "orchestrator",
  description: "manage orchestrator daemon from interactive mode",
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const tokens = tokenizeArgs(args.trim());
    const subcommand = (tokens[0] ?? "status").toLowerCase();

    if (subcommand === "help") {
      return info(
        [
          "Orchestrator commands:",
          "- /orchestrator status",
          "- /orchestrator start",
          "- /orchestrator stop",
        ].join("\n"),
      );
    }

    if (subcommand === "status") {
      const status = await getOrchestratorStatus();
      return info(formatStatusSummary(status));
    }

    if (subcommand === "start") {
      const running = await isOrchestratorRunning();
      if (running) {
        const status = await getOrchestratorStatus();
        return info(
          [
            "Orchestrator daemon is already running.",
            `PID: ${status.pid ?? "n/a"}`,
            formatStatusSummary(status),
          ].join("\n"),
        );
      }

      const started = await startOrchestrator();
      if (!started) {
        return usageError("Failed to start orchestrator daemon.");
      }
      const status = await getOrchestratorStatus();
      return info(
        ["Orchestrator daemon started.", formatStatusSummary(status)].join("\n"),
      );
    }

    if (subcommand === "stop") {
      const running = await isOrchestratorRunning();
      if (!running) {
        return info("Orchestrator daemon is not running.");
      }
      const stopped = await stopOrchestrator();
      if (!stopped) {
        return usageError("Failed to stop orchestrator daemon.");
      }
      return info("Orchestrator daemon stopped.");
    }

    return usageError(
      "Unknown subcommand. Use /orchestrator status, /orchestrator start, or /orchestrator stop.",
    );
  },
};
