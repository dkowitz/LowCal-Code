/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import process from "node:process";
import { getOrchestratorStatus, isOrchestratorRunning, startOrchestrator, stopOrchestrator, } from "../../orchestrator/daemon.js";
import { setOrchestratorDecisionModeConfig, } from "../../orchestrator/policies/team-planner.js";
import { CommandKind, } from "./types.js";
function info(content) {
    return {
        type: "message",
        messageType: "info",
        content,
    };
}
function usageError(content) {
    return {
        type: "message",
        messageType: "error",
        content,
    };
}
function tokenizeArgs(input) {
    const tokens = [];
    const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match;
    while ((match = regex.exec(input)) !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
    }
    return tokens;
}
function formatStatusSummary(status) {
    const lines = [
        `Running: ${status.running ? "yes" : "no"}`,
        `PID: ${status.pid ?? "n/a"}`,
        `Decision mode: ${status.decision_mode} (${status.decision_mode_source ?? "unknown"})`,
        `Last tick: ${status.last_tick ? new Date(status.last_tick).toLocaleString() : "n/a"}`,
        `Teams scanned/updated: ${status.teams_scanned}/${status.teams_updated}`,
        `Team delegations dispatched: ${status.team_delegations_dispatched}`,
        `Team delegations completed/failed: ${status.team_delegations_completed}/${status.team_delegations_failed}`,
        `Team agent restarts attempted/succeeded: ${status.team_agent_restart_attempts}/${status.team_agent_restart_successes}`,
        `Team phase transitions: ${status.team_phase_transitions}`,
        `Planner source: ${status.planner_source ?? "n/a"}`,
        `Planner hint teams: ${status.planner_last_hint_teams ?? 0}`,
        `Planner confidence: ${typeof status.planner_last_confidence === "number"
            ? status.planner_last_confidence.toFixed(2)
            : "n/a"}`,
        `Planner summary: ${status.planner_last_summary ?? "n/a"}`,
        `Planner fallback: ${status.planner_last_fallback_reason ?? "none"}`,
    ];
    return lines.join("\n");
}
export const orchestratorCommand = {
    name: "orchestrator",
    description: "manage orchestrator daemon from interactive mode",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const tokens = tokenizeArgs(args.trim());
        const subcommand = (tokens[0] ?? "status").toLowerCase();
        if (subcommand === "help") {
            return info([
                "Orchestrator commands:",
                "- /orchestrator status",
                "- /orchestrator start",
                "- /orchestrator stop",
                "- /orchestrator mode [deterministic|assisted]",
            ].join("\n"));
        }
        if (subcommand === "status") {
            const status = await getOrchestratorStatus();
            return info(formatStatusSummary(status));
        }
        if (subcommand === "start") {
            const running = await isOrchestratorRunning();
            if (running) {
                const status = await getOrchestratorStatus();
                return info([
                    "Orchestrator daemon is already running.",
                    `PID: ${status.pid ?? "n/a"}`,
                    formatStatusSummary(status),
                ].join("\n"));
            }
            const started = await startOrchestrator();
            if (!started) {
                return usageError("Failed to start orchestrator daemon.");
            }
            const status = await getOrchestratorStatus();
            return info(["Orchestrator daemon started.", formatStatusSummary(status)].join("\n"));
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
        if (subcommand === "mode") {
            const mode = tokens[1]?.trim().toLowerCase();
            if (!mode) {
                const status = await getOrchestratorStatus();
                return info([
                    `Current decision mode: ${status.decision_mode} (${status.decision_mode_source ?? "unknown"})`,
                    "Set mode with: /orchestrator mode deterministic|assisted",
                ].join("\n"));
            }
            if (mode !== "deterministic" && mode !== "assisted") {
                return usageError('Invalid mode. Use "/orchestrator mode deterministic" or "/orchestrator mode assisted".');
            }
            const baseDir = context.services.config?.getTargetDir() ?? process.cwd();
            await setOrchestratorDecisionModeConfig(baseDir, mode);
            const status = await getOrchestratorStatus();
            return info([
                `Orchestrator decision mode saved as "${mode}".`,
                status.running
                    ? "The daemon is running; the new mode will apply on the next tick."
                    : "The daemon is not running; start it when ready.",
                formatStatusSummary(status),
            ].join("\n"));
        }
        return usageError("Unknown subcommand. Use /orchestrator status, /orchestrator start, /orchestrator stop, or /orchestrator mode deterministic|assisted.");
    },
};
//# sourceMappingURL=orchestratorCommand.js.map