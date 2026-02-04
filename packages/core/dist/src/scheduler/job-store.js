/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "fs/promises";
import * as path from "path";
import * as process from "process";
import { QWEN_DIR } from "../utils/paths.js";
import { DEFAULT_SCHEDULER_CONFIG } from "./types.js";
// Simple file locking using a lock file
const LOCK_FILE = path.join(QWEN_DIR, "cron.lock");
const CRON_FILE = path.join(QWEN_DIR, "cron.json");
const LOGS_DIR = path.join(QWEN_DIR, "logs");
/**
 * Acquire a file lock with timeout
 */
async function acquireLock(timeoutMs = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            // Try to create the lock file with exclusive flag
            const fd = await fs.open(LOCK_FILE, "wx");
            await fd.write(String(process.pid));
            await fd.close();
            return;
        }
        catch (error) {
            // Lock file exists, check if it's stale
            try {
                const pid = parseInt(await fs.readFile(LOCK_FILE, "utf-8"), 10);
                // Check if process is still running (this is platform-specific)
                try {
                    process.kill(pid, 0); // Signal 0 checks if process exists
                }
                catch {
                    // Process doesn't exist, remove stale lock
                    await fs.unlink(LOCK_FILE).catch(() => { });
                    continue;
                }
            }
            catch {
                // Can't read lock file, wait and retry
            }
            // Wait 100ms before retrying
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw new Error("Timeout acquiring lock on cron store");
}
/**
 * Release the file lock
 */
async function releaseLock() {
    try {
        await fs.unlink(LOCK_FILE);
    }
    catch {
        // Ignore errors when releasing lock
    }
}
/**
 * Ensure the QWEN_DIR and logs directory exist
 */
async function ensureDirectories() {
    await fs.mkdir(QWEN_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR, { recursive: true });
}
/**
 * Create an empty cron store
 */
function createEmptyStore() {
    return {
        version: "1.0",
        jobs: [],
        last_modified: new Date().toISOString(),
    };
}
/**
 * Load the cron store from disk
 */
export async function loadStore() {
    await ensureDirectories();
    try {
        const data = await fs.readFile(CRON_FILE, "utf-8");
        const store = JSON.parse(data);
        // Validate basic structure
        if (!store.jobs || !Array.isArray(store.jobs)) {
            return createEmptyStore();
        }
        return store;
    }
    catch (error) {
        // File doesn't exist or is corrupted
        return createEmptyStore();
    }
}
/**
 * Save the cron store to disk
 */
export async function saveStore(store) {
    await ensureDirectories();
    store.last_modified = new Date().toISOString();
    await fs.writeFile(CRON_FILE, JSON.stringify(store, null, 2), "utf-8");
}
/**
 * Execute a function with the store locked
 */
export async function withStore(fn) {
    await acquireLock();
    try {
        const store = await loadStore();
        const result = await fn(store);
        await saveStore(store);
        return result;
    }
    finally {
        await releaseLock();
    }
}
/**
 * Execute a function with the store locked, without saving
 */
export async function withStoreReadOnly(fn) {
    await acquireLock();
    try {
        const store = await loadStore();
        return await fn(store);
    }
    finally {
        await releaseLock();
    }
}
/**
 * Validate a cron expression (5-field format)
 */
export function validateCronExpression(schedule) {
    // Basic validation: 5 fields separated by spaces
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
        return false;
    }
    // Validate each field
    const fieldValidators = [
        // Minute: 0-59 or *
        /^([0-9]|[1-5][0-9]|\*|[0-9]-[0-9]|[0-9]\/[0-9]+|\*\/[0-9]+)$/,
        // Hour: 0-23 or *
        /^([0-9]|1[0-9]|2[0-3]|\*|[0-9]-[0-9]|[0-9]\/[0-9]+|\*\/[0-9]+)$/,
        // Day of month: 1-31 or *
        /^([1-9]|[12][0-9]|3[01]|\*|[1-9]-[1-9]|[1-9]\/[0-9]+|\*\/[0-9]+)$/,
        // Month: 1-12 or *
        /^([1-9]|1[0-2]|\*|[1-9]-[1-9]|[1-9]\/[0-9]+|\*\/[0-9]+)$/,
        // Day of week: 0-6 or *
        /^([0-6]|\*|[0-6]-[0-6]|[0-6]\/[0-9]+|\*\/[0-9]+)$/,
    ];
    for (let i = 0; i < 5; i++) {
        if (!fieldValidators[i].test(parts[i])) {
            return false;
        }
    }
    return true;
}
/**
 * Calculate the next run time for a job based on its cron schedule
 */
export function calculateNextRun(schedule, fromDate = new Date()) {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5)
        return null;
    const [minuteStr, hourStr, dayStr, monthStr, dayOfWeekStr] = parts;
    // Start from the next minute
    const next = new Date(fromDate);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    // Maximum iterations to prevent infinite loops
    const maxIterations = 366 * 24 * 60; // One year in minutes
    let iterations = 0;
    while (iterations < maxIterations) {
        iterations++;
        const minute = next.getMinutes();
        const hour = next.getHours();
        const day = next.getDate();
        const month = next.getMonth() + 1; // 1-12
        const dayOfWeek = next.getDay(); // 0-6
        // Check if current time matches the schedule
        if (matchesField(minuteStr, minute, 0, 59) &&
            matchesField(hourStr, hour, 0, 23) &&
            matchesField(dayStr, day, 1, 31) &&
            matchesField(monthStr, month, 1, 12) &&
            matchesField(dayOfWeekStr, dayOfWeek, 0, 6)) {
            return next;
        }
        // Increment by one minute
        next.setMinutes(next.getMinutes() + 1);
    }
    return null; // Could not find next run time within a year
}
/**
 * Check if a value matches a cron field expression
 */
function matchesField(expression, value, min, max) {
    if (expression === "*")
        return true;
    // Handle step values (e.g., */5 or 0-30/5)
    if (expression.includes("/")) {
        const [range, step] = expression.split("/");
        const stepNum = parseInt(step, 10);
        if (isNaN(stepNum) || stepNum <= 0)
            return false;
        let start = min;
        let end = max;
        if (range !== "*") {
            if (range.includes("-")) {
                const [s, e] = range.split("-").map((n) => parseInt(n, 10));
                start = s;
                end = e;
            }
            else {
                start = parseInt(range, 10);
            }
        }
        for (let i = start; i <= end; i += stepNum) {
            if (i === value)
                return true;
        }
        return false;
    }
    // Handle ranges (e.g., 1-5)
    if (expression.includes("-")) {
        const [start, end] = expression.split("-").map((n) => parseInt(n, 10));
        return value >= start && value <= end;
    }
    // Handle single value
    const num = parseInt(expression, 10);
    return !isNaN(num) && num === value;
}
/**
 * Check if a job is due to run
 */
export function isJobDue(job, now = new Date()) {
    if (!job.enabled)
        return false;
    if (!job.next_run) {
        // Calculate next run if not set
        const next = calculateNextRun(job.schedule, now);
        return next !== null && next <= now;
    }
    const nextRun = new Date(job.next_run);
    return nextRun <= now;
}
/**
 * Create a new job
 */
export async function createJob(params) {
    // Validate cron expression
    if (!validateCronExpression(params.schedule)) {
        throw new Error(`Invalid cron expression: ${params.schedule}`);
    }
    // Validate ID format (URL-safe slug)
    if (!/^[a-zA-Z0-9_-]+$/.test(params.id)) {
        throw new Error(`Invalid job ID: ${params.id}. Must contain only letters, numbers, underscores, and hyphens.`);
    }
    return await withStore(async (store) => {
        // Check max jobs limit
        if (store.jobs.length >= DEFAULT_SCHEDULER_CONFIG.max_jobs) {
            throw new Error(`Maximum number of jobs (${DEFAULT_SCHEDULER_CONFIG.max_jobs}) reached`);
        }
        // Check for duplicate ID
        if (store.jobs.some((j) => j.id === params.id)) {
            throw new Error(`Job with ID '${params.id}' already exists`);
        }
        const now = new Date().toISOString();
        const nextRun = calculateNextRun(params.schedule);
        const job = {
            id: params.id,
            schedule: params.schedule,
            prompt: params.prompt,
            description: params.description,
            enabled: params.enabled ?? true,
            created_at: now,
            last_run: null,
            next_run: nextRun?.toISOString() ?? null,
            run_count: 0,
            error_count: 0,
            status: "scheduled",
            timeout_minutes: params.timeout_minutes ?? DEFAULT_SCHEDULER_CONFIG.default_timeout_minutes,
            max_failures: params.max_failures ?? DEFAULT_SCHEDULER_CONFIG.default_max_failures,
            execution_mode: params.execution_mode,
        };
        store.jobs.push(job);
        return job;
    });
}
/**
 * Get a job by ID
 */
export async function getJob(id) {
    return await withStoreReadOnly(async (store) => {
        return store.jobs.find((j) => j.id === id) ?? null;
    });
}
/**
 * List all jobs
 */
export async function listJobs() {
    return await withStoreReadOnly(async (store) => {
        return [...store.jobs];
    });
}
/**
 * Update an existing job
 */
export async function updateJob(params) {
    return await withStore(async (store) => {
        const index = store.jobs.findIndex((j) => j.id === params.id);
        if (index === -1) {
            throw new Error(`Job with ID '${params.id}' not found`);
        }
        const job = store.jobs[index];
        // Update fields
        if (params.schedule !== undefined) {
            if (!validateCronExpression(params.schedule)) {
                throw new Error(`Invalid cron expression: ${params.schedule}`);
            }
            job.schedule = params.schedule;
            // Recalculate next run
            const nextRun = calculateNextRun(job.schedule);
            job.next_run = nextRun?.toISOString() ?? null;
        }
        if (params.prompt !== undefined) {
            job.prompt = params.prompt;
        }
        if (params.description !== undefined) {
            job.description = params.description;
        }
        if (params.enabled !== undefined) {
            job.enabled = params.enabled;
            if (job.enabled && job.status === "paused") {
                job.status = "scheduled";
            }
        }
        if (params.timeout_minutes !== undefined) {
            job.timeout_minutes = params.timeout_minutes;
        }
        if (params.max_failures !== undefined) {
            job.max_failures = params.max_failures;
        }
        if (params.execution_mode !== undefined) {
            if (params.execution_mode === null) {
                job.execution_mode = undefined;
            }
            else {
                job.execution_mode = params.execution_mode;
            }
        }
        return job;
    });
}
/**
 * Delete a job
 */
export async function deleteJob(id) {
    return await withStore(async (store) => {
        const index = store.jobs.findIndex((j) => j.id === id);
        if (index === -1) {
            return false;
        }
        store.jobs.splice(index, 1);
        return true;
    });
}
/**
 * Pause a job
 */
export async function pauseJob(id) {
    return await withStore(async (store) => {
        const job = store.jobs.find((j) => j.id === id);
        if (!job) {
            throw new Error(`Job with ID '${id}' not found`);
        }
        job.enabled = false;
        if (job.status !== "running") {
            job.status = "paused";
        }
        return job;
    });
}
/**
 * Resume a paused job
 */
export async function resumeJob(id) {
    return await withStore(async (store) => {
        const job = store.jobs.find((j) => j.id === id);
        if (!job) {
            throw new Error(`Job with ID '${id}' not found`);
        }
        job.enabled = true;
        job.status = "scheduled";
        job.error_count = 0; // Reset error count on resume
        // Recalculate next run
        const nextRun = calculateNextRun(job.schedule);
        job.next_run = nextRun?.toISOString() ?? null;
        return job;
    });
}
/**
 * Mark a job as running
 */
export async function markJobRunning(id) {
    return await withStore(async (store) => {
        const job = store.jobs.find((j) => j.id === id);
        if (!job) {
            throw new Error(`Job with ID '${id}' not found`);
        }
        job.status = "running";
        job.last_run = new Date().toISOString();
        return job;
    });
}
/**
 * Mark a job as completed successfully
 */
export async function markJobCompleted(id, executionResult) {
    return await withStore(async (store) => {
        const job = store.jobs.find((j) => j.id === id);
        if (!job) {
            throw new Error(`Job with ID '${id}' not found`);
        }
        job.status = "scheduled";
        job.run_count++;
        // Recalculate next run
        const nextRun = calculateNextRun(job.schedule);
        job.next_run = nextRun?.toISOString() ?? null;
        return job;
    });
}
/**
 * Mark a job as failed
 */
export async function markJobFailed(id, executionResult) {
    return await withStore(async (store) => {
        const job = store.jobs.find((j) => j.id === id);
        if (!job) {
            throw new Error(`Job with ID '${id}' not found`);
        }
        job.error_count++;
        // Auto-pause if max failures reached
        if (job.error_count >= (job.max_failures ?? DEFAULT_SCHEDULER_CONFIG.default_max_failures)) {
            job.status = "error";
            job.enabled = false;
        }
        else {
            job.status = "scheduled";
            // Recalculate next run
            const nextRun = calculateNextRun(job.schedule);
            job.next_run = nextRun?.toISOString() ?? null;
        }
        return job;
    });
}
/**
 * Get jobs that are due to run
 */
export async function getDueJobs(now = new Date()) {
    return await withStoreReadOnly(async (store) => {
        return store.jobs.filter((job) => isJobDue(job, now));
    });
}
/**
 * Get the path for a job execution log file
 */
export function getJobLogPath(jobId, timestamp = Date.now()) {
    return path.join(LOGS_DIR, `${jobId}-${timestamp}.log`);
}
/**
 * Save a job execution result to a log file
 */
export async function saveExecutionLog(result) {
    await ensureDirectories();
    const logPath = getJobLogPath(result.job_id, new Date(result.started_at).getTime());
    await fs.writeFile(logPath, JSON.stringify(result, null, 2), "utf-8");
    return logPath;
}
/**
 * Get recent execution logs for a job
 */
export async function getJobLogs(jobId, limit = 10) {
    try {
        const files = await fs.readdir(LOGS_DIR);
        const jobFiles = files
            .filter((f) => f.startsWith(`${jobId}-`) && f.endsWith(".log"))
            .sort()
            .reverse()
            .slice(0, limit);
        const logs = [];
        for (const file of jobFiles) {
            try {
                const data = await fs.readFile(path.join(LOGS_DIR, file), "utf-8");
                logs.push(JSON.parse(data));
            }
            catch {
                // Skip corrupted log files
            }
        }
        return logs;
    }
    catch {
        return [];
    }
}
/**
 * Clean up old log files
 */
export async function cleanupOldLogs(maxAgeDays = DEFAULT_SCHEDULER_CONFIG.log_retention_days) {
    try {
        const files = await fs.readdir(LOGS_DIR);
        const now = Date.now();
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
        let deleted = 0;
        for (const file of files) {
            if (!file.endsWith(".log"))
                continue;
            const filePath = path.join(LOGS_DIR, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtime.getTime() > maxAgeMs) {
                await fs.unlink(filePath);
                deleted++;
            }
        }
        return deleted;
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=job-store.js.map