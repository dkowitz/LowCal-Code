/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CronStore, Job, JobExecutionResult, CreateJobParams, UpdateJobParams } from "./types.js";
/**
 * Load the cron store from disk
 */
export declare function loadStore(): Promise<CronStore>;
/**
 * Save the cron store to disk
 */
export declare function saveStore(store: CronStore): Promise<void>;
/**
 * Execute a function with the store locked
 */
export declare function withStore<T>(fn: (store: CronStore) => Promise<T>): Promise<T>;
/**
 * Execute a function with the store locked, without saving
 */
export declare function withStoreReadOnly<T>(fn: (store: CronStore) => Promise<T>): Promise<T>;
/**
 * Validate a cron expression (5-field format)
 */
export declare function validateCronExpression(schedule: string): boolean;
/**
 * Calculate the next run time for a job based on its cron schedule
 */
export declare function calculateNextRun(schedule: string, fromDate?: Date): Date | null;
/**
 * Check if a job is due to run
 */
export declare function isJobDue(job: Job, now?: Date): boolean;
/**
 * Create a new job
 */
export declare function createJob(params: CreateJobParams): Promise<Job>;
/**
 * Get a job by ID
 */
export declare function getJob(id: string): Promise<Job | null>;
/**
 * List all jobs
 */
export declare function listJobs(): Promise<Job[]>;
/**
 * Update an existing job
 */
export declare function updateJob(params: UpdateJobParams): Promise<Job>;
/**
 * Delete a job
 */
export declare function deleteJob(id: string): Promise<boolean>;
/**
 * Pause a job
 */
export declare function pauseJob(id: string): Promise<Job>;
/**
 * Reset a job after failures (re-enable and clear error counters)
 */
export declare function resetJob(id: string): Promise<Job>;
/**
 * Resume a paused job
 */
export declare function resumeJob(id: string): Promise<Job>;
/**
 * Mark a job as running
 */
export declare function markJobRunning(id: string): Promise<Job>;
/**
 * Mark a job as completed successfully
 */
export declare function markJobCompleted(id: string, executionResult: JobExecutionResult): Promise<Job>;
/**
 * Mark a job as failed
 */
export declare function markJobFailed(id: string, executionResult: JobExecutionResult): Promise<Job>;
/**
 * Get jobs that are due to run
 */
export declare function getDueJobs(now?: Date): Promise<Job[]>;
/**
 * Get the path for a job execution log file
 */
export declare function getJobLogPath(jobId: string, timestamp?: number): string;
/**
 * Save a job execution result to a log file
 */
export declare function saveExecutionLog(result: JobExecutionResult): Promise<string>;
/**
 * Get recent execution logs for a job
 */
export declare function getJobLogs(jobId: string, limit?: number): Promise<JobExecutionResult[]>;
/**
 * Clean up old log files
 */
export declare function cleanupOldLogs(maxAgeDays?: number): Promise<number>;
