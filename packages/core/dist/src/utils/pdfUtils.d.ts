/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare function parsePdfBuffer(buffer: Buffer, options: {
    maxPages: number;
    timeoutMs: number;
}): Promise<{
    text: string;
}>;
