/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare class IdleStreamTimeoutError extends Error {
    readonly idleMs: number;
    constructor(idleMs: number, message?: string);
}
