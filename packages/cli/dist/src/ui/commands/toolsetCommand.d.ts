/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SlashCommand } from "./types.js";
/**
 * `/toolset` – Manage tool collections used by the concise/full prompt logic.
 *
 * Sub-commands:
 *   /toolset list                     – show all collection names
 *   /toolset show <name>              – display tools in a collection
 *   /toolset activate <name>          – set activeCollection
 *   /toolset create <name> [tools...] – create a new collection (optional tool list)
 *   /toolset add <name> <tool>        – add a tool to an existing collection
 *   /toolset remove <name> <tool>     – remove a tool from a collection
 */
export declare const toolsetCommand: SlashCommand;
