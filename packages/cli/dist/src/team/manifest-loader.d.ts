/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { TeamManifest } from "@qwen-code/qwen-code-core";
export declare class TeamManifestError extends Error {
    readonly sourcePath?: string | undefined;
    constructor(message: string, sourcePath?: string | undefined);
}
export declare function parseTeamManifest(content: string, sourcePath?: string): TeamManifest;
export declare function loadTeamManifestFromFile(filePath: string): Promise<TeamManifest>;
