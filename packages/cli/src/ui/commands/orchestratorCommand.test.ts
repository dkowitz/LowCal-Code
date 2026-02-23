/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
import { orchestratorCommand } from "./orchestratorCommand.js";

const hoisted = vi.hoisted(() => ({
  isOrchestratorRunningMock: vi.fn<() => Promise<boolean>>(),
  startOrchestratorMock: vi.fn<() => Promise<boolean>>(),
  stopOrchestratorMock: vi.fn<() => Promise<boolean>>(),
  getOrchestratorStatusMock: vi.fn<
    () => Promise<{
      running: boolean;
      pid?: number;
      last_tick?: string;
      sessions_scanned: number;
      stalled_sessions: number;
      recoveries_attempted: number;
      recoveries_succeeded: number;
    }>
  >(),
}));

vi.mock("../../orchestrator/daemon.js", () => ({
  isOrchestratorRunning: hoisted.isOrchestratorRunningMock,
  startOrchestrator: hoisted.startOrchestratorMock,
  stopOrchestrator: hoisted.stopOrchestratorMock,
  getOrchestratorStatus: hoisted.getOrchestratorStatusMock,
}));

describe("orchestratorCommand", () => {
  const context = createMockCommandContext();
  const getMessageContent = (result: unknown): string => {
    expect(result).toEqual(expect.objectContaining({ type: "message" }));
    const content = (result as { content?: unknown }).content;
    expect(typeof content).toBe("string");
    return content as string;
  };

  beforeEach(() => {
    hoisted.isOrchestratorRunningMock.mockReset();
    hoisted.startOrchestratorMock.mockReset();
    hoisted.stopOrchestratorMock.mockReset();
    hoisted.getOrchestratorStatusMock.mockReset();

    hoisted.getOrchestratorStatusMock.mockResolvedValue({
      running: true,
      pid: 4321,
      last_tick: new Date().toISOString(),
      sessions_scanned: 3,
      stalled_sessions: 1,
      recoveries_attempted: 2,
      recoveries_succeeded: 1,
    });
  });

  it("shows status by default", async () => {
    const result = await orchestratorCommand.action!(context, "");
    expect(getMessageContent(result)).toContain("Running:");
  });

  it("starts orchestrator if stopped", async () => {
    hoisted.isOrchestratorRunningMock.mockResolvedValue(false);
    hoisted.startOrchestratorMock.mockResolvedValue(true);
    const result = await orchestratorCommand.action!(context, "start");
    expect(getMessageContent(result)).toContain("Orchestrator daemon started.");
    expect(hoisted.startOrchestratorMock).toHaveBeenCalledTimes(1);
  });

  it("stops orchestrator if running", async () => {
    hoisted.isOrchestratorRunningMock.mockResolvedValue(true);
    hoisted.stopOrchestratorMock.mockResolvedValue(true);
    const result = await orchestratorCommand.action!(context, "stop");
    expect(getMessageContent(result)).toContain("Orchestrator daemon stopped.");
    expect(hoisted.stopOrchestratorMock).toHaveBeenCalledTimes(1);
  });
});
