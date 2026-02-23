/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as process from "node:process";
import { getOrchestratorStatus, isOrchestratorRunning, startOrchestrator, stopOrchestrator, } from "../orchestrator/daemon.js";
const startCommand = {
    command: "start",
    describe: "Start the orchestrator daemon",
    handler: async () => {
        const running = await isOrchestratorRunning();
        if (running) {
            const status = await getOrchestratorStatus();
            console.log("Orchestrator daemon is already running.");
            console.log(`PID: ${status.pid}`);
            return;
        }
        const started = await startOrchestrator();
        if (!started) {
            console.error("Failed to start orchestrator daemon.");
            process.exit(1);
        }
        const status = await getOrchestratorStatus();
        console.log("Orchestrator daemon started.");
        console.log(`PID: ${status.pid}`);
    },
};
const stopCommand = {
    command: "stop",
    describe: "Stop the orchestrator daemon",
    handler: async () => {
        const running = await isOrchestratorRunning();
        if (!running) {
            console.log("Orchestrator daemon is not running.");
            return;
        }
        const stopped = await stopOrchestrator();
        if (!stopped) {
            console.error("Failed to stop orchestrator daemon.");
            process.exit(1);
        }
        console.log("Orchestrator daemon stopped.");
    },
};
const statusCommand = {
    command: "status",
    describe: "Show orchestrator status",
    handler: async () => {
        const status = await getOrchestratorStatus();
        console.log(`Running: ${status.running ? "yes" : "no"}`);
        if (status.pid) {
            console.log(`PID: ${status.pid}`);
        }
        if (status.started_at) {
            console.log(`Started: ${new Date(status.started_at).toLocaleString()}`);
        }
        if (status.last_tick) {
            console.log(`Last tick: ${new Date(status.last_tick).toLocaleString()}`);
        }
        console.log(`Tick interval: ${Math.round(status.tick_interval_ms / 1000)}s`);
        console.log(`Policies: ${status.policy_ids.join(", ")}`);
        console.log(`Sessions scanned: ${status.sessions_scanned}`);
        console.log(`Stalled sessions: ${status.stalled_sessions}`);
        console.log(`Recoveries attempted: ${status.recoveries_attempted}`);
        console.log(`Recoveries accepted: ${status.recoveries_succeeded}`);
        if (status.last_action) {
            console.log(`Last action: ${status.last_action.outcome} on ${status.last_action.session_id} (attempt ${status.last_action.attempt}) at ${new Date(status.last_action.timestamp).toLocaleString()}`);
        }
    },
};
export const orchestratorCommand = {
    command: "orchestrator",
    describe: "Manage the LowCal orchestrator daemon",
    builder: (yargs) => yargs.command(startCommand).command(stopCommand).command(statusCommand),
    handler: async () => {
        const status = await getOrchestratorStatus();
        console.log(JSON.stringify(status, null, 2));
    },
};
//# sourceMappingURL=orchestrator.js.map