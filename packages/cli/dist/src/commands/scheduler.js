/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as process from "process";
import { isDaemonRunning, getDaemonStatus, startDaemon, stopDaemon, } from "../scheduler/daemon.js";
import { listJobs, getJob, getJobLogs, } from "@qwen-code/qwen-code-core";
/**
 * Format a job for display
 */
function formatJob(job) {
    const statusIcon = job.enabled ? "🟢" : "🔴";
    const statusText = job.status === "running" ? " (running)" : "";
    let output = `${statusIcon} ${job.id}${statusText}\n`;
    output += `   Schedule: ${job.schedule}\n`;
    output += `   Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
    output += `   Last run: ${job.last_run ? new Date(job.last_run).toLocaleString() : "Never"}\n`;
    output += `   Runs: ${job.run_count} successful, ${job.error_count} failed\n`;
    if (job.description) {
        output += `   ${job.description}\n`;
    }
    return output;
}
/**
 * Start command
 */
const startCommand = {
    command: "start",
    describe: "Start the scheduler daemon",
    handler: async () => {
        const running = await isDaemonRunning();
        if (running) {
            console.log("✓ Scheduler daemon is already running");
            const status = await getDaemonStatus();
            console.log(`  PID: ${status.pid}`);
            console.log(`  Jobs: ${status.total_jobs} scheduled`);
            return;
        }
        console.log("Starting scheduler daemon...");
        const started = await startDaemon();
        if (started) {
            console.log("✓ Scheduler daemon started successfully");
            // Show status
            const status = await getDaemonStatus();
            console.log(`\nStatus:`);
            console.log(`  Running: ${status.running ? "Yes" : "No"}`);
            console.log(`  PID: ${status.pid}`);
            console.log(`  Total jobs: ${status.total_jobs}`);
            console.log(`  Active executions: ${status.active_executions}`);
            if (status.upcoming_jobs.length > 0) {
                console.log(`\nUpcoming jobs:`);
                for (const jobId of status.upcoming_jobs.slice(0, 5)) {
                    console.log(`  - ${jobId}`);
                }
            }
        }
        else {
            console.error("✗ Failed to start scheduler daemon");
            process.exit(1);
        }
    },
};
/**
 * Stop command
 */
const stopCommand = {
    command: "stop",
    describe: "Stop the scheduler daemon",
    handler: async () => {
        const running = await isDaemonRunning();
        if (!running) {
            console.log("Scheduler daemon is not running");
            return;
        }
        console.log("Stopping scheduler daemon...");
        const stopped = await stopDaemon();
        if (stopped) {
            console.log("✓ Scheduler daemon stopped");
        }
        else {
            console.error("✗ Failed to stop scheduler daemon");
            process.exit(1);
        }
    },
};
/**
 * Status command
 */
const statusCommand = {
    command: "status",
    describe: "Show scheduler status and all jobs",
    handler: async () => {
        const status = await getDaemonStatus();
        console.log("## Scheduler Status\n");
        console.log(`Running: ${status.running ? "🟢 Yes" : "🔴 No"}`);
        if (status.running) {
            console.log(`PID: ${status.pid}`);
            console.log(`Last tick: ${status.last_tick ? new Date(status.last_tick).toLocaleString() : "Never"}`);
        }
        console.log(`\nTotal jobs: ${status.total_jobs}`);
        console.log(`Active executions: ${status.active_executions}`);
        if (status.upcoming_jobs.length > 0) {
            console.log(`\nUpcoming jobs (next 10):`);
            for (const jobId of status.upcoming_jobs) {
                const job = await getJob(jobId);
                if (job && job.next_run) {
                    const nextRun = new Date(job.next_run);
                    console.log(`  - ${jobId}: ${nextRun.toLocaleString()}`);
                }
            }
        }
        // List all jobs
        const jobs = await listJobs();
        if (jobs.length > 0) {
            console.log(`\n## All Jobs\n`);
            for (const job of jobs) {
                console.log(formatJob(job));
            }
        }
    },
};
/**
 * List command
 */
const listCommand = {
    command: "list",
    describe: "List all scheduled jobs",
    handler: async () => {
        const jobs = await listJobs();
        if (jobs.length === 0) {
            console.log("No scheduled jobs found.");
            console.log("\nUse the schedule_task tool to create jobs:");
            console.log('  lowcal --prompt "Create a scheduled job to run tests every hour"');
            return;
        }
        console.log(`## Scheduled Jobs (${jobs.length} total)\n`);
        for (const job of jobs) {
            console.log(formatJob(job));
        }
        console.log("\nUse 'lowcal scheduler logs <job-id>' to see execution history.");
    },
};
/**
 * Get command
 */
const getCommand = {
    command: "get <id>",
    describe: "Show details for a specific job",
    builder: (yargs) => yargs.positional("id", {
        describe: "Job ID",
        type: "string",
        demandOption: true,
    }),
    handler: async (argv) => {
        const job = await getJob(argv.id);
        if (!job) {
            console.error(`Job "${argv.id}" not found`);
            process.exit(1);
        }
        console.log(`## Job Details: ${job.id}\n`);
        console.log(`Status: ${job.status}${job.enabled ? "" : " (disabled)"}`);
        console.log(`Schedule: ${job.schedule}`);
        console.log(`Created: ${new Date(job.created_at).toLocaleString()}`);
        console.log(`Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}`);
        console.log(`Last run: ${job.last_run ? new Date(job.last_run).toLocaleString() : "Never"}`);
        console.log(`Executions: ${job.run_count} successful, ${job.error_count} failed`);
        console.log(`Timeout: ${job.timeout_minutes} minutes`);
        console.log(`Max failures: ${job.max_failures}`);
        if (job.description) {
            console.log(`\nDescription: ${job.description}`);
        }
        console.log(`\nPrompt:\n${job.prompt}\n`);
    },
};
/**
 * Logs command
 */
const logsCommand = {
    command: "logs <id>",
    describe: "Show execution logs for a job",
    builder: (yargs) => yargs
        .positional("id", {
        describe: "Job ID",
        type: "string",
        demandOption: true,
    })
        .option("tail", {
        alias: "t",
        describe: "Number of log entries to show",
        type: "number",
        default: 10,
    }),
    handler: async (argv) => {
        const job = await getJob(argv.id);
        if (!job) {
            console.error(`Job "${argv.id}" not found`);
            process.exit(1);
        }
        const logs = await getJobLogs(argv.id, argv.tail);
        if (logs.length === 0) {
            console.log(`No execution logs found for job "${argv.id}"`);
            return;
        }
        console.log(`## Execution Logs for "${argv.id}" (${logs.length} entries)\n`);
        for (const log of logs) {
            const icon = log.status === "success" ? "✓" : (log.status === "timeout" ? "⏱" : "✗");
            console.log(`${icon} ${new Date(log.started_at).toLocaleString()} - ${log.status.toUpperCase()}`);
            if (log.error) {
                console.log(`  Error: ${log.error}`);
            }
            if (log.output && log.output.length > 0) {
                const preview = log.output.substring(0, 200);
                console.log(`  Output: ${preview}${log.output.length > 200 ? "..." : ""}`);
            }
            console.log();
        }
    },
};
/**
 * Main scheduler command
 */
export const schedulerCommand = {
    command: "scheduler",
    describe: "Manage scheduled tasks and the scheduler daemon",
    builder: (yargs) => yargs
        .command(startCommand)
        .command(stopCommand)
        .command(statusCommand)
        .command(listCommand)
        .command(getCommand)
        .command(logsCommand)
        .demandCommand(1, "You need at least one command before continuing.")
        .version(false)
        .epilogue(`Cron Format:
  The scheduler uses standard 5-field cron expressions:
  
  minute hour day month day_of_week
  
  Examples:
    0 * * * *      - Every hour
    0 2 * * *      - Daily at 2:00 AM
    */5 * * * *    - Every 5 minutes
    0 9 * * 1      - Every Monday at 9:00 AM

Creating Jobs:
  Jobs are created using the schedule_task tool within LowCal:
  
  lowcal --prompt "Create a scheduled job to run tests every hour"
  
  Or directly:
  
  lowcal --prompt "schedule_task: create job 'test-runner' to run 'npm test' every hour"`),
    handler: () => {
        // yargs will automatically show help if no subcommand is provided
    },
};
//# sourceMappingURL=scheduler.js.map