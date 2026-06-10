/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from "@qwen-code/qwen-code-core";
export declare const LM_STUDIO_DUMMY_KEY = "lmstudio-local-key";
export declare const LLAMA_CPP_DUMMY_KEY = "llamacpp-local-key";
export type AuthSettingsForValidation = {
    selectedType?: string | AuthType;
    providerId?: string;
    providers?: Record<string, {
        apiKey?: string;
        baseUrl?: string;
        modelsDir?: string;
    }>;
};
export declare function isLocalOpenAIPlaceholderKey(apiKey: string | undefined): boolean;
export declare function getRemoteOpenAIApiKey(...candidates: Array<string | undefined>): string | undefined;
export declare function applyConfiguredAuthToEnv(authSettings: AuthSettingsForValidation | undefined): void;
export declare function isLmStudioOpenAIEnvironment(apiKey?: string | undefined, baseUrl?: string | undefined): boolean;
export declare function normalizeAuthType(authMethod: string | AuthType | undefined): AuthType | undefined;
export declare const validateAuthMethod: (authMethod: string | AuthType | undefined, authSettings?: AuthSettingsForValidation) => string | null;
export declare const setOpenAIApiKey: (apiKey: string) => string;
export declare const setOpenAIBaseUrl: (baseUrl: string) => string;
export declare const setOpenAIModel: (model: string) => string;
export declare const setGeminiApiKey: (apiKey: string) => string;
export declare const setLlamaCppModelsDir: (modelsDir: string) => string;
export declare const setLlamaCppPort: (port: string) => string;
export declare const setLlamaCppModel: (model: string) => string;
export declare const setLlamaCppBinaryPath: (binaryPath: string) => string;
export declare const setLlamaCppBackend: (backend: string) => string;
