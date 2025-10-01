/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { AuthType } from "@qwen-code/qwen-code-core";
interface ModelSourceDescriptor {
    authType?: AuthType;
    providerId?: string;
    baseUrl?: string;
}
export declare function createModelSourceKey(descriptor: ModelSourceDescriptor): string;
export {};
