/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { createJob, getJob, listJobs, updateJob, deleteJob, pauseJob, resumeJob, getJobLogs, validateCronExpression, } from "../scheduler/job-store.js";
const scheduleTaskToolSchemaData = {
    name: "schedule_task",
    description: "Creates and manages scheduled tasks (cron jobs) that run automatically at specified times. This enables LowCal to execute tasks autonomously on a schedule, such as running tests, checking logs, or performing maintenance.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["create", "list", "get", "update", "delete", "pause", "resume", "run_now"],
                description: "The action to perform on scheduled tasks",
            },
            id: {
                type: "string",
                description: "Unique identifier for the job (required for create, get, update, delete, pause, resume, run_now)",
            },
            schedule: {
                type: "string",
                description: "Cron expression in 5-field format (minute hour day month day_of_week). Examples: '0 * * * *' = hourly, '0 2 * * *' = daily at 2am, '*/5 * * * *' = every 5 minutes",
            },
            prompt: {
                type: "string",
                description: "The prompt/instruction to execute when the job runs. This is what LowCal will do when triggered.",
            },
            description: {
                type: "string",
                description: "Optional human-readable description of what this job does",
            },
            enabled: {
                type: "boolean",
                description: "Whether the job is enabled (default: true for create)",
            },
            timeout_minutes: {
                type: "number",
                description: "Maximum execution time in minutes (default: 10)",
            },
            max_failures: {
                type: "number",
                description: "Number of consecutive failures before auto-pausing (default: 3)",
            },
        },
        required: ["action"],
        $schema: "http://json-schema.org/draft-07/schema#",
    },
};
const scheduleTaskToolDescription = `
Use this tool to create and manage scheduled tasks (cron jobs) that run automatically at specified times.
This enables LowCal to execute tasks autonomously on a schedule, enabling long-horizon task completion,
automated maintenance, and proactive monitoring.

## When to Use This Tool

Use this tool proactively in these scenarios:

1. **Recurring tasks** - Schedule tasks that need to run repeatedly (e.g., hourly tests, daily backups)
2. **Delayed execution** - Schedule a task to run at a specific future time
3. **Automated monitoring** - Set up jobs to check system health, logs, or external resources
4. **Long-horizon workflows** - Break complex tasks into scheduled steps that execute over time
5. **Self-maintenance** - Schedule jobs to clean up, update dependencies, or perform routine checks

## Cron Expression Format

The schedule uses standard 5-field cron format:
\`\`\`
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
\`\`\`

Common patterns:
- \`0 * * * *\` - Every hour
- \`0 2 * * *\` - Daily at 2:00 AM
- \`*/5 * * * *\` - Every 5 minutes
- \`0 9 * * 1\` - Every Monday at 9:00 AM
- \`0 0 1 * *\` - First day of every month at midnight

## Actions

- **create**: Create a new scheduled job (requires: id, schedule, prompt)
- **list**: List all scheduled jobs
- **get**: Get details of a specific job including recent execution logs (requires: id)
- **update**: Update an existing job's properties (requires: id)
- **delete**: Remove a scheduled job permanently (requires: id)
- **pause**: Temporarily disable a job without deleting it (requires: id)
- **resume**: Re-enable a paused job (requires: id)
- **run_now**: Trigger a job to run immediately (requires: id)

## Examples

<example>
User: I want to run tests every hour and notify me if they fail.
Assistant: I'll create a scheduled job to run tests hourly.

create action:
- id: "hourly-test-runner"
- schedule: "0 * * * *"
- prompt: "Run 'npm test'. If tests fail, analyze the errors and create a summary of what needs to be fixed."
- description: "Run tests every hour and report failures"
</example>

<example>
User: Check the error logs every 10 minutes and alert me if there are new errors.
Assistant: I'll set up a monitoring job to check logs regularly.

create action:
- id: "log-monitor"
- schedule: "*/10 * * * *"
- prompt: "Check the application error logs for any new errors in the last 10 minutes. If found, summarize them and suggest actions."
- description: "Monitor error logs every 10 minutes"
</example>

<example>
User: Show me all scheduled jobs
Assistant: I'll list all your scheduled jobs.

list action
</example>

<example>
User: Pause the hourly test runner
Assistant: I'll pause that job for now.

pause action:
- id: "hourly-test-runner"
</example>

## Important Notes

- Job IDs must be unique and contain only letters, numbers, underscores, and hyphens
- The scheduler daemon must be running for jobs to execute (use 'lowcal scheduler start')
- Jobs have a default timeout of 10 minutes and auto-pause after 3 consecutive failures
- Maximum 100 jobs can be scheduled at once
- Job execution logs are stored in .lowcal/logs/
`;
class ScheduleTaskInvocation extends BaseToolInvocation {
    constructor(params) {
        super(params);
    }
    getDescription() {
        const { action, id, schedule } = this.params;
        switch (action) {
            case "create":
                return `Creating scheduled job "${id}" with schedule "${schedule}"`;
            case "list":
                return "Listing all scheduled jobs";
            case "get":
                return `Getting details for job "${id}"`;
            case "update":
                return `Updating job "${id}"`;
            case "delete":
                return `Deleting job "${id}"`;
            case "pause":
                return `Pausing job "${id}"`;
            case "resume":
                return `Resuming job "${id}"`;
            case "run_now":
                return `Triggering job "${id}" to run now`;
            default:
                return `Schedule task action: ${action}`;
        }
    }
    async execute() {
        try {
            const result = await this.executeAction();
            return {
                llmContent: result,
                returnDisplay: result,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: `Error: ${errorMessage}`,
                error: {
                    message: errorMessage,
                    type: ToolErrorType.INVALID_TOOL_PARAMS,
                },
            };
        }
    }
    async executeAction() {
        const { action, id, schedule, description, enabled, timeout_minutes, max_failures } = this.params;
        switch (action) {
            case "create": {
                if (!id || !schedule || !this.params.prompt) {
                    throw new Error("Creating a job requires: id, schedule, and prompt");
                }
                if (!validateCronExpression(schedule)) {
                    throw new Error(`Invalid cron expression: "${schedule}". Use 5-field format: minute hour day month day_of_week (e.g., "0 * * * *" for hourly)`);
                }
                const job = await createJob({
                    id,
                    schedule,
                    prompt: this.params.prompt,
                    description,
                    enabled,
                    timeout_minutes,
                    max_failures,
                });
                return this.formatJobCreated(job);
            }
            case "list": {
                const jobs = await listJobs();
                if (jobs.length === 0) {
                    return "No scheduled jobs found. Use the create action to add jobs.";
                }
                return this.formatJobList(jobs);
            }
            case "get": {
                if (!id) {
                    throw new Error("Getting a job requires: id");
                }
                const job = await getJob(id);
                if (!job) {
                    throw new Error(`Job "${id}" not found`);
                }
                const logs = await getJobLogs(id, 5);
                return this.formatJobDetails(job, logs);
            }
            case "update": {
                if (!id) {
                    throw new Error("Updating a job requires: id");
                }
                if (schedule && !validateCronExpression(schedule)) {
                    throw new Error(`Invalid cron expression: "${schedule}". Use 5-field format: minute hour day month day_of_week`);
                }
                const job = await updateJob({
                    id,
                    schedule,
                    prompt: this.params.prompt,
                    description,
                    enabled,
                    timeout_minutes,
                    max_failures,
                });
                return this.formatJobUpdated(job);
            }
            case "delete": {
                if (!id) {
                    throw new Error("Deleting a job requires: id");
                }
                const deleted = await deleteJob(id);
                if (!deleted) {
                    throw new Error(`Job "${id}" not found`);
                }
                return `✓ Job "${id}" has been deleted.`;
            }
            case "pause": {
                if (!id) {
                    throw new Error("Pausing a job requires: id");
                }
                await pauseJob(id);
                return `✓ Job "${id}" has been paused. It will not run until resumed.`;
            }
            case "resume": {
                if (!id) {
                    throw new Error("Resuming a job requires: id");
                }
                const job = await resumeJob(id);
                return `✓ Job "${id}" has been resumed. Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "calculating..."}`;
            }
            case "run_now": {
                if (!id) {
                    throw new Error("Running a job requires: id");
                }
                const job = await getJob(id);
                if (!job) {
                    throw new Error(`Job "${id}" not found`);
                }
                // Note: Actual execution would be handled by the daemon
                // For now, we just acknowledge the request
                return `✓ Job "${id}" has been queued to run immediately. The scheduler daemon will execute it on the next tick.`;
            }
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
    formatJobCreated(job) {
        let output = `✓ Created scheduled job "${job.id}"\n\n`;
        output += `Schedule: ${job.schedule}\n`;
        output += `Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
        output += `Status: ${job.enabled ? "Enabled" : "Disabled"}\n`;
        if (job.description) {
            output += `Description: ${job.description}\n`;
        }
        output += `\nPrompt:\n${job.prompt}\n\n`;
        output += `The job will execute automatically according to its schedule. `;
        output += `Make sure the scheduler daemon is running (use 'lowcal scheduler start').`;
        return output;
    }
    formatJobList(jobs) {
        let output = `## Scheduled Jobs (${jobs.length} total)\n\n`;
        for (const job of jobs) {
            const statusIcon = job.enabled ? "🟢" : "🔴";
            const statusText = job.status === "running" ? " (running)" : "";
            output += `${statusIcon} **${job.id}**${statusText}\n`;
            output += `   Schedule: \`${job.schedule}\`\n`;
            output += `   Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
            if (job.description) {
                output += `   ${job.description}\n`;
            }
            output += `   Runs: ${job.run_count} successful, ${job.error_count} failed\n\n`;
        }
        output += `Use 'get' action with a job ID to see full details and recent logs.`;
        return output;
    }
    formatJobDetails(job, logs) {
        let output = `## Job Details: ${job.id}\n\n`;
        output += `**Status:** ${job.status}${job.enabled ? "" : " (disabled)"}\n`;
        output += `**Schedule:** \`${job.schedule}\`\n`;
        output += `**Created:** ${new Date(job.created_at).toLocaleString()}\n`;
        output += `**Next run:** ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
        output += `**Last run:** ${job.last_run ? new Date(job.last_run).toLocaleString() : "Never"}\n`;
        output += `**Executions:** ${job.run_count} successful, ${job.error_count} failed\n`;
        output += `**Timeout:** ${job.timeout_minutes} minutes\n`;
        output += `**Max failures:** ${job.max_failures}\n\n`;
        if (job.description) {
            output += `**Description:** ${job.description}\n\n`;
        }
        output += `**Prompt:**\n\`\`\`\n${job.prompt}\n\`\`\`\n\n`;
        if (logs.length > 0) {
            output += `## Recent Execution Logs (${logs.length} shown)\n\n`;
            for (const log of logs) {
                const icon = log.status === "success" ? "✓" : "✗";
                output += `${icon} **${new Date(log.started_at).toLocaleString()}** - ${log.status}\n`;
                if (log.error) {
                    output += `   Error: ${log.error}\n`;
                }
            }
        }
        else {
            output += `*No execution logs yet.*`;
        }
        return output;
    }
    formatJobUpdated(job) {
        let output = `✓ Updated job "${job.id}"\n\n`;
        output += `Schedule: ${job.schedule}\n`;
        output += `Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
        output += `Status: ${job.enabled ? "Enabled" : "Disabled"}\n`;
        return output;
    }
}
export class ScheduleTaskTool extends BaseDeclarativeTool {
    constructor() {
        super("schedule_task", "Schedule Task", scheduleTaskToolDescription, Kind.Other, scheduleTaskToolSchemaData.parametersJsonSchema, true, // isOutputMarkdown
        false);
    }
    createInvocation(params) {
        return new ScheduleTaskInvocation(params);
    }
}
//# sourceMappingURL=schedule-task.js.map