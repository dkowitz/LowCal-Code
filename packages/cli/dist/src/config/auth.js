/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from '@qwen-code/qwen-code-core';
import { loadEnvironment } from './settings.js';
export const validateAuthMethod = (authMethod) => {
    loadEnvironment();
    if (authMethod === AuthType.LOGIN_WITH_GOOGLE ||
        authMethod === AuthType.CLOUD_SHELL) {
        return null;
    }
    if (authMethod === AuthType.USE_GEMINI) {
        if (!process.env['GEMINI_API_KEY']) {
            return 'GEMINI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!';
        }
        return null;
    }
    if (authMethod === AuthType.USE_VERTEX_AI) {
        const hasVertexProjectLocationConfig = !!process.env['GOOGLE_CLOUD_PROJECT'] &&
            !!process.env['GOOGLE_CLOUD_LOCATION'];
        const hasGoogleApiKey = !!process.env['GOOGLE_API_KEY'];
        if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
            return ('When using Vertex AI, you must specify either:\n' +
                '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
                '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
                'Update your environment and try again (no reload needed if using .env)!');
        }
        return null;
    }
    if (authMethod === AuthType.USE_OPENAI) {
        if (!process.env['OPENAI_API_KEY']) {
            return 'OPENAI_API_KEY environment variable not found. You can enter it interactively or add it to your .env file.';
        }
        return null;
    }
    if (authMethod === AuthType.QWEN_OAUTH) {
        // Qwen OAuth doesn't require any environment variables for basic setup
        // The OAuth flow will handle authentication
        return null;
    }
    return 'Invalid auth method selected.';
};
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { GEMINI_CONFIG_DIR as GEMINI_DIR } from '@qwen-code/qwen-code-core';
function getEnvFilePath() {
    // Search upward from cwd for a project .env or .qwen/.env, otherwise use home fallback.
    let currentDir = path.resolve(process.cwd());
    while (true) {
        const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
        const geminiDirPath = path.join(currentDir, GEMINI_DIR);
        // Prefer a project-level GEMINI_DIR/.env if the GEMINI_DIR exists in the
        // workspace even if the .env file hasn't been created yet. This makes the
        // CLI write credentials into the workspace-scoped .qwen/.env when the
        // workspace is present.
        if (fs.existsSync(geminiEnvPath) || fs.existsSync(geminiDirPath))
            return geminiEnvPath;
        const envPath = path.join(currentDir, '.env');
        if (fs.existsSync(envPath))
            return envPath;
        const parent = path.dirname(currentDir);
        if (!parent || parent === currentDir)
            break;
        currentDir = parent;
    }
    // Fallbacks in home directory
    const homeGeminiEnv = path.join(homedir(), GEMINI_DIR, '.env');
    if (fs.existsSync(homeGeminiEnv))
        return homeGeminiEnv;
    const homeEnv = path.join(homedir(), '.env');
    return homeEnv;
}
function setEnvVarAndPersist(key, value) {
    process.env[key] = value;
    const envPath = getEnvFilePath();
    let lines = [];
    if (fs.existsSync(envPath)) {
        lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
    }
    let found = false;
    const newLines = lines.map((line) => {
        if (line.startsWith(key + '=')) {
            found = true;
            return `${key}=${value}`;
        }
        return line;
    });
    if (!found) {
        newLines.push(`${key}=${value}`);
    }
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, newLines.filter(Boolean).join('\n'), 'utf-8');
    return envPath;
}
export const setOpenAIApiKey = (apiKey) => {
    return setEnvVarAndPersist('OPENAI_API_KEY', apiKey);
};
export const setOpenAIBaseUrl = (baseUrl) => {
    return setEnvVarAndPersist('OPENAI_BASE_URL', baseUrl);
};
export const setOpenAIModel = (model) => {
    return setEnvVarAndPersist('OPENAI_MODEL', model);
};
//# sourceMappingURL=auth.js.map