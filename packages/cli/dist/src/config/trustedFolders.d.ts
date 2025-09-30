/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Settings } from "./settings.js";
export declare const TRUSTED_FOLDERS_FILENAME = "trustedFolders.json";
export declare const SETTINGS_DIRECTORY_NAME = ".qwen";
export declare const USER_SETTINGS_DIR: string;
export declare const USER_TRUSTED_FOLDERS_PATH: string;
export declare enum TrustLevel {
    TRUST_FOLDER = "TRUST_FOLDER",
    TRUST_PARENT = "TRUST_PARENT",
    DO_NOT_TRUST = "DO_NOT_TRUST"
}
export interface TrustRule {
    path: string;
    trustLevel: TrustLevel;
}
export interface TrustedFoldersError {
    message: string;
    path: string;
}
export interface TrustedFoldersFile {
    config: Record<string, TrustLevel>;
    path: string;
}
export declare class LoadedTrustedFolders {
    user: TrustedFoldersFile;
    errors: TrustedFoldersError[];
    constructor(user: TrustedFoldersFile, errors: TrustedFoldersError[]);
    get rules(): TrustRule[];
    setValue(path: string, trustLevel: TrustLevel): void;
}
export declare function loadTrustedFolders(): LoadedTrustedFolders;
export declare function saveTrustedFolders(trustedFoldersFile: TrustedFoldersFile): void;
export declare function isWorkspaceTrusted(settings: Settings): boolean | undefined;
