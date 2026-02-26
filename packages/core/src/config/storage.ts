/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import * as fs from "node:fs";

export const GEMINI_DIR = ".qwen";
export const GOOGLE_ACCOUNTS_FILENAME = "google_accounts.json";
export const LOWCAL_INSTANCE_ID_ENV_VAR = "LOWCAL_INSTANCE_ID";
const TMP_DIR_NAME = "tmp";
const INSTANCE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function normalizeInstanceId(
  value: string | undefined | null,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!INSTANCE_ID_PATTERN.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function getInstanceIdFromEnv(): string | undefined {
  return normalizeInstanceId(process.env[LOWCAL_INSTANCE_ID_ENV_VAR]);
}

export class Storage {
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  static getGlobalGeminiDir(): string {
    const homeDir = os.homedir();
    if (!homeDir) {
      return path.join(os.tmpdir(), ".qwen");
    }
    return path.join(homeDir, GEMINI_DIR);
  }

  static getMcpOAuthTokensPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), "mcp-oauth-tokens.json");
  }

  static getGlobalSettingsPath(): string {
    const globalDir = Storage.getGlobalGeminiDir();
    const instanceId = getInstanceIdFromEnv();
    if (instanceId) {
      return path.join(globalDir, "instances", instanceId, "settings.json");
    }
    return path.join(globalDir, "settings.json");
  }

  static getGlobalToolConfigPath(): string {
    const globalDir = Storage.getGlobalGeminiDir();
    const instanceId = getInstanceIdFromEnv();
    if (instanceId) {
      return path.join(globalDir, "instances", instanceId, "tool-config.json");
    }
    return path.join(globalDir, "tool-config.json");
  }

  static getInstallationIdPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), "installation_id");
  }

  static getGoogleAccountsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), GOOGLE_ACCOUNTS_FILENAME);
  }

  static getUserCommandsDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), "commands");
  }

  static getGlobalMemoryFilePath(): string {
    return path.join(Storage.getGlobalGeminiDir(), "memory.md");
  }

  static getGlobalTempDir(): string {
    return path.join(Storage.getGlobalGeminiDir(), TMP_DIR_NAME);
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getProjectTempDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const tempDir = Storage.getGlobalTempDir();
    return path.join(tempDir, hash);
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  static getOAuthCredsPath(): string {
    return path.join(Storage.getGlobalGeminiDir(), "oauth_creds.json");
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash("sha256").update(filePath).digest("hex");
  }

  getHistoryDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const historyDir = path.join(Storage.getGlobalGeminiDir(), "history");
    return path.join(historyDir, hash);
  }

  getWorkspaceSettingsPath(): string {
    const workspaceGeminiDir = this.getGeminiDir();
    const instanceId = getInstanceIdFromEnv();
    if (instanceId) {
      return path.join(
        workspaceGeminiDir,
        "instances",
        instanceId,
        "settings.json",
      );
    }
    return path.join(workspaceGeminiDir, "settings.json");
  }

  getProjectCommandsDir(): string {
    return path.join(this.getGeminiDir(), "commands");
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), "checkpoints");
  }

  getExtensionsDir(): string {
    return path.join(this.getGeminiDir(), "extensions");
  }

  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), "qwen-extension.json");
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), "shell_history");
  }
}
