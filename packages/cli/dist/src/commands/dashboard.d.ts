/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * CLI command for viewing a dashboard of sessions and scheduler status
 */
import type { CommandModule } from "yargs";
type DashboardArgs = {
    ttl?: number;
    watch?: boolean;
    interval?: number;
};
declare const dashboardCommand: CommandModule<DashboardArgs, DashboardArgs>;
export { dashboardCommand };
