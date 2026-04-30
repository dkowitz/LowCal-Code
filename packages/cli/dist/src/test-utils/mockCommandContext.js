/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { vi } from "vitest";
import { createMockLoggingController } from "./mockLoggingController.js";
/**
 * Creates a deep, fully-typed mock of the CommandContext for use in tests.
 * All functions are pre-mocked with `vi.fn()`.
 *
 * @param overrides - A deep partial object to override any default mock values.
 * @returns A complete, mocked CommandContext object.
 */
export const createMockCommandContext = (overrides = {}) => {
    const isPlainObject = (value) => Object.prototype.toString.call(value) === "[object Object]";
    const defaultMocks = {
        invocation: {
            raw: "",
            name: "",
            args: "",
        },
        services: {
            config: null,
            settings: {
                merged: {},
                setValue: vi.fn(),
            },
            git: undefined,
            logger: {
                log: vi.fn(),
                logMessage: vi.fn(),
                saveCheckpoint: vi.fn(),
                loadCheckpoint: vi.fn().mockResolvedValue([]),
            }, // Logger is a class with many non-essential members for tests.
            logging: createMockLoggingController(),
        },
        ui: {
            addItem: vi.fn(),
            clear: vi.fn(),
            refreshStatic: vi.fn(),
            setDebugMessage: vi.fn(),
            pendingItem: null,
            setPendingItem: vi.fn(),
            loadHistory: vi.fn(),
            getHistory: vi.fn().mockReturnValue([]),
            toggleCorgiMode: vi.fn(),
            toggleVimEnabled: vi.fn(),
            setGeminiMdFileCount: vi.fn(),
            reloadCommands: vi.fn(),
        },
        session: {
            sessionShellAllowlist: new Set(),
            stats: {
                sessionStartTime: new Date(),
                lastPromptTokenCount: 0,
                metrics: {
                    models: {},
                    tools: {
                        totalCalls: 0,
                        totalSuccess: 0,
                        totalFail: 0,
                        totalDurationMs: 0,
                        totalDecisions: { accept: 0, reject: 0, modify: 0 },
                        byName: {},
                    },
                },
                promptCount: 0,
            },
        },
    };
    const merge = (target, source) => {
        if (!isPlainObject(target) || !isPlainObject(source)) {
            return source;
        }
        const output = { ...target };
        for (const [key, sourceValue] of Object.entries(source)) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                const targetValue = output[key];
                if (
                // We only want to recursivlty merge plain objects
                isPlainObject(sourceValue) &&
                    isPlainObject(targetValue)) {
                    output[key] = merge(targetValue, sourceValue);
                }
                else {
                    // If not, we do a direct assignment. This preserves Date objects and others.
                    output[key] = sourceValue;
                }
            }
        }
        return output;
    };
    return merge(defaultMocks, overrides);
};
//# sourceMappingURL=mockCommandContext.js.map