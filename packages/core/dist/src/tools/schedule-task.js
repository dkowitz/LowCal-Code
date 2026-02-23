/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { createJob, getJob, listJobs, updateJob, deleteJob, pauseJob, resumeJob, getJobLogs, validateCronExpression, } from "../scheduler/job-store.js";
import { mergeRuntimeProfiles, normalizeActionType, normalizeApprovalMode, normalizeAuthProfile, normalizeExecutionMode, normalizeModelProfile, normalizeRunProfile, normalizeRuntimeProfile, normalizeTemplateLevel, runtimeProfileFromTemplate, sanitizeRuntimeProfile, } from "../task-templates/runtime.js";
import { TaskTemplateManager } from "../task-templates/manager.js";
const scheduleTaskToolSchemaData = {
    name: "schedule_task",
    description: "Creates and manages scheduled tasks (cron jobs) that run automatically at specified times. Supports task templates and per-job auth/model/runtime overrides.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: [
                    "create",
                    "list",
                    "get",
                    "update",
                    "delete",
                    "pause",
                    "resume",
                    "run_now",
                ],
                description: "The action to perform on scheduled tasks",
            },
            id: {
                type: "string",
                description: "Unique identifier for the job (required for create, get, update, delete, pause, resume, run_now)",
            },
            schedule: {
                type: "string",
                description: "Cron expression in 5-field format (minute hour day month day_of_week).",
            },
            prompt: {
                type: "string",
                description: "Optional prompt/action value for the job. Required unless template/action_value provides content.",
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
            execution_mode: {
                type: "string",
                enum: ["default", "headless", "zellij_tab", "in_process"],
                description: "Optional execution mode override for this job. Use 'default' (or omit) to follow the scheduler setting.",
            },
            execution_mode_override: {
                type: "boolean",
                description: "Set to true to apply execution_mode. If false/omitted, execution_mode is ignored and defaults are used.",
            },
            action_type: {
                type: "string",
                enum: ["prompt", "slash_command"],
                description: "Optional action type. slash_command is supported only with in_process execution mode.",
            },
            action_value: {
                type: "string",
                description: "Optional action payload. If omitted, prompt is used as action_value.",
            },
            approval_mode: {
                type: "string",
                enum: ["plan", "default", "auto-edit", "yolo"],
                description: "Optional approval mode override for this job runtime.",
            },
            template_id: {
                type: "string",
                description: "Optional task template id used to pre-fill job runtime fields.",
            },
            template_level: {
                type: "string",
                enum: ["auto", "project", "user", "builtin"],
                description: "Optional template scope. auto resolves project > user > builtin.",
            },
            template_overrides: {
                type: "object",
                description: "Optional runtime overrides merged on top of template/runtime values.",
            },
            auth: {
                type: "object",
                description: "Optional auth override for this job runtime.",
            },
            model: {
                type: "object",
                description: "Optional model override for this job runtime.",
            },
            run: {
                type: "object",
                description: "Optional run settings (returnToSession, allowRecursive) for this job runtime.",
            },
            return_to_session_id: {
                type: "string",
                description: "Optional explicit target session id for in_process execution.",
            },
        },
        required: ["action"],
        $schema: "http://json-schema.org/draft-07/schema#",
    },
};
const scheduleTaskToolDescription = `
Use this tool to create and manage scheduled tasks (cron jobs) that run automatically at specified times.

Jobs support:
- task templates (template_id/template_level)
- per-job auth/model overrides
- action types (prompt or slash_command)
- execution modes (headless, zellij_tab, in_process)

## Actions

- create: Create a new scheduled job (requires: id, schedule, and action content)
- list: List all scheduled jobs
- get: Get details of a specific job including recent execution logs
- update: Update an existing job's properties
- delete: Remove a scheduled job permanently
- pause: Temporarily disable a job without deleting it
- resume: Re-enable a paused job
- run_now: Trigger a job to run immediately
`;
function isRuntimeFieldPresent(params) {
    return (params.prompt !== undefined ||
        params.action_type !== undefined ||
        params.action_value !== undefined ||
        params.approval_mode !== undefined ||
        params.execution_mode !== undefined ||
        params.execution_mode_override !== undefined ||
        params.template_id !== undefined ||
        params.template_level !== undefined ||
        params.template_overrides !== undefined ||
        params.auth !== undefined ||
        params.model !== undefined ||
        params.run !== undefined ||
        params.return_to_session_id !== undefined);
}
class ScheduleTaskInvocation extends BaseToolInvocation {
    sourceSessionId;
    config;
    constructor(params, sourceSessionId, config) {
        super(params);
        this.sourceSessionId = sourceSessionId;
        this.config = config;
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
    getWorkspaceRoot() {
        return this.config?.getProjectRoot() ?? process.cwd();
    }
    async resolveTemplateFromParams(templateIdRaw, templateLevelRaw) {
        const templateId = typeof templateIdRaw === "string" && templateIdRaw.trim().length > 0
            ? templateIdRaw.trim()
            : undefined;
        if (!templateId) {
            return null;
        }
        const templateLevel = normalizeTemplateLevel(templateLevelRaw);
        const templateManager = new TaskTemplateManager(this.getWorkspaceRoot());
        const template = await templateManager.resolveTemplate(templateId, templateLevel ? { level: templateLevel } : undefined);
        if (!template) {
            throw new Error(`Task template "${templateId}" not found`);
        }
        return template;
    }
    resolveRunTarget(runtimeProfile, explicitReturnToSessionId, executionMode) {
        const explicitTarget = typeof explicitReturnToSessionId === "string" &&
            explicitReturnToSessionId.trim().length > 0
            ? explicitReturnToSessionId.trim()
            : undefined;
        if (explicitTarget) {
            return explicitTarget;
        }
        const returnToSession = runtimeProfile.run?.returnToSession;
        if (typeof returnToSession === "string" && returnToSession.trim().length > 0) {
            return returnToSession.trim();
        }
        if (returnToSession === true) {
            return this.sourceSessionId;
        }
        if (executionMode === "in_process") {
            return this.sourceSessionId;
        }
        return undefined;
    }
    buildExistingRuntimeProfile(job) {
        if (job.runtime_profile) {
            return { ...job.runtime_profile };
        }
        return {
            template_id: job.template_id,
            template_level: job.template_level,
            action_type: job.action_type,
            action_value: job.action_value ?? job.prompt,
            execution_mode: job.execution_mode,
        };
    }
    async resolveJobRuntime(options) {
        const { params, fallbackPrompt, existingRuntime } = options;
        const explicitPrompt = typeof params.prompt === "string" && params.prompt.trim().length > 0
            ? params.prompt
            : fallbackPrompt;
        const directActionType = normalizeActionType(params.action_type);
        const directActionValue = typeof params.action_value === "string" &&
            params.action_value.trim().length > 0
            ? params.action_value
            : explicitPrompt;
        const rawExecutionMode = normalizeExecutionMode(params.execution_mode);
        const shouldOverrideExecutionMode = params.execution_mode_override === true;
        const explicitExecutionMode = shouldOverrideExecutionMode
            ? rawExecutionMode
            : undefined;
        const template = await this.resolveTemplateFromParams(params.template_id, params.template_level);
        const templateRuntime = template
            ? runtimeProfileFromTemplate(template)
            : undefined;
        const explicitRuntime = {
            action_type: directActionType ?? (directActionValue ? "prompt" : undefined),
            action_value: directActionValue,
            approval_mode: normalizeApprovalMode(params.approval_mode),
            execution_mode: explicitExecutionMode,
            auth: normalizeAuthProfile(params.auth),
            model: normalizeModelProfile(params.model),
            run: normalizeRunProfile(params.run),
        };
        let merged = mergeRuntimeProfiles(existingRuntime, templateRuntime, normalizeRuntimeProfile(params.template_overrides), explicitRuntime);
        if (params.return_to_session_id !== undefined) {
            merged = {
                ...merged,
                run: {
                    ...(merged.run ?? {}),
                    returnToSession: params.return_to_session_id,
                },
            };
        }
        const actionType = merged.action_type ?? (merged.action_value ? "prompt" : undefined);
        const actionValue = merged.action_value ?? explicitPrompt;
        if (!actionType || !actionValue) {
            throw new Error("Job requires action content: provide prompt/action_value or template action content.");
        }
        if (actionValue.length > 10000) {
            throw new Error(`Action value is too long (${actionValue.length} characters). Maximum is 10000 characters.`);
        }
        const normalizedExecutionMode = merged.execution_mode === "default" ? undefined : merged.execution_mode;
        if (actionType === "slash_command" && normalizedExecutionMode !== "in_process") {
            throw new Error('slash_command action_type requires execution_mode="in_process".');
        }
        const returnToSessionId = this.resolveRunTarget(merged, params.return_to_session_id, normalizedExecutionMode);
        if (normalizedExecutionMode === "in_process" && !returnToSessionId) {
            throw new Error("in_process execution requires a target session. Provide return_to_session_id or set run.returnToSession=true from an interactive session.");
        }
        const modeIgnoredWarning = rawExecutionMode &&
            rawExecutionMode !== "default" &&
            !shouldOverrideExecutionMode
            ? `execution_mode="${rawExecutionMode}" was ignored because execution_mode_override=true was not set.`
            : undefined;
        return {
            runtimeProfile: sanitizeRuntimeProfile({
                ...merged,
                template_id: template?.id ?? merged.template_id,
                template_level: template?.level ?? merged.template_level,
                action_type: actionType,
                action_value: actionValue,
                execution_mode: normalizedExecutionMode,
                run: {
                    ...(merged.run ?? {}),
                    returnToSession: returnToSessionId ?? merged.run?.returnToSession,
                },
            }) ?? {},
            actionType,
            actionValue,
            executionMode: normalizedExecutionMode,
            template: template ?? undefined,
            returnToSessionId,
            modeIgnoredWarning,
        };
    }
    async executeAction() {
        const { action, id, schedule, description, enabled, timeout_minutes, max_failures, } = this.params;
        switch (action) {
            case "create": {
                if (!id || !schedule) {
                    throw new Error("Creating a job requires: id and schedule");
                }
                if (!validateCronExpression(schedule)) {
                    throw new Error(`Invalid cron expression: "${schedule}". Use 5-field format: minute hour day month day_of_week (e.g., "0 * * * *" for hourly)`);
                }
                const resolved = await this.resolveJobRuntime({
                    params: this.params,
                });
                const job = await createJob({
                    id,
                    schedule,
                    prompt: resolved.actionValue,
                    description,
                    enabled,
                    timeout_minutes,
                    max_failures,
                    execution_mode: resolved.executionMode,
                    action_type: resolved.actionType,
                    action_value: resolved.actionValue,
                    template_id: resolved.template?.id,
                    template_level: resolved.template?.level,
                    return_to_session_id: resolved.returnToSessionId,
                    runtime_profile: resolved.runtimeProfile,
                });
                return this.formatJobCreated(job, resolved.modeIgnoredWarning);
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
                const existing = await getJob(id);
                if (!existing) {
                    throw new Error(`Job "${id}" not found`);
                }
                if (schedule && !validateCronExpression(schedule)) {
                    throw new Error(`Invalid cron expression: "${schedule}". Use 5-field format: minute hour day month day_of_week`);
                }
                const shouldResolveRuntime = isRuntimeFieldPresent(this.params);
                const resolved = shouldResolveRuntime
                    ? await this.resolveJobRuntime({
                        params: this.params,
                        fallbackPrompt: existing.prompt,
                        existingRuntime: this.buildExistingRuntimeProfile(existing),
                    })
                    : undefined;
                const job = await updateJob({
                    id,
                    schedule,
                    prompt: resolved?.actionValue ?? this.params.prompt,
                    description,
                    enabled,
                    timeout_minutes,
                    max_failures,
                    execution_mode: shouldResolveRuntime && resolved
                        ? resolved.executionMode ?? null
                        : undefined,
                    action_type: shouldResolveRuntime && resolved ? resolved.actionType : undefined,
                    action_value: shouldResolveRuntime && resolved ? resolved.actionValue : undefined,
                    template_id: shouldResolveRuntime && resolved
                        ? (resolved.template?.id ?? resolved.runtimeProfile.template_id ?? null)
                        : undefined,
                    template_level: shouldResolveRuntime && resolved
                        ? (resolved.template?.level ??
                            resolved.runtimeProfile.template_level ??
                            null)
                        : undefined,
                    return_to_session_id: shouldResolveRuntime && resolved
                        ? (resolved.returnToSessionId ?? null)
                        : undefined,
                    runtime_profile: shouldResolveRuntime && resolved
                        ? resolved.runtimeProfile
                        : undefined,
                });
                return this.formatJobUpdated(job, resolved?.modeIgnoredWarning);
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
                return `✓ Job "${id}" has been queued to run immediately. The scheduler daemon will execute it on the next tick.`;
            }
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
    formatJobCreated(job, warning) {
        let output = `✓ Created scheduled job "${job.id}"\n\n`;
        output += `Schedule: ${job.schedule}\n`;
        output += `Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
        output += `Status: ${job.enabled ? "Enabled" : "Disabled"}\n`;
        output += `Execution: ${job.execution_mode ?? "default"}\n`;
        output += `Action: ${job.action_type ?? "prompt"}\n`;
        if (job.template_id) {
            output += `Template: ${job.template_id} (${job.template_level ?? "auto"})\n`;
        }
        if (job.runtime_profile?.model?.name) {
            output += `Model override: ${job.runtime_profile.model.name}\n`;
        }
        if (job.runtime_profile?.auth?.providerId || job.runtime_profile?.auth?.selectedType) {
            output += `Auth override: ${job.runtime_profile.auth?.providerId ?? job.runtime_profile.auth?.selectedType}\n`;
        }
        if (job.return_to_session_id) {
            output += `Return target session: ${job.return_to_session_id}\n`;
        }
        if (warning) {
            output += `Warning: ${warning}\n`;
        }
        if (job.description) {
            output += `Description: ${job.description}\n`;
        }
        output += `\nAction Value:\n${job.action_value ?? job.prompt}\n\n`;
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
            output += `   Execution: ${job.execution_mode ?? "default"}\n`;
            output += `   Action: ${job.action_type ?? "prompt"}\n`;
            if (job.template_id) {
                output += `   Template: ${job.template_id} (${job.template_level ?? "auto"})\n`;
            }
            if (job.runtime_profile?.model?.name) {
                output += `   Model override: ${job.runtime_profile.model.name}\n`;
            }
            if (job.runtime_profile?.auth?.providerId || job.runtime_profile?.auth?.selectedType) {
                output += `   Auth override: ${job.runtime_profile.auth?.providerId ?? job.runtime_profile.auth?.selectedType}\n`;
            }
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
        output += `**Max failures:** ${job.max_failures}\n`;
        output += `**Execution:** ${job.execution_mode ?? "default"}\n`;
        output += `**Action:** ${job.action_type ?? "prompt"}\n`;
        if (job.template_id) {
            output += `**Template:** ${job.template_id} (${job.template_level ?? "auto"})\n`;
        }
        if (job.return_to_session_id) {
            output += `**Return target session:** ${job.return_to_session_id}\n`;
        }
        if (job.runtime_profile) {
            output += `\n**Runtime Profile:**\n\`\`\`json\n${JSON.stringify(job.runtime_profile, null, 2)}\n\`\`\`\n`;
        }
        if (job.description) {
            output += `\n**Description:** ${job.description}\n`;
        }
        output += `\n**Action Value:**\n\`\`\`\n${job.action_value ?? job.prompt}\n\`\`\`\n\n`;
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
    formatJobUpdated(job, warning) {
        let output = `✓ Updated job "${job.id}"\n\n`;
        output += `Schedule: ${job.schedule}\n`;
        output += `Next run: ${job.next_run ? new Date(job.next_run).toLocaleString() : "Not scheduled"}\n`;
        output += `Status: ${job.enabled ? "Enabled" : "Disabled"}\n`;
        output += `Execution: ${job.execution_mode ?? "default"}\n`;
        output += `Action: ${job.action_type ?? "prompt"}\n`;
        if (job.template_id) {
            output += `Template: ${job.template_id} (${job.template_level ?? "auto"})\n`;
        }
        if (warning) {
            output += `Warning: ${warning}\n`;
        }
        return output;
    }
}
export class ScheduleTaskTool extends BaseDeclarativeTool {
    config;
    constructor(config) {
        super("schedule_task", "Schedule Task", scheduleTaskToolDescription, Kind.Other, scheduleTaskToolSchemaData.parametersJsonSchema, true, // isOutputMarkdown
        false);
        this.config = config;
    }
    createInvocation(params) {
        return new ScheduleTaskInvocation(params, this.config?.getSessionId(), this.config);
    }
}
//# sourceMappingURL=schedule-task.js.map