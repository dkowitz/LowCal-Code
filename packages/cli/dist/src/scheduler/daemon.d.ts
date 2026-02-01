/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { type DaemonStatus } from "@qwen-code/qwen-code-core";
/**
 * Check if the daemon is already running
 */
export declare function isDaemonRunning(): Promise<boolean>;
/**
 * Get current daemon status
 */
export declare function getDaemonStatus(): Promise<DaemonStatus>;
/**
 * Stop the daemon
 */
export declare function stopDaemon(): Promise<boolean>;
/**
 * Start the daemon (if not already running)
 */
export declare function startDaemon(): Promise<boolean>;
