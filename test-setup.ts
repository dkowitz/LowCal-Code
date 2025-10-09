// Global test setup for Qwen Code tests
import { vi } from 'vitest';

// Provide a robust mock surface for qwen-code-core used across tests
vi.mock('@qwen-code/qwen-code-core', () => {
  const AuthType = {
    QWEN_OAUTH: 'QWEN_OAUTH',
    USE_OPENAI: 'USE_OPENAI',
  };
  const MockConfigClass = class {
    getContentGeneratorConfig() {
      return {
        model: 'gpt-3.5-turbo',
        authType: AuthType.QWEN_OAUTH,
      };
    }
    getModel() {
      return 'default-model';
    }
    setModel() {
      return Promise.resolve();
    }
    getSessionId() {
      return 'mock-session';
    }
    getDebugMode() {
      return false;
    }
  };
  return {
    uiTelemetryService: {
      emitEvent: vi.fn(),
      log: vi.fn(),
    },
    sessionId: 'mock-session',
    AuthType,
    Config: MockConfigClass,
  };
});
