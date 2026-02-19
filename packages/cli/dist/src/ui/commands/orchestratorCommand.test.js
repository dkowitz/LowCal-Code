/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { orchestratorCommand } from "./orchestratorCommand.js";
const hoisted = vi.hoisted(() => ({
    isOrchestratorRunningMock: vi.fn(),
    startOrchestratorMock: vi.fn(),
    stopOrchestratorMock: vi.fn(),
    setOrchestratorDecisionModeConfigMock: vi.fn(),
    getOrchestratorStatusMock: vi.fn(),
}));
vi.mock("../../orchestrator/daemon.js", () => ({
    isOrchestratorRunning: hoisted.isOrchestratorRunningMock,
    startOrchestrator: hoisted.startOrchestratorMock,
    stopOrchestrator: hoisted.stopOrchestratorMock,
    getOrchestratorStatus: hoisted.getOrchestratorStatusMock,
}));
vi.mock("../../orchestrator/policies/team-planner.js", () => ({
    setOrchestratorDecisionModeConfig: hoisted.setOrchestratorDecisionModeConfigMock,
}));
describe("orchestratorCommand", () => {
    const context = createMockCommandContext();
    beforeEach(() => {
        hoisted.isOrchestratorRunningMock.mockReset();
        hoisted.startOrchestratorMock.mockReset();
        hoisted.stopOrchestratorMock.mockReset();
        hoisted.setOrchestratorDecisionModeConfigMock.mockReset();
        hoisted.getOrchestratorStatusMock.mockReset();
        hoisted.getOrchestratorStatusMock.mockResolvedValue({
            running: true,
            pid: 4321,
            decision_mode: "deterministic",
            decision_mode_source: "default",
            last_tick: new Date().toISOString(),
            teams_scanned: 3,
            teams_updated: 1,
            team_delegations_dispatched: 2,
            team_delegations_completed: 1,
            team_delegations_failed: 0,
            team_agent_restart_attempts: 0,
            team_agent_restart_successes: 0,
            team_phase_transitions: 1,
        });
    });
    it("shows status by default", async () => {
        const result = await orchestratorCommand.action(context, "");
        expect(result.type).toBe("message");
        expect(result.content).toContain("Running:");
    });
    it("starts orchestrator if stopped", async () => {
        hoisted.isOrchestratorRunningMock.mockResolvedValue(false);
        hoisted.startOrchestratorMock.mockResolvedValue(true);
        const result = await orchestratorCommand.action(context, "start");
        expect(result.content).toContain("Orchestrator daemon started.");
        expect(hoisted.startOrchestratorMock).toHaveBeenCalledTimes(1);
    });
    it("stops orchestrator if running", async () => {
        hoisted.isOrchestratorRunningMock.mockResolvedValue(true);
        hoisted.stopOrchestratorMock.mockResolvedValue(true);
        const result = await orchestratorCommand.action(context, "stop");
        expect(result.content).toContain("Orchestrator daemon stopped.");
        expect(hoisted.stopOrchestratorMock).toHaveBeenCalledTimes(1);
    });
    it("updates orchestrator decision mode", async () => {
        hoisted.setOrchestratorDecisionModeConfigMock.mockResolvedValue({
            decision_mode: "assisted",
        });
        const result = await orchestratorCommand.action(context, "mode assisted");
        expect(result.content).toContain('Orchestrator decision mode saved as "assisted".');
        expect(hoisted.setOrchestratorDecisionModeConfigMock).toHaveBeenCalledWith(expect.any(String), "assisted");
    });
});
//# sourceMappingURL=orchestratorCommand.test.js.map