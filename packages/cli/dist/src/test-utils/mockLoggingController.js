/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { vi } from "vitest";
export const createMockLoggingController = () => ({
    enableLogging: vi.fn().mockResolvedValue({ enabled: true }),
    disableLogging: vi.fn().mockResolvedValue({ enabled: false }),
    getStatus: vi.fn(() => ({ enabled: false })),
    logCommandInvocation: vi.fn(),
    logCommandResult: vi.fn(),
    logAppError: vi.fn(),
    logErrorReport: vi.fn(),
});
//# sourceMappingURL=mockLoggingController.js.map