/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type ParsedPdfPage = {
    pageNumber: number;
    text: string;
    hasText: boolean;
    hasImages: boolean;
};
export declare function parsePdfBuffer(buffer: Buffer, options: {
    maxPages: number;
    timeoutMs: number;
}): Promise<{
    text: string;
    pages: ParsedPdfPage[];
    pageCount: number;
}>;
