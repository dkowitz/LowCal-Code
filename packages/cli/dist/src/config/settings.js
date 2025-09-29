/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir, platform } from 'node:os';
import * as dotenv from 'dotenv';
import { GEMINI_CONFIG_DIR as GEMINI_DIR, getErrorMessage, Storage, } from '@qwen-code/qwen-code-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import { mergeWith } from 'lodash-es';
export const SETTINGS_DIRECTORY_NAME = '.qwen';
export const USER_SETTINGS_PATH = Storage.getGlobalSettingsPath();
export const USER_SETTINGS_DIR = path.dirname(USER_SETTINGS_PATH);
export const DEFAULT_EXCLUDED_ENV_VARS = ['DEBUG', 'DEBUG_MODE'];
const MIGRATE_V2_OVERWRITE = false;
const MIGRATION_MAP = {
    preferredEditor: 'general.preferredEditor',
    vimMode: 'general.vimMode',
    disableAutoUpdate: 'general.disableAutoUpdate',
    disableUpdateNag: 'general.disableUpdateNag',
    checkpointing: 'general.checkpointing',
    theme: 'ui.theme',
    customThemes: 'ui.customThemes',
    hideWindowTitle: 'ui.hideWindowTitle',
    hideTips: 'ui.hideTips',
    hideBanner: 'ui.hideBanner',
    hideFooter: 'ui.hideFooter',
    showMemoryUsage: 'ui.showMemoryUsage',
    showLineNumbers: 'ui.showLineNumbers',
    accessibility: 'ui.accessibility',
    ideMode: 'ide.enabled',
    hasSeenIdeIntegrationNudge: 'ide.hasSeenNudge',
    usageStatisticsEnabled: 'privacy.usageStatisticsEnabled',
    telemetry: 'telemetry',
    model: 'model.name',
    maxSessionTurns: 'model.maxSessionTurns',
    summarizeToolOutput: 'model.summarizeToolOutput',
    chatCompression: 'model.chatCompression',
    skipNextSpeakerCheck: 'model.skipNextSpeakerCheck',
    contextFileName: 'context.fileName',
    memoryImportFormat: 'context.importFormat',
    memoryDiscoveryMaxDirs: 'context.discoveryMaxDirs',
    includeDirectories: 'context.includeDirectories',
    loadMemoryFromIncludeDirectories: 'context.loadFromIncludeDirectories',
    fileFiltering: 'context.fileFiltering',
    sandbox: 'tools.sandbox',
    shouldUseNodePtyShell: 'tools.usePty',
    allowedTools: 'tools.allowed',
    coreTools: 'tools.core',
    excludeTools: 'tools.exclude',
    toolDiscoveryCommand: 'tools.discoveryCommand',
    toolCallCommand: 'tools.callCommand',
    mcpServerCommand: 'mcp.serverCommand',
    allowMCPServers: 'mcp.allowed',
    excludeMCPServers: 'mcp.excluded',
    folderTrustFeature: 'security.folderTrust.featureEnabled',
    folderTrust: 'security.folderTrust.enabled',
    selectedAuthType: 'security.auth.selectedType',
    useExternalAuth: 'security.auth.useExternal',
    autoConfigureMaxOldSpaceSize: 'advanced.autoConfigureMemory',
    dnsResolutionOrder: 'advanced.dnsResolutionOrder',
    excludedProjectEnvVars: 'advanced.excludedEnvVars',
    bugCommand: 'advanced.bugCommand',
};
export function getSystemSettingsPath() {
    if (process.env['QWEN_CODE_SYSTEM_SETTINGS_PATH']) {
        return process.env['QWEN_CODE_SYSTEM_SETTINGS_PATH'];
    }
    if (platform() === 'darwin') {
        return '/Library/Application Support/QwenCode/settings.json';
    }
    else if (platform() === 'win32') {
        return 'C:\\ProgramData\\qwen-code\\settings.json';
    }
    else {
        return '/etc/qwen-code/settings.json';
    }
}
export function getSystemDefaultsPath() {
    if (process.env['QWEN_CODE_SYSTEM_DEFAULTS_PATH']) {
        return process.env['QWEN_CODE_SYSTEM_DEFAULTS_PATH'];
    }
    return path.join(path.dirname(getSystemSettingsPath()), 'system-defaults.json');
}
export var SettingScope;
(function (SettingScope) {
    SettingScope["User"] = "User";
    SettingScope["Workspace"] = "Workspace";
    SettingScope["System"] = "System";
    SettingScope["SystemDefaults"] = "SystemDefaults";
})(SettingScope || (SettingScope = {}));
function setNestedProperty(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    if (!lastKey)
        return;
    let current = obj;
    for (const key of keys) {
        if (current[key] === undefined) {
            current[key] = {};
        }
        const next = current[key];
        if (typeof next === 'object' && next !== null) {
            current = next;
        }
        else {
            // This path is invalid, so we stop.
            return;
        }
    }
    current[lastKey] = value;
}
function needsMigration(settings) {
    return !('general' in settings);
}
function migrateSettingsToV2(flatSettings) {
    if (!needsMigration(flatSettings)) {
        return null;
    }
    const v2Settings = {};
    const flatKeys = new Set(Object.keys(flatSettings));
    for (const [oldKey, newPath] of Object.entries(MIGRATION_MAP)) {
        if (flatKeys.has(oldKey)) {
            setNestedProperty(v2Settings, newPath, flatSettings[oldKey]);
            flatKeys.delete(oldKey);
        }
    }
    // Preserve mcpServers at the top level
    if (flatSettings['mcpServers']) {
        v2Settings['mcpServers'] = flatSettings['mcpServers'];
        flatKeys.delete('mcpServers');
    }
    // Carry over any unrecognized keys
    for (const remainingKey of flatKeys) {
        v2Settings[remainingKey] = flatSettings[remainingKey];
    }
    return v2Settings;
}
function getNestedProperty(obj, path) {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (typeof current !== 'object' || current === null || !(key in current)) {
            return undefined;
        }
        current = current[key];
    }
    return current;
}
const REVERSE_MIGRATION_MAP = Object.fromEntries(Object.entries(MIGRATION_MAP).map(([key, value]) => [value, key]));
// Dynamically determine the top-level keys from the V2 settings structure.
const KNOWN_V2_CONTAINERS = new Set(Object.values(MIGRATION_MAP).map((path) => path.split('.')[0]));
export function migrateSettingsToV1(v2Settings) {
    const v1Settings = {};
    const v2Keys = new Set(Object.keys(v2Settings));
    for (const [newPath, oldKey] of Object.entries(REVERSE_MIGRATION_MAP)) {
        const value = getNestedProperty(v2Settings, newPath);
        if (value !== undefined) {
            v1Settings[oldKey] = value;
            v2Keys.delete(newPath.split('.')[0]);
        }
    }
    // Preserve mcpServers at the top level
    if (v2Settings['mcpServers']) {
        v1Settings['mcpServers'] = v2Settings['mcpServers'];
        v2Keys.delete('mcpServers');
    }
    // Carry over any unrecognized keys
    for (const remainingKey of v2Keys) {
        const value = v2Settings[remainingKey];
        if (value === undefined) {
            continue;
        }
        // Don't carry over empty objects that were just containers for migrated settings.
        if (KNOWN_V2_CONTAINERS.has(remainingKey) &&
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            Object.keys(value).length === 0) {
            continue;
        }
        v1Settings[remainingKey] = value;
    }
    return v1Settings;
}
function mergeSettings(system, systemDefaults, user, workspace, isTrusted) {
    // Normalize legacy `model` stored as a flat string to the newer shape
    // { model: { name: string } } so downstream code can always read
    // settings.model?.name.
    function normalizeLegacyModel(s) {
        if (!s)
            return s;
        try {
            const asAny = s;
            if (typeof asAny.model === 'string') {
                return { ...s, model: { ...(s.model ? {} : {}), name: asAny.model } };
            }
        }
        catch (_e) {
            // ignore
        }
        return s;
    }
    system = normalizeLegacyModel(system) || {};
    systemDefaults = normalizeLegacyModel(systemDefaults) || {};
    user = normalizeLegacyModel(user) || {};
    workspace = normalizeLegacyModel(workspace) || {};
    const safeWorkspace = isTrusted ? workspace : {};
    // folderTrust is not supported at workspace level.
    const { security, ...restOfWorkspace } = safeWorkspace;
    const safeWorkspaceWithoutFolderTrust = security
        ? {
            ...restOfWorkspace,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            security: (({ folderTrust, ...rest }) => rest)(security),
        }
        : {
            ...restOfWorkspace,
            security: {},
        };
    // Settings are merged with the following precedence (last one wins for
    // single values):
    // 1. System Defaults
    // 2. User Settings
    // 3. Workspace Settings
    // 4. System Settings (as overrides)
    //
    // For properties that are arrays (e.g., includeDirectories), the arrays
    // are concatenated. For objects (e.g., customThemes), they are merged.
    return {
        ...systemDefaults,
        ...user,
        ...safeWorkspaceWithoutFolderTrust,
        ...system,
        general: {
            ...(systemDefaults.general || {}),
            ...(user.general || {}),
            ...(safeWorkspaceWithoutFolderTrust.general || {}),
            ...(system.general || {}),
        },
        ui: {
            ...(systemDefaults.ui || {}),
            ...(user.ui || {}),
            ...(safeWorkspaceWithoutFolderTrust.ui || {}),
            ...(system.ui || {}),
            customThemes: {
                ...(systemDefaults.ui?.customThemes || {}),
                ...(user.ui?.customThemes || {}),
                ...(safeWorkspaceWithoutFolderTrust.ui?.customThemes || {}),
                ...(system.ui?.customThemes || {}),
            },
        },
        ide: {
            ...(systemDefaults.ide || {}),
            ...(user.ide || {}),
            ...(safeWorkspaceWithoutFolderTrust.ide || {}),
            ...(system.ide || {}),
        },
        privacy: {
            ...(systemDefaults.privacy || {}),
            ...(user.privacy || {}),
            ...(safeWorkspaceWithoutFolderTrust.privacy || {}),
            ...(system.privacy || {}),
        },
        telemetry: {
            ...(systemDefaults.telemetry || {}),
            ...(user.telemetry || {}),
            ...(safeWorkspaceWithoutFolderTrust.telemetry || {}),
            ...(system.telemetry || {}),
        },
        security: {
            ...(systemDefaults.security || {}),
            ...(user.security || {}),
            ...(safeWorkspaceWithoutFolderTrust.security || {}),
            ...(system.security || {}),
        },
        mcp: {
            ...(systemDefaults.mcp || {}),
            ...(user.mcp || {}),
            ...(safeWorkspaceWithoutFolderTrust.mcp || {}),
            ...(system.mcp || {}),
        },
        mcpServers: {
            ...(systemDefaults.mcpServers || {}),
            ...(user.mcpServers || {}),
            ...(safeWorkspaceWithoutFolderTrust.mcpServers || {}),
            ...(system.mcpServers || {}),
        },
        tools: {
            ...(systemDefaults.tools || {}),
            ...(user.tools || {}),
            ...(safeWorkspaceWithoutFolderTrust.tools || {}),
            ...(system.tools || {}),
        },
        context: {
            ...(systemDefaults.context || {}),
            ...(user.context || {}),
            ...(safeWorkspaceWithoutFolderTrust.context || {}),
            ...(system.context || {}),
            includeDirectories: [
                ...(systemDefaults.context?.includeDirectories || []),
                ...(user.context?.includeDirectories || []),
                ...(safeWorkspaceWithoutFolderTrust.context?.includeDirectories || []),
                ...(system.context?.includeDirectories || []),
            ],
        },
        model: {
            ...(systemDefaults.model || {}),
            ...(user.model || {}),
            ...(safeWorkspaceWithoutFolderTrust.model || {}),
            ...(system.model || {}),
            chatCompression: {
                ...(systemDefaults.model?.chatCompression || {}),
                ...(user.model?.chatCompression || {}),
                ...(safeWorkspaceWithoutFolderTrust.model?.chatCompression || {}),
                ...(system.model?.chatCompression || {}),
            },
        },
        advanced: {
            ...(systemDefaults.advanced || {}),
            ...(user.advanced || {}),
            ...(safeWorkspaceWithoutFolderTrust.advanced || {}),
            ...(system.advanced || {}),
            excludedEnvVars: [
                ...new Set([
                    ...(systemDefaults.advanced?.excludedEnvVars || []),
                    ...(user.advanced?.excludedEnvVars || []),
                    ...(safeWorkspaceWithoutFolderTrust.advanced?.excludedEnvVars || []),
                    ...(system.advanced?.excludedEnvVars || []),
                ]),
            ],
        },
        experimental: {
            ...(systemDefaults.experimental || {}),
            ...(user.experimental || {}),
            ...(safeWorkspaceWithoutFolderTrust.experimental || {}),
            ...(system.experimental || {}),
        },
        contentGenerator: {
            ...(systemDefaults.contentGenerator || {}),
            ...(user.contentGenerator || {}),
            ...(safeWorkspaceWithoutFolderTrust.contentGenerator || {}),
            ...(system.contentGenerator || {}),
        },
        systemPromptMappings: {
            ...(systemDefaults.systemPromptMappings || {}),
            ...(user.systemPromptMappings || {}),
            ...(safeWorkspaceWithoutFolderTrust.systemPromptMappings || {}),
            ...(system.systemPromptMappings || {}),
        },
        extensions: {
            ...(systemDefaults.extensions || {}),
            ...(user.extensions || {}),
            ...(safeWorkspaceWithoutFolderTrust.extensions || {}),
            ...(system.extensions || {}),
            disabled: [
                ...new Set([
                    ...(systemDefaults.extensions?.disabled || []),
                    ...(user.extensions?.disabled || []),
                    ...(safeWorkspaceWithoutFolderTrust.extensions?.disabled || []),
                    ...(system.extensions?.disabled || []),
                ]),
            ],
            workspacesWithMigrationNudge: [
                ...new Set([
                    ...(systemDefaults.extensions?.workspacesWithMigrationNudge || []),
                    ...(user.extensions?.workspacesWithMigrationNudge || []),
                    ...(safeWorkspaceWithoutFolderTrust.extensions
                        ?.workspacesWithMigrationNudge || []),
                    ...(system.extensions?.workspacesWithMigrationNudge || []),
                ]),
            ],
        },
    };
}
export class LoadedSettings {
    constructor(system, systemDefaults, user, workspace, errors, isTrusted, migratedInMemorScopes) {
        this.system = system;
        this.systemDefaults = systemDefaults;
        this.user = user;
        this.workspace = workspace;
        this.errors = errors;
        this.isTrusted = isTrusted;
        this.migratedInMemorScopes = migratedInMemorScopes;
        this._merged = this.computeMergedSettings();
    }
    system;
    systemDefaults;
    user;
    workspace;
    errors;
    isTrusted;
    migratedInMemorScopes;
    _merged;
    get merged() {
        return this._merged;
    }
    computeMergedSettings() {
        return mergeSettings(this.system.settings, this.systemDefaults.settings, this.user.settings, this.workspace.settings, this.isTrusted);
    }
    forScope(scope) {
        switch (scope) {
            case SettingScope.User:
                return this.user;
            case SettingScope.Workspace:
                return this.workspace;
            case SettingScope.System:
                return this.system;
            case SettingScope.SystemDefaults:
                return this.systemDefaults;
            default:
                throw new Error(`Invalid scope: ${scope}`);
        }
    }
    setValue(scope, key, value) {
        const settingsFile = this.forScope(scope);
        setNestedProperty(settingsFile.settings, key, value);
        this._merged = this.computeMergedSettings();
        saveSettings(settingsFile);
    }
}
function resolveEnvVarsInString(value) {
    const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
    return value.replace(envVarRegex, (match, varName1, varName2) => {
        const varName = varName1 || varName2;
        if (process && process.env && typeof process.env[varName] === 'string') {
            return process.env[varName];
        }
        return match;
    });
}
function resolveEnvVarsInObject(obj) {
    if (obj === null ||
        obj === undefined ||
        typeof obj === 'boolean' ||
        typeof obj === 'number') {
        return obj;
    }
    if (typeof obj === 'string') {
        return resolveEnvVarsInString(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => resolveEnvVarsInObject(item));
    }
    if (typeof obj === 'object') {
        const newObj = { ...obj };
        for (const key in newObj) {
            if (Object.prototype.hasOwnProperty.call(newObj, key)) {
                newObj[key] = resolveEnvVarsInObject(newObj[key]);
            }
        }
        return newObj;
    }
    return obj;
}
function findEnvFile(startDir) {
    let currentDir = path.resolve(startDir);
    while (true) {
        // prefer gemini-specific .env under GEMINI_DIR
        const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
        if (fs.existsSync(geminiEnvPath)) {
            return geminiEnvPath;
        }
        const envPath = path.join(currentDir, '.env');
        if (fs.existsSync(envPath)) {
            return envPath;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir || !parentDir) {
            // check .env under home as fallback, again preferring gemini-specific .env
            const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
            if (fs.existsSync(homeGeminiEnvPath)) {
                return homeGeminiEnvPath;
            }
            const homeEnvPath = path.join(homedir(), '.env');
            if (fs.existsSync(homeEnvPath)) {
                return homeEnvPath;
            }
            return null;
        }
        currentDir = parentDir;
    }
}
export function setUpCloudShellEnvironment(envFilePath) {
    // Special handling for GOOGLE_CLOUD_PROJECT in Cloud Shell:
    // Because GOOGLE_CLOUD_PROJECT in Cloud Shell tracks the project
    // set by the user using "gcloud config set project" we do not want to
    // use its value. So, unless the user overrides GOOGLE_CLOUD_PROJECT in
    // one of the .env files, we set the Cloud Shell-specific default here.
    if (envFilePath && fs.existsSync(envFilePath)) {
        const envFileContent = fs.readFileSync(envFilePath);
        const parsedEnv = dotenv.parse(envFileContent);
        if (parsedEnv['GOOGLE_CLOUD_PROJECT']) {
            // .env file takes precedence in Cloud Shell
            process.env['GOOGLE_CLOUD_PROJECT'] = parsedEnv['GOOGLE_CLOUD_PROJECT'];
        }
        else {
            // If not in .env, set to default and override global
            process.env['GOOGLE_CLOUD_PROJECT'] = 'cloudshell-gca';
        }
    }
    else {
        // If no .env file, set to default and override global
        process.env['GOOGLE_CLOUD_PROJECT'] = 'cloudshell-gca';
    }
}
export function loadEnvironment(settings) {
    const envFilePath = findEnvFile(process.cwd());
    // Cloud Shell environment variable handling
    if (process.env['CLOUD_SHELL'] === 'true') {
        setUpCloudShellEnvironment(envFilePath);
    }
    // If no settings provided, try to load workspace settings for exclusions
    let resolvedSettings = settings;
    if (!resolvedSettings) {
        const workspaceSettingsPath = new Storage(process.cwd()).getWorkspaceSettingsPath();
        try {
            if (fs.existsSync(workspaceSettingsPath)) {
                const workspaceContent = fs.readFileSync(workspaceSettingsPath, 'utf-8');
                const parsedWorkspaceSettings = JSON.parse(stripJsonComments(workspaceContent));
                resolvedSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
            }
        }
        catch (_e) {
            // Ignore errors loading workspace settings
        }
    }
    if (envFilePath) {
        // Manually parse and load environment variables to handle exclusions correctly.
        // This avoids modifying environment variables that were already set from the shell.
        try {
            const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
            const parsedEnv = dotenv.parse(envFileContent);
            const excludedVars = resolvedSettings?.advanced?.excludedEnvVars ||
                DEFAULT_EXCLUDED_ENV_VARS;
            const isProjectEnvFile = !envFilePath.includes(GEMINI_DIR);
            for (const key in parsedEnv) {
                if (Object.hasOwn(parsedEnv, key)) {
                    // If it's a project .env file, skip loading excluded variables.
                    if (isProjectEnvFile && excludedVars.includes(key)) {
                        continue;
                    }
                    // Load variable only if it's not already set in the environment.
                    if (!Object.hasOwn(process.env, key)) {
                        process.env[key] = parsedEnv[key];
                    }
                }
            }
        }
        catch (_e) {
            // Errors are ignored to match the behavior of `dotenv.config({ quiet: true })`.
        }
    }
}
/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export function loadSettings(workspaceDir) {
    let systemSettings = {};
    let systemDefaultSettings = {};
    let userSettings = {};
    let workspaceSettings = {};
    const settingsErrors = [];
    const systemSettingsPath = getSystemSettingsPath();
    const systemDefaultsPath = getSystemDefaultsPath();
    const migratedInMemorScopes = new Set();
    // Resolve paths to their canonical representation to handle symlinks
    const resolvedWorkspaceDir = path.resolve(workspaceDir);
    const resolvedHomeDir = path.resolve(homedir());
    let realWorkspaceDir = resolvedWorkspaceDir;
    try {
        // fs.realpathSync gets the "true" path, resolving any symlinks
        realWorkspaceDir = fs.realpathSync(resolvedWorkspaceDir);
    }
    catch (_e) {
        // This is okay. The path might not exist yet, and that's a valid state.
    }
    // We expect homedir to always exist and be resolvable.
    const realHomeDir = fs.realpathSync(resolvedHomeDir);
    const workspaceSettingsPath = new Storage(workspaceDir).getWorkspaceSettingsPath();
    const loadAndMigrate = (filePath, scope) => {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const rawSettings = JSON.parse(stripJsonComments(content));
                if (typeof rawSettings !== 'object' ||
                    rawSettings === null ||
                    Array.isArray(rawSettings)) {
                    settingsErrors.push({
                        message: 'Settings file is not a valid JSON object.',
                        path: filePath,
                    });
                    return {};
                }
                let settingsObject = rawSettings;
                if (needsMigration(settingsObject)) {
                    const migratedSettings = migrateSettingsToV2(settingsObject);
                    if (migratedSettings) {
                        if (MIGRATE_V2_OVERWRITE) {
                            try {
                                fs.renameSync(filePath, `${filePath}.orig`);
                                fs.writeFileSync(filePath, JSON.stringify(migratedSettings, null, 2), 'utf-8');
                            }
                            catch (e) {
                                console.error(`Error migrating settings file on disk: ${getErrorMessage(e)}`);
                            }
                        }
                        else {
                            migratedInMemorScopes.add(scope);
                        }
                        settingsObject = migratedSettings;
                    }
                }
                return settingsObject;
            }
        }
        catch (error) {
            settingsErrors.push({
                message: getErrorMessage(error),
                path: filePath,
            });
        }
        return {};
    };
    systemSettings = loadAndMigrate(systemSettingsPath, SettingScope.System);
    systemDefaultSettings = loadAndMigrate(systemDefaultsPath, SettingScope.SystemDefaults);
    userSettings = loadAndMigrate(USER_SETTINGS_PATH, SettingScope.User);
    if (realWorkspaceDir !== realHomeDir) {
        workspaceSettings = loadAndMigrate(workspaceSettingsPath, SettingScope.Workspace);
    }
    // Support legacy theme names
    if (userSettings.ui?.theme === 'VS') {
        userSettings.ui.theme = DefaultLight.name;
    }
    else if (userSettings.ui?.theme === 'VS2015') {
        userSettings.ui.theme = DefaultDark.name;
    }
    if (workspaceSettings.ui?.theme === 'VS') {
        workspaceSettings.ui.theme = DefaultLight.name;
    }
    else if (workspaceSettings.ui?.theme === 'VS2015') {
        workspaceSettings.ui.theme = DefaultDark.name;
    }
    // For the initial trust check, we can only use user and system settings.
    const initialTrustCheckSettings = mergeWith({}, systemSettings, userSettings);
    const isTrusted = isWorkspaceTrusted(initialTrustCheckSettings) ?? true;
    // Create a temporary merged settings object to pass to loadEnvironment.
    const tempMergedSettings = mergeSettings(systemSettings, systemDefaultSettings, userSettings, workspaceSettings, isTrusted);
    // loadEnviroment depends on settings so we have to create a temp version of
    // the settings to avoid a cycle
    loadEnvironment(tempMergedSettings);
    // Now that the environment is loaded, resolve variables in the settings.
    systemSettings = resolveEnvVarsInObject(systemSettings);
    userSettings = resolveEnvVarsInObject(userSettings);
    workspaceSettings = resolveEnvVarsInObject(workspaceSettings);
    // Create LoadedSettings first
    const loadedSettings = new LoadedSettings({
        path: systemSettingsPath,
        settings: systemSettings,
    }, {
        path: systemDefaultsPath,
        settings: systemDefaultSettings,
    }, {
        path: USER_SETTINGS_PATH,
        settings: userSettings,
    }, {
        path: workspaceSettingsPath,
        settings: workspaceSettings,
    }, settingsErrors, isTrusted, migratedInMemorScopes);
    return loadedSettings;
}
export function saveSettings(settingsFile) {
    try {
        // Ensure the directory exists
        const dirPath = path.dirname(settingsFile.path);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        let settingsToSave = settingsFile.settings;
        if (!MIGRATE_V2_OVERWRITE) {
            settingsToSave = migrateSettingsToV1(settingsToSave);
        }
        fs.writeFileSync(settingsFile.path, JSON.stringify(settingsToSave, null, 2), 'utf-8');
    }
    catch (error) {
        console.error('Error saving user settings file:', error);
    }
}
//# sourceMappingURL=settings.js.map