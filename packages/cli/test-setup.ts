/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Unset NO_COLOR environment variable to ensure consistent theme behavior between local and CI test runs
if (process.env["NO_COLOR"] !== undefined) {
  delete process.env["NO_COLOR"];
}

import "./src/test-utils/customMatchers.js";

// Augment package-level mocks to ensure Config surface includes required methods
import { vi } from "vitest";
import { EventEmitter } from "node:events";

// Provide a package-level mock for @qwen-code/qwen-code-core to avoid Vite resolution errors
// and to guarantee the Config instance surface expected by many tests.
vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actualCore =
    await importOriginal<typeof import("@qwen-code/qwen-code-core")>();

  const AuthType = actualCore.AuthType;
  const telemetryEmitter = new EventEmitter();
  const telemetryMetrics = {
    models: {},
    tools: {
      byName: {},
      totalCalls: 0,
      totalSuccess: 0,
      totalDurationMs: 0,
      totalDecisions: {
        accept: 0,
        reject: 0,
        modify: 0,
      },
    },
    files: {
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
    },
  };

  class MockConfig {
    model: string;
    sessionId: string;
    constructor(opts: { model?: string; sessionId?: string } = {}) {
      this.model = opts?.model ?? "test-model";
      this.sessionId = opts?.sessionId ?? "mock-session";
    }
    getContentGeneratorConfig() {
      return {
        model: this.model,
        baseUrl: "http://localhost:1234",
        authType: AuthType?.QWEN_OAUTH ?? "QWEN_OAUTH",
      };
    }
    getModel() {
      return this.model;
    }
    async setModel(newModel: string) {
      this.model = newModel;
    }
    getSessionId() {
      return this.sessionId;
    }
    getDebugMode() {
      return false;
    }
    getContentGeneratorTimeout() {
      return undefined;
    }
    getContentGeneratorMaxRetries() {
      return undefined;
    }
    getEffectiveContextLimit() {
      return 131072;
    }
    setModelContextLimit() {
      // Mock implementation - no-op
    }
    async getLMStudioLoadedModel() {
      return "lm-default-model";
    }
  }

  return {
    ...actualCore,
    AuthType,
    Config: MockConfig,
    postCollabMessage: vi.fn(
      actualCore.postCollabMessage
        ? (
            ...args: Parameters<typeof actualCore.postCollabMessage>
          ): ReturnType<typeof actualCore.postCollabMessage> =>
            actualCore.postCollabMessage(...args)
        : async () => {
            throw new Error("postCollabMessage is not implemented in this test.");
          },
    ),
    readCollabMessages: vi.fn(
      actualCore.readCollabMessages
        ? (
            ...args: Parameters<typeof actualCore.readCollabMessages>
          ): ReturnType<typeof actualCore.readCollabMessages> =>
            actualCore.readCollabMessages(...args)
        : async () => [],
    ),
    COLLAB_NOTIFY_MODES: actualCore.COLLAB_NOTIFY_MODES ?? [
      "passive",
      "wake_view",
      "wake_prompt",
    ],
    enqueueCollabWakeForMessage: vi.fn(
      actualCore.enqueueCollabWakeForMessage
        ? (
            ...args: Parameters<typeof actualCore.enqueueCollabWakeForMessage>
          ): ReturnType<typeof actualCore.enqueueCollabWakeForMessage> =>
            actualCore.enqueueCollabWakeForMessage(...args)
        : async () => ({
            notifyMode: "passive",
            attempted: false,
            enqueued: false,
            reason: "passive_mode",
          }),
    ),
    listSessions: vi.fn(
      actualCore.listSessions
        ? (
            ...args: Parameters<typeof actualCore.listSessions>
          ): ReturnType<typeof actualCore.listSessions> =>
            actualCore.listSessions(...args)
        : async () => [],
    ),
    ideContext: {
      getIdeContext: vi.fn(),
      subscribeToIdeContext: vi.fn(() => vi.fn()),
    },
    isGitRepository: vi.fn().mockResolvedValue(false),
    getAllGeminiMdFilenames: vi.fn(() => ["LOWCAL.md"]),
    uiTelemetryService: {
      emitEvent: vi.fn(),
      log: vi.fn(),
      getMetrics: vi.fn(() => telemetryMetrics),
      getLastPromptTokenCount: vi.fn(() => 0),
      on: vi.fn((event: string, listener: (...args: Array<unknown>) => void) =>
        telemetryEmitter.on(event, listener),
      ),
      off: vi.fn((event: string, listener: (...args: Array<unknown>) => void) =>
        telemetryEmitter.off(event, listener),
      ),
      emit: vi.fn((event: string, payload?: unknown) =>
        telemetryEmitter.emit(event, payload),
      ),
    },
  };
});
