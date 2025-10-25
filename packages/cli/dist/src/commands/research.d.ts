/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from "yargs";
interface ResearchArgs {
    mode?: string;
    query?: string;
}
export declare function handleResearch(args: ResearchArgs): Promise<void>;
export declare const researchCommand: CommandModule;
export {};
