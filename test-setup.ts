// Global test setup for Qwen Code tests
import { vi } from 'vitest';

// Provide a minimal, stable mock surface for qwen-code-core to prevent test flakiness
vi.mock('@qwen-code/qwen-code-core', () => {
  return {
    // Core config surface used by tests for model/config access
    Config: class MockConfig {
      constructor() {}
    },
    // Minimal surface exports used by tests
  };
});
