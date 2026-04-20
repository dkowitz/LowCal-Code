/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type PdfFormProfileName = "irs_1040_2025";
export interface PdfFormProfile {
    name: PdfFormProfileName;
    description: string;
    aliases: Record<string, string>;
}
export declare function normalizePdfAlias(value: string): string;
export declare function getPdfFormProfile(profileName: string | undefined): PdfFormProfile | undefined;
export declare function detectPdfFormProfile(filePath: string): PdfFormProfile | undefined;
export declare function getPdfFormProfileForFile(filePath: string, requestedProfile?: string): PdfFormProfile | undefined;
export declare function buildAliasesByField(profile: PdfFormProfile | undefined): Map<string, string[]>;
export declare function resolvePdfFieldAlias(profile: PdfFormProfile | undefined, fieldReference: string): string | undefined;
