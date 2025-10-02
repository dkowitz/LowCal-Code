/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from '@qwen-code/qwen-code-core';
import type { LoadedSettings } from '../config/settings.js';
import type { CliArgs } from '../config/config.js';
import type { Extension } from '../config/extension.js';
export declare function runZedIntegration(config: Config, settings: LoadedSettings, extensions: Extension[], argv: CliArgs): Promise<void>;
