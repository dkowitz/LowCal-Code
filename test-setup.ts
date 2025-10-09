// Global test setup for Qwen Code tests
import { vi } from 'vitest';

// Provide a robust mock surface for qwen-code-core used across tests
vi.mock('@qwen-code/qwen-code-core', () => {
  const AuthType = {
    QWEN_OAUTH: 'QWEN_OAUTH',
    USE_OPENAI: 'USE_OPENAI',
  };
  const MockConfig = class {
    private model = 'default-model';
    getContentGeneratorConfig() {
      return { model: this.model, baseUrl: 'http://localhost:1234', authType: AuthType.QWEN_OAUTH };
    }
    getModel() {
      return this.model;
    }
    setModel(newModel: string, _opts?: { reason?: string; context?: string }): Promise<void> {
      this.model = newModel;
      return Promise.resolve();
    }
    getSessionId() {
      return 'mock-session';
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
    getEffectiveContextLimit(model?: string) {
      return 131072;
    }
    getLMStudioConfiguredModels() {
      return Promise.resolve([
        { id: 'lm-default-model', label: 'lm-default-model', configuredContextLength: 131072, matchedRestId: 'lm-default-model', configuredName: 'lm-default-model' }
      ]);
    }
    getLMStudioLoadedModel(_baseUrl: string) {
      return Promise.resolve('lm-default-model');
    }
  };
  // Smarter path.join mock to simulate filesystem paths for tests
  const pathJoin = (...parts: string[]) => {
    // If last arg is a filename (.md), join with the directory
    const last = parts[parts.length - 1];
    if (typeof last === 'string' && last.endsWith('.md')) {
      const dir = parts[0] && typeof parts[0] === 'string' ? parts[0] : '/mock/path/conversations';
      // If dir points to 'conversations' folder, return dir + '/' + last
      if (dir.endsWith('conversations') || dir.endsWith('/conversations')) {
        return dir + '/' + last;
      }
      // otherwise default to conversations dir
      return '/mock/path/conversations/' + last;
    }
    // If called to build a directory path (process.cwd(), 'conversations') -> return dir
    if (parts.length === 2 && parts[1] === 'conversations') {
      return '/mock/path/conversations';
    }
    // Fallback to conversations dir
    return '/mock/path/conversations';
  };
  return {
    uiTelemetryService: {
      emitEvent: vi.fn(),
      log: vi.fn(),
    },
    sessionId: 'mock-session',
    AuthType,
    Config: MockConfig,
    // Provide a shim for path.join used in tests if needed
    // The tests import path directly via vi.mock on 'node:path' in tests, but this export is harmless.
  };
});
