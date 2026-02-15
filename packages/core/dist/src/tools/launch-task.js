/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import * as fs from "fs/promises";
import * as path from "node:path";
import * as net from "node:net";
import { fileURLToPath } from "node:url";
import { getSession } from "../sessions/session-store.js";
import { findActiveLaunchTaskByDedupeKey, getLaunchTaskState, isLaunchTaskTerminal, reconcileLaunchTaskState, upsertLaunchTaskState, } from "./launch-task-state.js";
import { mergeRuntimeProfiles, normalizeActionType, normalizeAuthProfile, normalizeExecutionMode, normalizeModelProfile, normalizeRuntimeProfile, normalizeTemplateLevel, runtimeProfileFromTemplate, sanitizeRuntimeProfile, } from "../task-templates/runtime.js";
import { TaskTemplateManager } from "../task-templates/manager.js";
const launchTaskToolSchemaData = {
    name: "launch_task",
    description: "Spawns a new instance of LowCal with a tasking prompt immediately (headless or in a zellij tab). This enables LowCal to execute tasks autonomously without scheduling.",
    parametersJsonSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["create"],
                description: "The action to perform (only 'create' is supported)",
            },
            id: {
                type: "string",
                description: "Unique identifier for the task (required for create)",
            },
            prompt: {
                type: "string",
                description: "The prompt/instruction to execute. This is what LowCal will do when launched.",
            },
            description: {
                type: "string",
                description: "Optional human-readable description of what this task does",
            },
            execution_mode: {
                type: "string",
                enum: ["default", "headless", "zellij_tab", "in_process"],
                description: "Optional execution mode override for the new LowCal instance. Use 'default' (or omit) to follow scheduler/session defaults.",
            },
            action_type: {
                type: "string",
                enum: ["prompt", "slash_command"],
                description: "Optional action type. prompt runs a prompt/query. slash_command executes a slash command (supported in in_process mode).",
            },
            action_value: {
                type: "string",
                description: "Optional action payload. If omitted, prompt is used as the action value.",
            },
            template_id: {
                type: "string",
                description: "Optional task template id. Template values are merged and can be overridden by explicit launch params.",
            },
            template_level: {
                type: "string",
                enum: ["auto", "project", "user", "builtin"],
                description: "Optional template scope. auto resolves project > user > builtin.",
            },
            template_overrides: {
                type: "object",
                description: "Optional runtime overrides merged on top of template values (execution_mode, auth, model, run, action fields).",
            },
            auth: {
                type: "object",
                description: "Optional auth override for this task (selectedType/providerId/baseUrl/apiKeyEnvVar).",
            },
            model: {
                type: "object",
                description: "Optional model override for this task (name).",
            },
            execution_mode_override: {
                type: "boolean",
                description: "Set to true to apply execution_mode. If false/omitted, execution_mode is ignored and defaults are used.",
            },
            return_to_session_id: {
                type: "string",
                description: "Optional session ID to receive completion messages from the launched task. If omitted, defaults to the current session.",
            },
            idempotency_key: {
                type: "string",
                description: "Optional dedupe key. If another queued/running task exists with the same key, launch_task returns the existing task instead of spawning a duplicate.",
            },
            allow_recursive: {
                type: "boolean",
                description: "Allow launch_task to run from within launched headless tasks. Defaults to false for safety.",
            },
        },
        required: ["action", "id"],
        $schema: "http://json-schema.org/draft-07/schema#",
    },
};
const launchTaskToolDescription = `
Use this tool to spawn a new instance of LowCal with a tasking prompt immediately, without scheduling.

This enables LowCal to execute tasks autonomously by launching a fresh instance that runs to completion.

## When to Use This Tool

Use this tool when you need:

1. **Immediate execution** - Run a task right away without waiting for a scheduler
2. **Isolated execution** - Execute a task in a clean environment separate from the current session
3. **Background processing** - Offload long-running tasks to run concurrently
4. **Zellij integration** - Open tasks in dedicated Zellij tabs for visibility

## Execution Modes

- **headless**: Runs silently without UI, ideal for automated tasks
- **zellij_tab**: Opens in a new Zellij tab if you're running in Zellij, allowing you to monitor progress
- **in_process**: Queues work inside the parent interactive session with temporary auth/model overrides
- **default**: Uses your configured scheduler default mode (recommended unless the user explicitly asks otherwise)

## Actions

- **create**: Launch or queue a task (requires: id and either prompt/action_value or a template that provides action_value)

## Parent Protocol (Recommended)

For one objective, follow this sequence:

1. Launch exactly one task first.
2. Set a stable \`idempotency_key\` for this objective.
3. After launch, use \`read_session_messages\` with \`action: "wait"\` and \`task_id\`.
4. If wait times out, do not spawn a duplicate. Wait again or report it is still running.
5. Use logs only for debugging when mailbox/state indicates failure or missing return.

## Examples

<example>
User: Run a build and test cycle in the background while I continue working.
Assistant: I'll launch a background task and use default execution mode.

create action:
- id: "background-build"
- prompt: "Run 'npm run build && npm test'. Report any failures."
- description: "Run build and tests in background"
</example>

<example>
User: I want to monitor a log file in a separate tab while I work.
Assistant: I'll open a new Zellij tab with a task to tail the log file.

create action:
- id: "log-monitor"
- prompt: "Tail the application.log file and report any errors you see."
- execution_mode: "zellij_tab"
- execution_mode_override: true
- description: "Monitor logs in separate tab"
</example>

## Important Notes

- Task IDs must be unique and contain only letters, numbers, underscores, and hyphens
- The new instance runs independently with its own session
- Prefer leaving \`execution_mode\` unset; only set \`execution_mode\` with \`execution_mode_override=true\` when the user explicitly asks for a mode
- If a return channel is set, retrieve results with \`read_session_messages\` instead of polling task log files
- Use \`idempotency_key\` for tasks that may be retried by the parent while still in-flight
- Headless mode still writes output logs for debugging
- Zellij tabs require you to be running in a Zellij session
- Recursive launch_task calls are blocked by default to prevent spawn loops
- If \`return_to_session_id\` is omitted, it defaults to the current session
`;
const HEADLESS_CLI_RELATIVE_PATH = path.join("packages", "cli", "dist", "src", "scheduler", "headless.js");
const ENV_DISABLE_LAUNCH_TASK = "LOWCAL_DISABLE_LAUNCH_TASK";
const ENV_RETURN_TO_SESSION_ID = "LOWCAL_RETURN_TO_SESSION_ID";
const ENV_RETURN_MAILBOX_PATH = "LOWCAL_RETURN_MAILBOX_PATH";
const ENV_RETURN_FROM_TASK_ID = "LOWCAL_RETURN_FROM_TASK_ID";
const ENV_TASK_RUNTIME_B64 = "LOWCAL_TASK_RUNTIME_B64";
function collectAncestorDirectories(start) {
    const directories = [];
    let current = path.resolve(start);
    while (true) {
        directories.push(current);
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return directories;
}
function isRunningInZellijSession() {
    return Boolean(process.env["ZELLIJ_SESSION_NAME"] ||
        process.env["ZELLIJ_PANE_ID"] ||
        process.env["ZELLIJ"]);
}
class LaunchTaskInvocation extends BaseToolInvocation {
    sourceSessionId;
    defaultExecutionMode;
    constructor(params, sourceSessionId, defaultExecutionMode = "headless") {
        super(params);
        this.sourceSessionId = sourceSessionId;
        this.defaultExecutionMode = defaultExecutionMode;
    }
    getDescription() {
        const { action, id } = this.params;
        switch (action) {
            case "create":
                return `Launching new LowCal instance "${id}"`;
            default:
                return `Launch task action: ${action}`;
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
        const { action, id, description, execution_mode, execution_mode_override } = this.params;
        switch (action) {
            case "create": {
                if (!id) {
                    throw new Error("Creating a task requires: id");
                }
                if (process.env[ENV_DISABLE_LAUNCH_TASK] === "1" &&
                    this.params.allow_recursive !== true) {
                    throw new Error("launch_task is disabled in launched child tasks to prevent recursive spawning. Set allow_recursive=true only if you intentionally need nested launches.");
                }
                // Validate ID format (alphanumeric, underscores, hyphens only)
                const idRegex = /^[a-zA-Z0-9_-]+$/;
                if (!idRegex.test(id)) {
                    throw new Error(`Invalid task ID "${id}". Must contain only letters, numbers, underscores, and hyphens.`);
                }
                const directPrompt = typeof this.params.prompt === "string" &&
                    this.params.prompt.trim().length > 0
                    ? this.params.prompt
                    : undefined;
                const directActionType = normalizeActionType(this.params.action_type);
                const directActionValue = typeof this.params.action_value === "string" &&
                    this.params.action_value.trim().length > 0
                    ? this.params.action_value
                    : directPrompt;
                if (directActionValue && directActionValue.length > 10000) {
                    throw new Error(`Action value is too long (${directActionValue.length} characters). Maximum is 10000 characters.`);
                }
                const runtime = await this.resolveRuntimePaths();
                const templateLevel = normalizeTemplateLevel(this.params.template_level);
                const templateId = typeof this.params.template_id === "string" &&
                    this.params.template_id.trim().length > 0
                    ? this.params.template_id.trim()
                    : undefined;
                const templateManager = new TaskTemplateManager(runtime.workspaceRoot);
                const template = templateId !== undefined
                    ? await templateManager.resolveTemplate(templateId, templateLevel ? { level: templateLevel } : undefined)
                    : null;
                if (templateId && !template) {
                    throw new Error(`Task template "${templateId}" was not found`);
                }
                const explicitExecutionModeRaw = normalizeExecutionMode(execution_mode);
                const explicitExecutionMode = explicitExecutionModeRaw && explicitExecutionModeRaw !== "default"
                    ? explicitExecutionModeRaw
                    : undefined;
                const shouldOverrideExecutionMode = execution_mode_override === true;
                const resolvedExecutionMode = shouldOverrideExecutionMode && explicitExecutionMode
                    ? explicitExecutionMode
                    : this.defaultExecutionMode;
                const explicitRuntimeProfile = {
                    action_type: directActionType ?? (directActionValue ? "prompt" : undefined),
                    action_value: directActionValue,
                    execution_mode: explicitExecutionMode,
                    auth: normalizeAuthProfile(this.params.auth),
                    model: normalizeModelProfile(this.params.model),
                    run: this.params.allow_recursive !== undefined
                        ? { allowRecursive: this.params.allow_recursive }
                        : undefined,
                };
                const templateRuntimeProfile = template
                    ? runtimeProfileFromTemplate(template)
                    : undefined;
                const overrideRuntimeProfile = normalizeRuntimeProfile(this.params.template_overrides);
                const mergedRuntimeProfile = mergeRuntimeProfiles(templateRuntimeProfile, overrideRuntimeProfile, explicitRuntimeProfile);
                const mergedExecutionModeRaw = mergedRuntimeProfile.execution_mode;
                const mergedExecutionMode = mergedExecutionModeRaw && mergedExecutionModeRaw !== "default"
                    ? mergedExecutionModeRaw
                    : undefined;
                const finalExecutionMode = mergedExecutionMode ?? resolvedExecutionMode;
                mergedRuntimeProfile.execution_mode = finalExecutionMode;
                const actionType = mergedRuntimeProfile.action_type ??
                    (mergedRuntimeProfile.action_value ? "prompt" : undefined);
                const actionValue = mergedRuntimeProfile.action_value ?? directPrompt;
                if (!actionType || !actionValue) {
                    throw new Error("Creating a task requires prompt/action_value or a template that provides action content.");
                }
                if (actionValue.length > 10000) {
                    throw new Error(`Action value is too long (${actionValue.length} characters). Maximum is 10000 characters.`);
                }
                if (actionType === "slash_command" &&
                    finalExecutionMode !== "in_process") {
                    throw new Error('slash_command action_type requires execution_mode="in_process".');
                }
                const returnToSessionId = typeof this.params.return_to_session_id === "string" &&
                    this.params.return_to_session_id.trim().length > 0
                    ? this.params.return_to_session_id.trim()
                    : this.sourceSessionId;
                const idempotencyKey = typeof this.params.idempotency_key === "string" &&
                    this.params.idempotency_key.trim().length > 0
                    ? this.params.idempotency_key.trim()
                    : undefined;
                await reconcileLaunchTaskState(runtime.workspaceRoot);
                const existingTaskById = await getLaunchTaskState(runtime.workspaceRoot, id);
                if (existingTaskById &&
                    !isLaunchTaskTerminal(existingTaskById.status)) {
                    return this.formatExistingTask(existingTaskById, `Task "${id}" is already ${existingTaskById.status}. Reusing existing task handle.`);
                }
                if (idempotencyKey) {
                    const existingByKey = await findActiveLaunchTaskByDedupeKey(runtime.workspaceRoot, idempotencyKey, returnToSessionId);
                    if (existingByKey) {
                        return this.formatExistingTask(existingByKey, `Found existing ${existingByKey.status} task with idempotency_key "${idempotencyKey}". Reusing task "${existingByKey.task_id}".`);
                    }
                }
                const initialRequestedMode = finalExecutionMode;
                await upsertLaunchTaskState(runtime.workspaceRoot, id, (_current, nowIso) => ({
                    task_id: id,
                    status: "queued",
                    created_at: nowIso,
                    last_heartbeat: nowIso,
                    prompt_preview: actionValue.trim().slice(0, 400),
                    parent_session_id: returnToSessionId,
                    source_session_id: this.sourceSessionId,
                    dedupe_key: idempotencyKey,
                    template_id: template?.id,
                    template_level: template?.level,
                    execution_mode_requested: initialRequestedMode,
                    execution_mode_actual: initialRequestedMode,
                    model_requested: mergedRuntimeProfile.model?.name,
                    auth_requested: mergedRuntimeProfile.auth,
                    runtime_profile: sanitizeRuntimeProfile(mergedRuntimeProfile),
                }));
                // Launch the new LowCal instance
                let launchResult;
                try {
                    launchResult = await this.launchLowCalInstance(id, actionType, actionValue, finalExecutionMode, runtime, returnToSessionId, mergedRuntimeProfile);
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    await upsertLaunchTaskState(runtime.workspaceRoot, id, (current, nowIso) => ({
                        task_id: id,
                        status: "failed",
                        created_at: current?.created_at ?? nowIso,
                        started_at: current?.started_at,
                        finished_at: nowIso,
                        last_heartbeat: nowIso,
                        prompt_preview: current?.prompt_preview ?? actionValue.trim().slice(0, 400),
                        parent_session_id: current?.parent_session_id ?? returnToSessionId,
                        source_session_id: current?.source_session_id ?? this.sourceSessionId,
                        dedupe_key: current?.dedupe_key ?? idempotencyKey,
                        template_id: current?.template_id ?? template?.id,
                        template_level: current?.template_level ?? template?.level,
                        execution_mode_requested: current?.execution_mode_requested ??
                            finalExecutionMode ??
                            resolvedExecutionMode,
                        execution_mode_actual: current?.execution_mode_actual ??
                            finalExecutionMode ??
                            resolvedExecutionMode,
                        model_requested: current?.model_requested ?? mergedRuntimeProfile.model?.name,
                        auth_requested: current?.auth_requested ?? mergedRuntimeProfile.auth,
                        runtime_profile: current?.runtime_profile ??
                            sanitizeRuntimeProfile(mergedRuntimeProfile),
                        result_ref: current?.result_ref,
                        last_error: errorMessage,
                        pid: current?.pid,
                        tab_name: current?.tab_name,
                    }));
                    throw error;
                }
                await upsertLaunchTaskState(runtime.workspaceRoot, id, (current, nowIso) => ({
                    task_id: id,
                    status: "running",
                    created_at: current?.created_at ?? nowIso,
                    started_at: current?.started_at ?? nowIso,
                    last_heartbeat: nowIso,
                    prompt_preview: current?.prompt_preview ?? actionValue.trim().slice(0, 400),
                    parent_session_id: current?.parent_session_id ?? returnToSessionId,
                    source_session_id: current?.source_session_id ?? this.sourceSessionId,
                    dedupe_key: current?.dedupe_key ?? idempotencyKey,
                    template_id: current?.template_id ?? template?.id,
                    template_level: current?.template_level ?? template?.level,
                    execution_mode_requested: current?.execution_mode_requested ??
                        finalExecutionMode ??
                        resolvedExecutionMode,
                    execution_mode_actual: launchResult.actualMode,
                    model_requested: current?.model_requested ?? mergedRuntimeProfile.model?.name,
                    model_actual: launchResult.runtimeProfile?.model?.name ??
                        current?.model_actual ??
                        mergedRuntimeProfile.model?.name,
                    auth_requested: current?.auth_requested ?? mergedRuntimeProfile.auth,
                    auth_actual: launchResult.runtimeProfile?.auth ??
                        current?.auth_actual ??
                        mergedRuntimeProfile.auth,
                    runtime_profile: current?.runtime_profile ??
                        sanitizeRuntimeProfile(mergedRuntimeProfile),
                    result_ref: {
                        mailbox_path: launchResult.returnMailboxPath ??
                            current?.result_ref?.mailbox_path,
                        output_path: launchResult.logPath ?? current?.result_ref?.output_path,
                        child_session_id: current?.result_ref?.child_session_id,
                        message_timestamp: current?.result_ref?.message_timestamp,
                    },
                    last_error: undefined,
                    pid: launchResult.pid ?? current?.pid,
                    tab_name: launchResult.tabName ?? current?.tab_name,
                }));
                const modeIgnoredWarning = execution_mode &&
                    execution_mode !== "default" &&
                    !shouldOverrideExecutionMode
                    ? `execution_mode="${execution_mode}" was ignored because execution_mode_override=true was not set. Used default mode "${resolvedExecutionMode}".`
                    : undefined;
                const warning = launchResult.warning && modeIgnoredWarning
                    ? `${launchResult.warning} ${modeIgnoredWarning}`
                    : (launchResult.warning ?? modeIgnoredWarning);
                const resultWithWarnings = warning !== launchResult.warning
                    ? { ...launchResult, warning }
                    : launchResult;
                return this.formatTaskCreated(id, actionValue, description, resultWithWarnings);
            }
            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }
    async resolveRuntimePaths() {
        const moduleDir = path.dirname(fileURLToPath(import.meta.url));
        const cwd = process.cwd();
        const envRoot = process.env["LOWCAL_SCHEDULER_CWD"]?.trim();
        const entryScriptPath = process.argv[1]?.trim();
        const entryScriptDir = entryScriptPath
            ? path.dirname(path.resolve(entryScriptPath))
            : undefined;
        const workspaceRoot = envRoot && envRoot.length > 0 ? envRoot : cwd;
        const candidateRoots = Array.from(new Set([
            ...(envRoot ? collectAncestorDirectories(envRoot) : []),
            ...collectAncestorDirectories(cwd),
            ...(entryScriptDir ? collectAncestorDirectories(entryScriptDir) : []),
            ...collectAncestorDirectories(moduleDir),
        ]));
        for (const root of candidateRoots) {
            const cliPath = path.join(root, HEADLESS_CLI_RELATIVE_PATH);
            try {
                await fs.access(cliPath);
                return {
                    workspaceRoot,
                    cliPath,
                };
            }
            catch {
                // Try next candidate.
            }
        }
        throw new Error(`Unable to locate headless runtime at ${HEADLESS_CLI_RELATIVE_PATH}. Current cwd: ${cwd}. Searched roots: ${candidateRoots.join(", ")}`);
    }
    async launchLowCalInstance(id, actionType, actionValue, executionMode, runtime, returnToSessionId, runtimeProfile) {
        const returnMailboxPath = typeof returnToSessionId === "string" &&
            returnToSessionId.trim().length > 0
            ? path.join(runtime.workspaceRoot, ".lowcal", "session-messages", `${returnToSessionId.trim()}.jsonl`)
            : undefined;
        if (executionMode === "in_process") {
            return await this.enqueueInProcessTask(id, actionType, actionValue, runtime, returnToSessionId, runtimeProfile);
        }
        if (actionType === "slash_command") {
            throw new Error('slash_command actions are only supported in "in_process" mode.');
        }
        if (executionMode === "zellij_tab") {
            if (!isRunningInZellijSession()) {
                const fallback = await this.spawnHeadlessJob(id, actionValue, runtime, returnToSessionId, returnMailboxPath, runtimeProfile);
                return {
                    ...fallback,
                    requestedMode: "zellij_tab",
                    warning: "zellij_tab requested but no active Zellij session detected. Fell back to headless.",
                };
            }
            try {
                return await this.spawnZellijJob(id, actionValue, runtime, returnToSessionId, returnMailboxPath, runtimeProfile);
            }
            catch (error) {
                const fallback = await this.spawnHeadlessJob(id, actionValue, runtime, returnToSessionId, returnMailboxPath, runtimeProfile);
                return {
                    ...fallback,
                    requestedMode: "zellij_tab",
                    warning: `zellij_tab failed, fell back to headless: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        }
        return await this.spawnHeadlessJob(id, actionValue, runtime, returnToSessionId, returnMailboxPath, runtimeProfile);
    }
    async spawnHeadlessJob(id, prompt, runtime, returnToSessionId, returnMailboxPath, runtimeProfile) {
        const { spawn } = await import("child_process");
        const schedulerCwd = runtime.workspaceRoot;
        const cliPath = runtime.cliPath;
        // Determine output log file
        const logDir = path.join(schedulerCwd, ".lowcal", "launch-tasks");
        await fs.mkdir(logDir, { recursive: true });
        const logFile = path.join(logDir, `${id}.json`);
        const env = {
            ...process.env,
            LOWCAL_HEADLESS: "1",
            LOWCAL_JOB_ID: id,
            LOWCAL_HEADLESS_PRETTY: "1",
            [ENV_DISABLE_LAUNCH_TASK]: "1",
        };
        if (returnToSessionId && returnMailboxPath) {
            env[ENV_RETURN_TO_SESSION_ID] = returnToSessionId;
            env[ENV_RETURN_MAILBOX_PATH] = returnMailboxPath;
            env[ENV_RETURN_FROM_TASK_ID] = id;
        }
        if (runtimeProfile) {
            env[ENV_TASK_RUNTIME_B64] = Buffer.from(JSON.stringify(sanitizeRuntimeProfile(runtimeProfile))).toString("base64");
        }
        const args = [
            cliPath,
            "--prompt",
            prompt,
            "--job-id",
            id,
            "--output",
            logFile,
        ];
        return await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, args, {
                stdio: "ignore",
                env,
                cwd: schedulerCwd,
                detached: true, // Detach from parent process
            });
            let settled = false;
            child.on("error", (error) => {
                if (settled)
                    return;
                settled = true;
                reject(error);
            });
            child.on("spawn", () => {
                if (settled)
                    return;
                settled = true;
                child.unref();
                resolve({
                    requestedMode: "headless",
                    actualMode: "headless",
                    logPath: logFile,
                    pid: child.pid ?? undefined,
                    returnMailboxPath,
                    returnToSessionId,
                    runtimeProfile: sanitizeRuntimeProfile(runtimeProfile),
                });
            });
            child.on("exit", (code, signal) => {
                if (settled)
                    return;
                settled = true;
                if (code !== 0) {
                    reject(new Error(`Process exited with code ${code}`));
                }
                else {
                    reject(new Error(`Process exited before launch was acknowledged (signal: ${signal ?? "none"}).`));
                }
            });
        });
    }
    async spawnZellijJob(id, prompt, runtime, returnToSessionId, returnMailboxPath, runtimeProfile) {
        const schedulerCwd = runtime.workspaceRoot;
        const cliPath = runtime.cliPath;
        const logPath = path.join(schedulerCwd, ".lowcal", "logs", `launch-${id}-${Date.now()}.log`);
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        const tabName = `task:${id}`;
        // Ensure Zellij tab exists
        await this.runZellijCommand([
            "action",
            "new-tab",
            "--name",
            tabName,
            "--cwd",
            schedulerCwd,
        ]);
        // Go to the tab
        await this.runZellijCommand(["action", "go-to-tab-name", tabName]);
        // Environment variables to set (NOT quoted - shell needs to interpret these)
        const envVars = [
            `LOWCAL_HEADLESS=1`,
            `LOWCAL_JOB_ID=${id}`,
            `LOWCAL_HEADLESS_PRETTY=1`,
            `${ENV_DISABLE_LAUNCH_TASK}=1`,
            ...(returnToSessionId
                ? [`${ENV_RETURN_TO_SESSION_ID}=${returnToSessionId}`]
                : []),
            ...(returnMailboxPath
                ? [`${ENV_RETURN_MAILBOX_PATH}=${returnMailboxPath}`]
                : []),
            ...(returnToSessionId ? [`${ENV_RETURN_FROM_TASK_ID}=${id}`] : []),
            ...(runtimeProfile
                ? [
                    `${ENV_TASK_RUNTIME_B64}=${Buffer.from(JSON.stringify(sanitizeRuntimeProfile(runtimeProfile))).toString("base64")}`,
                ]
                : []),
        ];
        // Command arguments (these need to be quoted)
        const commandArgs = [
            "node",
            cliPath,
            "--prompt",
            prompt,
            "--job-id",
            id,
            "--output",
            logPath,
        ];
        // Build command: env vars (unquoted) + command args (quoted)
        const command = `cd ${this.shellQuoteArg(schedulerCwd)} && ${envVars.join(" ")} ${commandArgs
            .map(this.shellQuoteArg)
            .join(" ")}; printf '\\n[scheduler idle]\\n'`;
        try {
            await this.runZellijCommand(["action", "write-chars", `${command}\n`]);
        }
        catch {
            await this.runZellijCommand(["action", "write", `${command}\n`]);
        }
        return {
            requestedMode: "zellij_tab",
            actualMode: "zellij_tab",
            logPath,
            tabName,
            returnMailboxPath,
            returnToSessionId,
            runtimeProfile: sanitizeRuntimeProfile(runtimeProfile),
        };
    }
    parseControlResult(value) {
        if (!value || typeof value !== "object") {
            return null;
        }
        const record = value;
        const accepted = record["accepted"];
        if (typeof accepted !== "boolean") {
            return null;
        }
        return {
            accepted,
            reason: typeof record["reason"] === "string" ? record["reason"] : undefined,
            action_id: typeof record["action_id"] === "string"
                ? record["action_id"]
                : undefined,
        };
    }
    async callSessionApi(socketPath, method, authToken, params) {
        return await new Promise((resolve) => {
            const request = {
                id: `launch-task-${Date.now()}`,
                method,
                auth_token: authToken,
                params,
            };
            let resolved = false;
            let buffer = "";
            const socket = net.createConnection({ path: socketPath });
            const timeout = setTimeout(() => {
                if (resolved)
                    return;
                resolved = true;
                socket.destroy();
                resolve(null);
            }, 1500);
            const finish = (value) => {
                if (resolved)
                    return;
                resolved = true;
                clearTimeout(timeout);
                socket.destroy();
                resolve(value);
            };
            socket.on("connect", () => {
                socket.write(`${JSON.stringify(request)}\n`);
            });
            socket.on("data", (chunk) => {
                buffer += chunk.toString();
                const newlineIndex = buffer.indexOf("\n");
                if (newlineIndex < 0)
                    return;
                const line = buffer.slice(0, newlineIndex).trim();
                if (!line) {
                    finish(null);
                    return;
                }
                try {
                    finish(JSON.parse(line));
                }
                catch {
                    finish(null);
                }
            });
            socket.on("error", () => finish(null));
            socket.on("end", () => finish(null));
        });
    }
    async enqueueInProcessTask(id, actionType, actionValue, runtime, returnToSessionId, runtimeProfile) {
        const targetSessionId = returnToSessionId ?? this.sourceSessionId;
        if (!targetSessionId) {
            throw new Error("in_process mode requires an interactive target session. Set return_to_session_id or run from an interactive session.");
        }
        const session = await getSession(targetSessionId);
        if (!session || !session.api) {
            throw new Error(`Target session "${targetSessionId}" is not available for in_process execution.`);
        }
        if (session.api.transport !== "unix") {
            throw new Error(`Unsupported session API transport for in_process mode: ${session.api.transport}`);
        }
        const payload = {
            task_id: id,
            action_type: actionType,
            action_value: actionValue,
            description: this.params.description,
            source_session_id: this.sourceSessionId,
            return_to_session_id: targetSessionId,
            runtime_profile: sanitizeRuntimeProfile(runtimeProfile),
        };
        const response = await this.callSessionApi(session.api.address, "session.enqueue_task", session.api.auth_token, payload);
        if (!response || response.ok !== true) {
            const reason = response?.error ?? "session API unavailable";
            throw new Error(`Failed to enqueue in_process task: ${reason}`);
        }
        const control = this.parseControlResult(response.result);
        if (!control || !control.accepted) {
            throw new Error(`Failed to enqueue in_process task: ${control?.reason ?? "rejected"}`);
        }
        return {
            requestedMode: "in_process",
            actualMode: "in_process",
            logPath: path.join(runtime.workspaceRoot, ".lowcal", "in-process-tasks", `${targetSessionId}.jsonl`),
            returnToSessionId: targetSessionId,
            runtimeProfile: sanitizeRuntimeProfile(runtimeProfile),
        };
    }
    async runZellijCommand(args) {
        const { spawn } = await import("child_process");
        await new Promise((resolve, reject) => {
            const child = spawn("zellij", args, {
                stdio: ["ignore", "pipe", "pipe"],
                env: process.env,
            });
            let stdout = "";
            let stderr = "";
            child.stdout?.on("data", (data) => {
                stdout += data.toString();
            });
            child.stderr?.on("data", (data) => {
                stderr += data.toString();
            });
            child.on("error", (error) => {
                reject(error);
            });
            child.on("close", (code) => {
                const output = `${stdout}\n${stderr}`.trim();
                const missingSessionOutput = output.includes("Please specify the session name to send actions to") || output.includes("No active zellij session found");
                if (code === 0 && !missingSessionOutput) {
                    resolve();
                }
                else {
                    reject(new Error(output ||
                        `zellij command failed with exit code ${code ?? "unknown"}`));
                }
            });
        });
    }
    shellQuoteArg(value) {
        if (value.length === 0) {
            return "''";
        }
        // Escape single quotes by ending the quote, adding an escaped quote, then starting a new quote
        return `'${value.replace(/'/g, `'"'"'`)}'`;
    }
    formatExistingTask(existing, reason) {
        let output = `✓ Reused existing LowCal task "${existing.task_id}"\n\n`;
        output += `Reason: ${reason}\n`;
        output += `Status: ${existing.status}\n`;
        if (existing.execution_mode_actual) {
            output += `Execution Mode: ${existing.execution_mode_actual}\n`;
        }
        if (existing.pid) {
            output += `PID: ${existing.pid}\n`;
        }
        if (existing.tab_name) {
            output += `Tab: ${existing.tab_name}\n`;
        }
        if (existing.parent_session_id) {
            output += `Return target session: ${existing.parent_session_id}\n`;
        }
        if (existing.result_ref?.mailbox_path) {
            output += `Return mailbox: ${existing.result_ref.mailbox_path}\n`;
        }
        if (existing.result_ref?.output_path) {
            output += `Output: ${existing.result_ref.output_path}\n`;
        }
        if (existing.last_error) {
            output += `Last error: ${existing.last_error}\n`;
        }
        output += `\nUse read_session_messages (action: "wait" or "pull") to receive completion updates.\nTask state is tracked in .lowcal/launch-task-state.json.`;
        return output;
    }
    formatTaskCreated(id, prompt, description, result) {
        let output = `✓ Launched new LowCal instance "${id}"\n\n`;
        const requestedMode = result?.requestedMode ?? "headless";
        const actualMode = result?.actualMode ?? requestedMode;
        output += `Execution Mode: ${actualMode}`;
        if (requestedMode !== actualMode) {
            output += ` (requested: ${requestedMode})`;
        }
        output += "\n";
        if (description) {
            output += `Description: ${description}\n`;
        }
        if (result?.pid) {
            output += `PID: ${result.pid}\n`;
        }
        if (result?.tabName) {
            output += `Tab: ${result.tabName}\n`;
        }
        if (result?.warning) {
            output += `Warning: ${result.warning}\n`;
        }
        if (result?.returnMailboxPath) {
            output += `Return mailbox: ${result.returnMailboxPath}\n`;
        }
        if (result?.returnToSessionId) {
            output += `Return target session: ${result.returnToSessionId}\n`;
        }
        output += `\nPrompt:\n${prompt}\n\n`;
        output += `The task is running in the background. `;
        if (result?.returnToSessionId) {
            output += `Use read_session_messages (action: "wait" or "pull") to receive its completion message. `;
        }
        output += `Task state is tracked in .lowcal/launch-task-state.json. `;
        output +=
            actualMode === "headless"
                ? `Debug logs are available at .lowcal/launch-tasks/${id}.json`
                : actualMode === "zellij_tab"
                    ? `Check your Zellij tab for progress.`
                    : `Task was queued in-process and will run in the target interactive session.`;
        return output;
    }
}
export class LaunchTaskTool extends BaseDeclarativeTool {
    config;
    constructor(config) {
        super("launch_task", "Launch Task", launchTaskToolDescription, Kind.Other, launchTaskToolSchemaData.parametersJsonSchema, true, // isOutputMarkdown
        false);
        this.config = config;
    }
    createInvocation(params) {
        const configuredMode = process.env["LOWCAL_SCHEDULER_DEFAULT_MODE"];
        const defaultExecutionMode = configuredMode === "zellij_tab" ? "zellij_tab" : "headless";
        return new LaunchTaskInvocation(params, this.config?.getSessionId(), defaultExecutionMode);
    }
}
//# sourceMappingURL=launch-task.js.map