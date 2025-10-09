/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from "@qwen-code/qwen-code-core";
import { USER_SETTINGS_PATH } from "./config/settings.js";
import { normalizeAuthType, validateAuthMethod } from "./config/auth.js";
function getAuthTypeFromEnv() {
    if (process.env["GOOGLE_GENAI_USE_GCA"] === "true") {
        return AuthType.LOGIN_WITH_GOOGLE;
    }
    if (process.env["GOOGLE_GENAI_USE_VERTEXAI"] === "true") {
        return AuthType.USE_VERTEX_AI;
    }
    if (process.env["GEMINI_API_KEY"]) {
        return AuthType.USE_GEMINI;
    }
    if (process.env["OPENAI_API_KEY"]) {
        return AuthType.USE_OPENAI;
    }
    return undefined;
}
export async function validateNonInteractiveAuth(configuredAuthType, useExternalAuth, nonInteractiveConfig) {
    const normalizedConfigured = normalizeAuthType(configuredAuthType);
    const effectiveAuthType = normalizedConfigured || getAuthTypeFromEnv();
    if (useExternalAuth && configuredAuthType !== undefined) {
        const externalAuthType = normalizeAuthType(configuredAuthType) ?? configuredAuthType;
        await nonInteractiveConfig.refreshAuth(externalAuthType);
        return nonInteractiveConfig;
    }
    if (!effectiveAuthType) {
        console.error(`Please set an Auth method in your ${USER_SETTINGS_PATH} or specify one of the following environment variables before running: GEMINI_API_KEY, OPENAI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`);
        process.exit(1);
    }
    if (!useExternalAuth) {
        const err = validateAuthMethod(effectiveAuthType);
        if (err != null) {
            console.error(err);
            process.exit(1);
        }
    }
    await nonInteractiveConfig.refreshAuth(effectiveAuthType);
    return nonInteractiveConfig;
}
//# sourceMappingURL=validateNonInterActiveAuth.js.map