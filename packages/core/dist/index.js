// Minimal package entry for @qwen-code/qwen-code-core used during tests when the package isn't built.
// This file is intentionally small and provides just enough exports for Vite to resolve the package
// during test import analysis. The actual implementations are mocked in tests via vitest.

export const AuthType = {
  QWEN_OAUTH: 'QWEN_OAUTH',
  USE_OPENAI: 'USE_OPENAI',
};

export class MCPServerConfig {
  constructor() {}
}

export class Config {
  constructor(_opts) {
    this.model = 'test-model';
  }
  getContentGeneratorConfig() {
    return { model: this.model, authType: AuthType.QWEN_OAUTH };
  }
  getModel() {
    return this.model;
  }
  async setModel(m) {
    this.model = m;
  }
  getSessionId() {
    return 'mock-session';
  }
}

export const ideContext = {
  getIdeContext: () => undefined,
  subscribeToIdeContext: () => () => {},
};

export const isGitRepository = async () => false;
export const getAllGeminiMdFilenames = () => ['QWEN.md'];
export const uiTelemetryService = { emitEvent: () => {}, log: () => {} };

// Provide a default export in case some code imports the package as default
export default {
  AuthType,
  MCPServerConfig,
  Config,
  ideContext,
  isGitRepository,
  getAllGeminiMdFilenames,
  uiTelemetryService,
};
