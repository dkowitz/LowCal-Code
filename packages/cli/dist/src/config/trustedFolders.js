/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { getErrorMessage, isWithinRoot } from "@qwen-code/qwen-code-core";
import stripJsonComments from "strip-json-comments";
export const TRUSTED_FOLDERS_FILENAME = "trustedFolders.json";
export const SETTINGS_DIRECTORY_NAME = ".qwen";
export const USER_SETTINGS_DIR = path.join(homedir(), SETTINGS_DIRECTORY_NAME);
export const USER_TRUSTED_FOLDERS_PATH = path.join(USER_SETTINGS_DIR, TRUSTED_FOLDERS_FILENAME);
export var TrustLevel;
(function (TrustLevel) {
    TrustLevel["TRUST_FOLDER"] = "TRUST_FOLDER";
    TrustLevel["TRUST_PARENT"] = "TRUST_PARENT";
    TrustLevel["DO_NOT_TRUST"] = "DO_NOT_TRUST";
})(TrustLevel || (TrustLevel = {}));
export class LoadedTrustedFolders {
    user;
    errors;
    constructor(user, errors) {
        this.user = user;
        this.errors = errors;
    }
    get rules() {
        return Object.entries(this.user.config).map(([path, trustLevel]) => ({
            path,
            trustLevel,
        }));
    }
    setValue(path, trustLevel) {
        this.user.config[path] = trustLevel;
        saveTrustedFolders(this.user);
    }
}
export function loadTrustedFolders() {
    const errors = [];
    const userConfig = {};
    const userPath = USER_TRUSTED_FOLDERS_PATH;
    // Load user trusted folders
    try {
        if (fs.existsSync(userPath)) {
            const content = fs.readFileSync(userPath, "utf-8");
            const parsed = JSON.parse(stripJsonComments(content));
            if (parsed) {
                Object.assign(userConfig, parsed);
            }
        }
    }
    catch (error) {
        errors.push({
            message: getErrorMessage(error),
            path: userPath,
        });
    }
    return new LoadedTrustedFolders({ path: userPath, config: userConfig }, errors);
}
export function saveTrustedFolders(trustedFoldersFile) {
    try {
        // Ensure the directory exists
        const dirPath = path.dirname(trustedFoldersFile.path);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(trustedFoldersFile.path, JSON.stringify(trustedFoldersFile.config, null, 2), "utf-8");
    }
    catch (error) {
        console.error("Error saving trusted folders file:", error);
    }
}
export function isWorkspaceTrusted(settings) {
    const folderTrustFeature = settings.security?.folderTrust?.featureEnabled ?? false;
    const folderTrustSetting = settings.security?.folderTrust?.enabled ?? true;
    const folderTrustEnabled = folderTrustFeature && folderTrustSetting;
    if (!folderTrustEnabled) {
        return true;
    }
    const { rules, errors } = loadTrustedFolders();
    if (errors.length > 0) {
        for (const error of errors) {
            console.error(`Error loading trusted folders config from ${error.path}: ${error.message}`);
        }
    }
    const trustedPaths = [];
    const untrustedPaths = [];
    for (const rule of rules) {
        switch (rule.trustLevel) {
            case TrustLevel.TRUST_FOLDER:
                trustedPaths.push(rule.path);
                break;
            case TrustLevel.TRUST_PARENT:
                trustedPaths.push(path.dirname(rule.path));
                break;
            case TrustLevel.DO_NOT_TRUST:
                untrustedPaths.push(rule.path);
                break;
            default:
                // Do nothing for unknown trust levels.
                break;
        }
    }
    const cwd = process.cwd();
    for (const trustedPath of trustedPaths) {
        if (isWithinRoot(cwd, trustedPath)) {
            return true;
        }
    }
    for (const untrustedPath of untrustedPaths) {
        if (path.normalize(cwd) === path.normalize(untrustedPath)) {
            return false;
        }
    }
    return undefined;
}
//# sourceMappingURL=trustedFolders.js.map