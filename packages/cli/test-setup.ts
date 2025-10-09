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
import { vi } from 'vitest';

// Provide a package-level mock for @qwen-code/qwen-code-core to avoid Vite resolution errors
// and to guarantee the Config instance surface expected by many tests.
vi.mock("@qwen-code/qwen-code-core", () => {
  const AuthType = {
    QWEN_OAUTH: 'QWEN_OAUTH',
    USE_OPENAI: 'USE_OPENAI',
  };
  class MockConfig {
    model: string;
    sessionId: string;
    constructor(opts: any) {
      this.model = opts?.model ?? 'test-model';
      this.sessionId = opts?.sessionId ?? 'mock-session';
    }
    getContentGeneratorConfig() {
      return { model: this.model, baseUrl: 'http://localhost:1234', authType: AuthType.QWEN_OAUTH };
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
    getEffectiveContextLimit(_model?: string) {
      return 131072;
    }
    async getLMStudioConfiguredModels() {
      return [
        { id: 'lm-default-model', label: 'lm-default-model', configuredContextLength: 131072, matchedRestId: 'lm-default-model', configuredName: 'lm-default-model' }
      ];
    }
    async getLMStudioLoadedModel(_baseUrl: string) {
      return 'lm-default-model';
    }
  }

  return {
    AuthType,
    Config: MockConfig,
    ideContext: { getIdeContext: vi.fn(), subscribeToIdeContext: vi.fn(() => vi.fn()) },
    isGitRepository: vi.fn().mockResolvedValue(false),
    getAllGeminiMdFilenames: vi.fn(() => ['QWEN.md']),
    uiTelemetryService: { emitEvent: vi.fn(), log: vi.fn() },
  } as any;
});
