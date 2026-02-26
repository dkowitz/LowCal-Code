/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const GEMINI_DIR = ".qwen";
export declare const GOOGLE_ACCOUNTS_FILENAME = "google_accounts.json";
export declare const LOWCAL_INSTANCE_ID_ENV_VAR = "LOWCAL_INSTANCE_ID";
export declare function normalizeInstanceId(value: string | undefined | null): string | undefined;
export declare class Storage {
    private readonly targetDir;
    constructor(targetDir: string);
    static getGlobalGeminiDir(): string;
    static getMcpOAuthTokensPath(): string;
    static getGlobalSettingsPath(): string;
    static getGlobalToolConfigPath(): string;
    static getInstallationIdPath(): string;
    static getGoogleAccountsPath(): string;
    static getUserCommandsDir(): string;
    static getGlobalMemoryFilePath(): string;
    static getGlobalTempDir(): string;
    getGeminiDir(): string;
    getProjectTempDir(): string;
    ensureProjectTempDirExists(): void;
    static getOAuthCredsPath(): string;
    getProjectRoot(): string;
    private getFilePathHash;
    getHistoryDir(): string;
    getWorkspaceSettingsPath(): string;
    getProjectCommandsDir(): string;
    getProjectTempCheckpointsDir(): string;
    getExtensionsDir(): string;
    getExtensionsConfigPath(): string;
    getHistoryFilePath(): string;
}
