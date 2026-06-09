/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */
import { type LlamaCppBackend } from "@qwen-code/qwen-code-core";
/** Information about a new llama.cpp release available for update. */
export interface LlamaCppUpdateInfo {
    /** The latest release tag (e.g., "b9159"). */
    latestTag: string;
    /** Current bundled tag (from the binary --version output). */
    currentTag: string;
    /** Backend this update applies to. */
    backend: LlamaCppBackend;
    /** Release asset selected for this backend. */
    assetName: string;
    /** Release notes URL. */
    releaseUrl: string;
    /** Human-readable message describing the update. */
    message: string;
}
export declare function dismissLlamaCppUpdate(updateInfo: Pick<LlamaCppUpdateInfo, "assetName" | "backend" | "latestTag" | "releaseUrl">): void;
/**
 * Check if an update is available for llama.cpp.
 * Uses a 24-hour disk cache to avoid unnecessary API calls.
 *
 * @returns Update info if a newer version is available, null otherwise.
 */
export declare function checkForLlamaCppUpdate(force?: boolean, requestedBackend?: LlamaCppBackend): Promise<LlamaCppUpdateInfo | null>;
/**
 * Download and install the latest llama.cpp binary.
 * Reuses the download/extract logic from postinstall.js.
 *
 * @returns true if installation succeeded, false otherwise.
 */
export declare function installLlamaCppUpdate(): Promise<boolean>;
