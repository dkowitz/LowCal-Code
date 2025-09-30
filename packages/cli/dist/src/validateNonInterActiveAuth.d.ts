/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType, type Config } from "@qwen-code/qwen-code-core";
export declare function validateNonInteractiveAuth(configuredAuthType: AuthType | undefined, useExternalAuth: boolean | undefined, nonInteractiveConfig: Config): Promise<Config>;
