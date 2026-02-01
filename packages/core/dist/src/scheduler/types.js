/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG = {
    tick_interval_ms: 60000, // 1 minute
    max_concurrent_jobs: 5,
    default_timeout_minutes: 10,
    default_max_failures: 3,
    max_jobs: 100,
    max_executions_per_minute: 1,
    log_retention_days: 30,
    logs_per_job: 10,
};
//# sourceMappingURL=types.js.map