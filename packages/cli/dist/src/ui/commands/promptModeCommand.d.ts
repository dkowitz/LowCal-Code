/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SlashCommand } from "./types.js";
/**
 * `/promptmode` – Switch between automatic, full, or concise system prompts.
 *
 * Usage:
 *   /promptmode            – shows the current mode.
 *   /promptmode set <mode> – sets the mode (`auto`, `full`, or `concise`).
 */
export declare const promptModeCommand: SlashCommand;
