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
import * as core from "@qwen-code/qwen-code-core";

// If tests don't already mock getContentGeneratorConfig and related methods, provide defaults
vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
  const actual = await importOriginal();
  // Preserve existing mocks if present
  if ((actual as any).Config && !(actual as any).Config.prototype?.getContentGeneratorConfig) {
    const OriginalConfig: any = (actual as any).Config;
    // Create a wrapper that ensures methods exist on instances
    const WrappedConfig = function (this: any, ...args: any[]) {
      const instance = new OriginalConfig(...args);
      if (typeof instance.getContentGeneratorConfig !== 'function') {
        instance.getContentGeneratorConfig = () => ({ model: instance.model ?? 'test-model', authType: (actual as any).AuthType?.QWEN_OAUTH ?? 'QWEN_OAUTH' });
      }
      if (typeof instance.getEffectiveContextLimit !== 'function') {
        instance.getEffectiveContextLimit = (m?: string) => 131072;
      }
      if (typeof instance.getModel !== 'function') {
        instance.getModel = () => instance.model ?? 'test-model';
      }
      if (typeof instance.setModel !== 'function') {
        instance.setModel = async (newModel: string) => { instance.model = newModel; };
      }
      if (typeof instance.getSessionId !== 'function') {
        instance.getSessionId = () => 'mock-session';
      }
      return instance;
    } as any;
    // Copy static properties
    Object.assign(WrappedConfig, OriginalConfig);
    return {
      ...actual,
      Config: WrappedConfig,
    };
  }
  return actual;
});
