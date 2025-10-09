/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from "@qwen-code/qwen-code-core";
export declare function normalizeAuthType(authMethod: string | AuthType | undefined): AuthType | undefined;
export declare const validateAuthMethod: (authMethod: string | AuthType | undefined) => string | null;
export declare const setOpenAIApiKey: (apiKey: string) => string;
export declare const setOpenAIBaseUrl: (baseUrl: string) => string;
export declare const setOpenAIModel: (model: string) => string;
