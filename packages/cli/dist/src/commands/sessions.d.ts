/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * CLI commands for managing LowCal sessions
 */
import type { CommandModule } from "yargs";
type SessionsArgs = {
    ttl?: number;
    id?: string;
    watch?: boolean;
    interval?: number;
};
export declare const sessionsCommand: CommandModule<SessionsArgs, SessionsArgs>;
export {};
