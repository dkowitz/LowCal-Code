/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Headless LowCal Execution Mode
 *
 * This module provides a headless (non-interactive) execution mode for LowCal,
 * designed to be spawned by the scheduler daemon to execute scheduled jobs.
 *
 * Usage: node headless.js --prompt "<prompt>" --job-id <id> --output <logfile>
 */
import * as fs from "fs/promises";
import * as path from "path";
import * as process from "process";
import { upsertLaunchTaskState } from "@qwen-code/qwen-code-core";
import { normalizeAuthType } from "../config/auth.js";
import { startSessionRegistration, stopSessionRegistration, updateSessionDetails, } from "../session/sessionManager.js";
import { loadCliToolConfig, syncCoreToolConfig, } from "../ui/commands/utils/toolConfig.js";
const RETURN_PAYLOAD_MARKER = "RETURN_PAYLOAD:";
const ENV_DISABLE_LAUNCH_TASK = "LOWCAL_DISABLE_LAUNCH_TASK";
const ENV_TASK_RUNTIME_B64 = "LOWCAL_TASK_RUNTIME_B64";
const ENV_TASK_SYSTEM_PROMPT_B64 = "LOWCAL_TASK_SYSTEM_PROMPT_B64";
function decodeRuntimeProfileFromEnv() {
    const encoded = process.env[ENV_TASK_RUNTIME_B64];
    if (!encoded || encoded.trim().length === 0) {
        return undefined;
    }
    try {
        const raw = Buffer.from(encoded, "base64").toString("utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return undefined;
        }
        return parsed;
    }
    catch {
        return undefined;
    }
}
function applyRuntimeSystemPromptEnv(runtimeProfile) {
    const profile = runtimeProfile?.system_prompt;
    if (!profile) {
        delete process.env[ENV_TASK_SYSTEM_PROMPT_B64];
        return;
    }
    if (profile.disable === true) {
        process.env[ENV_TASK_SYSTEM_PROMPT_B64] = Buffer.from(JSON.stringify({ disable: true }), "utf-8").toString("base64");
        return;
    }
    const names = Array.isArray(profile.names)
        ? profile.names
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0)
        : [];
    if (names.length === 0) {
        delete process.env[ENV_TASK_SYSTEM_PROMPT_B64];
        return;
    }
    process.env[ENV_TASK_SYSTEM_PROMPT_B64] = Buffer.from(JSON.stringify({
        names,
        exclusive: profile.exclusive === true,
    }), "utf-8").toString("base64");
}
function getAuthLabel(auth) {
    if (!auth)
        return undefined;
    if (auth.providerId && auth.providerId.trim().length > 0) {
        return auth.providerId;
    }
    if (auth.selectedType && auth.selectedType.trim().length > 0) {
        return auth.selectedType;
    }
    return undefined;
}
/**
 * Extract clean markdown content from stdout by stripping ANSI codes and tool call markers.
 * Returns just the LLM's final response content, suitable for saving as a .md file.
 */
function extractCleanMarkdown(stdout) {
    let text = stripAnsiForReturn(stdout);
    // Remove tool call headers/footers
    const toolBlockRegex = /┌─ (TOOL CALL|TOOL RESULT|TOOL ERROR|TOOL):\s*[\s\S]*?└────────────────────────/g;
    text = text.replace(toolBlockRegex, "");
    // Remove "Error executing tool" lines
    text = text.replace(/Error executing tool[^\n]*\n/g, "");
    // Extract content between LLM markers (┌─ LLM ... │content... └────────────────────────)
    const llmBlocks = [];
    const llmRegex = /┌─ LLM\s*[\s\S]*?│([\s\S]*?)\n└────────────────────────/g;
    let match;
    while ((match = llmRegex.exec(text)) !== null) {
        // Extract content between │ and └
        let content = match[1].trim();
        // Clean up leading │ characters from multi-line responses
        content = content.replace(/^│\s*/gm, "").trim();
        if (content.length > 0) {
            llmBlocks.push(content);
        }
    }
    // Join all LLM responses with newlines
    const cleanContent = llmBlocks.join("\n\n").trim();
    return cleanContent;
}
function stripAnsiForReturn(text) {
    // Strip most ANSI escape sequences so we can reliably parse explicit markers.
    return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
function extractReturnPayload(text) {
    const normalized = stripAnsiForReturn(text);
    const markerIndex = normalized.lastIndexOf(RETURN_PAYLOAD_MARKER);
    if (markerIndex < 0) {
        return undefined;
    }
    const afterMarker = normalized
        .slice(markerIndex + RETURN_PAYLOAD_MARKER.length)
        .split("\n")[0]
        ?.trim();
    if (!afterMarker) {
        return undefined;
    }
    return afterMarker;
}
async function appendSessionReturnMessage(status, sessionRunId, jobId, outputPath, prompt, payload) {
    const mailboxPath = process.env["LOWCAL_RETURN_MAILBOX_PATH"];
    const toSessionId = process.env["LOWCAL_RETURN_TO_SESSION_ID"];
    const fromTaskId = process.env["LOWCAL_RETURN_FROM_TASK_ID"] ?? jobId;
    if (!mailboxPath || !toSessionId) {
        return;
    }
    const previewSource = status === "success"
        ? payload.result ?? ""
        : payload.error ?? "Task failed with unknown error";
    const explicitReturnPayload = status === "success" && payload.result
        ? extractReturnPayload(payload.result)
        : undefined;
    // Extract clean markdown content for the result file
    let cleanMarkdown = "";
    if (status === "success" && payload.result) {
        cleanMarkdown = extractCleanMarkdown(payload.result);
    }
    const preview = previewSource.trim().slice(0, 1200);
    const promptPreview = prompt.trim().slice(0, 400);
    // Write clean markdown file when returnToSessionId is set
    let resultFilePath;
    if (cleanMarkdown.length > 0 && toSessionId) {
        try {
            const resultsDir = path.join(process.cwd(), ".lowcal", "results");
            await fs.mkdir(resultsDir, { recursive: true });
            resultFilePath = path.join(resultsDir, `${jobId}.md`);
            await fs.writeFile(resultFilePath, cleanMarkdown, "utf-8");
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Headless] Failed to write result file for task ${jobId}: ${errorMessage}`);
        }
    }
    const message = {
        to_session_id: toSessionId,
        from_session_id: sessionRunId,
        from_task_id: fromTaskId,
        job_id: jobId,
        status,
        timestamp: new Date().toISOString(),
        prompt_preview: promptPreview,
        preview,
        output_path: outputPath,
        return_payload: explicitReturnPayload,
    };
    // Include result_file_path as the primary payload when available
    if (resultFilePath) {
        message.result_file_path = resultFilePath;
    }
    try {
        await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
        await fs.appendFile(mailboxPath, `${JSON.stringify(message)}\n`, "utf-8");
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Headless] Failed to write return message for task ${jobId}: ${errorMessage}`);
    }
}
// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let prompt = "";
    let jobId = "";
    let output = "";
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--prompt":
                prompt = args[++i] || "";
                break;
            case "--job-id":
                jobId = args[++i] || "";
                break;
            case "--output":
                output = args[++i] || "";
                break;
            default:
                break;
        }
    }
    if (!prompt) {
        console.error("Error: --prompt is required");
        process.exit(1);
    }
    if (!jobId) {
        console.error("Error: --job-id is required");
        process.exit(1);
    }
    if (!output) {
        console.error("Error: --output is required");
        process.exit(1);
    }
    return { prompt, jobId, output };
}
/**
 * Main execution function
 */
async function main() {
    const { prompt, jobId, output } = parseArgs();
    const runtimeProfile = decodeRuntimeProfileFromEnv();
    applyRuntimeSystemPromptEnv(runtimeProfile);
    const runtimeAuthLabel = getAuthLabel(runtimeProfile?.auth);
    const runtimeModel = runtimeProfile?.model?.name;
    const prettyOutput = process.env["LOWCAL_HEADLESS_PRETTY"] === "1";
    const sessionRunId = `headless-${jobId}-${Date.now()}`;
    const returnToSessionId = process.env["LOWCAL_RETURN_TO_SESSION_ID"];
    const launchStateBaseDir = process.cwd();
    const taskPromptPreview = prompt.trim().slice(0, 400);
    const touchTaskState = async (updater) => {
        try {
            await upsertLaunchTaskState(launchStateBaseDir, jobId, updater);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Headless] Failed to update launch task state for ${jobId}: ${message}`);
        }
    };
    await startSessionRegistration({
        id: sessionRunId,
        mode: "headless",
        status: "working",
        details: {
            job_id: jobId,
            phase: "initializing",
            model: runtimeModel,
            auth_type: runtimeAuthLabel,
        },
        capabilities: {
            observe: true,
            control: true,
            interact: false,
        },
        cwd: process.cwd(),
    });
    const COLORS = {
        reset: "\x1b[0m",
        bold: "\x1b[1m",
        italic: "\x1b[3m",
        dim: "\x1b[2m",
        brightBlue: "\x1b[94m",
        brightCyan: "\x1b[96m",
        brightGreen: "\x1b[92m",
        brightYellow: "\x1b[93m",
        brightRed: "\x1b[91m",
        brightMagenta: "\x1b[95m",
    };
    const borderLine = (text, color) => `${color}${text}${COLORS.reset}`;
    const runStart = new Date();
    if (prettyOutput) {
        console.log(`${COLORS.bold}${borderLine("╭─ Scheduled Run", COLORS.brightBlue)}`);
        console.log(`${borderLine("│", COLORS.brightBlue)} ${COLORS.bold}Job${COLORS.reset}: ${jobId}`);
        console.log(`${borderLine("│", COLORS.brightBlue)} ${COLORS.bold}Start${COLORS.reset}: ${runStart.toLocaleString()}`);
        console.log(`${borderLine("│", COLORS.brightBlue)} ${COLORS.bold}Prompt${COLORS.reset}: ${prompt.substring(0, 140)}${prompt.length > 140 ? "..." : ""}`);
        console.log(`${borderLine("│", COLORS.brightBlue)} ${COLORS.bold}CWD${COLORS.reset}: ${process.cwd()}`);
        console.log(`${COLORS.bold}${borderLine("╰────────────────────", COLORS.brightBlue)}`);
    }
    else {
        console.log(`[Headless] Starting job ${jobId}`);
        console.log(`[Headless] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);
    }
    await touchTaskState((current, nowIso) => ({
        task_id: jobId,
        status: "running",
        created_at: current?.created_at ?? nowIso,
        started_at: current?.started_at ?? nowIso,
        last_heartbeat: nowIso,
        prompt_preview: current?.prompt_preview ?? taskPromptPreview,
        parent_session_id: current?.parent_session_id ?? returnToSessionId,
        source_session_id: current?.source_session_id,
        dedupe_key: current?.dedupe_key,
        execution_mode_requested: current?.execution_mode_requested ?? "headless",
        execution_mode_actual: "headless",
        model_requested: current?.model_requested ?? runtimeModel,
        auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
        runtime_profile: current?.runtime_profile ?? runtimeProfile,
        result_ref: current?.result_ref,
        pid: current?.pid,
        tab_name: current?.tab_name,
        last_error: undefined,
    }));
    const heartbeatTimer = setInterval(() => {
        void touchTaskState((current, nowIso) => ({
            task_id: jobId,
            status: current?.status === "queued" ? "running" : (current?.status ?? "running"),
            created_at: current?.created_at ?? nowIso,
            started_at: current?.started_at ?? nowIso,
            last_heartbeat: nowIso,
            prompt_preview: current?.prompt_preview ?? taskPromptPreview,
            parent_session_id: current?.parent_session_id ?? returnToSessionId,
            source_session_id: current?.source_session_id,
            dedupe_key: current?.dedupe_key,
            execution_mode_requested: current?.execution_mode_requested ?? "headless",
            execution_mode_actual: "headless",
            model_requested: current?.model_requested ?? runtimeModel,
            auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
            runtime_profile: current?.runtime_profile ?? runtimeProfile,
            result_ref: current?.result_ref,
            pid: current?.pid,
            tab_name: current?.tab_name,
            last_error: current?.last_error,
        }));
    }, 10000);
    heartbeatTimer.unref();
    try {
        // Import required modules
        const { Config, ApprovalMode, DEFAULT_GEMINI_EMBEDDING_MODEL, AuthType } = await import("@qwen-code/qwen-code-core");
        const { loadSettings, loadEnvironment } = await import("../config/settings.js");
        const { loadHierarchicalGeminiMemory } = await import("../config/config.js");
        const { FileDiscoveryService } = await import("@qwen-code/qwen-code-core");
        const { runNonInteractive } = await import("../nonInteractiveCli.js");
        const cwd = process.cwd();
        // Load settings
        const settings = loadSettings(cwd);
        if (settings.errors.length > 0) {
            throw new Error(`Settings errors: ${settings.errors.map((e) => e.message).join(", ")}`);
        }
        // Load environment variables from .env files (API keys, etc.)
        loadEnvironment(settings.merged);
        // Create file service
        const fileService = new FileDiscoveryService(cwd);
        // Load memory
        const memoryImportFormat = settings.merged.context?.importFormat || "tree";
        const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(cwd, [], false, // debugMode
        fileService, settings.merged, [], memoryImportFormat);
        // Determine approval mode - use YOLO for scheduled tasks to avoid interactive prompts
        const approvalMode = ApprovalMode.YOLO;
        const selectedTypeFromSettings = settings.merged.security?.auth?.selectedType;
        const providerIdFromSettings = settings.merged.security?.auth?.providerId;
        const providers = settings.merged.security?.auth?.providers;
        const runtimeAuth = runtimeProfile?.auth;
        const runtimeSelectedType = typeof runtimeAuth?.selectedType === "string"
            ? runtimeAuth.selectedType
            : undefined;
        const runtimeProviderId = typeof runtimeAuth?.providerId === "string" &&
            runtimeAuth.providerId.trim().length > 0
            ? runtimeAuth.providerId.trim()
            : undefined;
        const authTypeOverride = normalizeAuthType(runtimeSelectedType ?? runtimeProviderId);
        const authTypeFromSettings = normalizeAuthType(selectedTypeFromSettings);
        const authType = authTypeOverride || authTypeFromSettings || AuthType.USE_GEMINI;
        const providerId = runtimeProviderId ?? providerIdFromSettings;
        const providerBaseUrl = providerId &&
            providers?.[providerId]?.["baseUrl"];
        const baseUrl = runtimeAuth?.baseUrl?.trim() ||
            providerBaseUrl ||
            process.env["OPENAI_BASE_URL"]?.trim();
        if (baseUrl) {
            process.env["OPENAI_BASE_URL"] = baseUrl;
        }
        if (runtimeAuth?.apiKeyEnvVar && runtimeAuth.apiKeyEnvVar.trim().length > 0) {
            const envVarName = runtimeAuth.apiKeyEnvVar.trim();
            const runtimeApiKey = process.env[envVarName]?.trim();
            if (!runtimeApiKey) {
                throw new Error(`Runtime auth override requires env var ${envVarName}, but it is not set.`);
            }
            process.env["OPENAI_API_KEY"] = runtimeApiKey;
        }
        // Get model from runtime profile or settings, fallback to default
        const modelFromSettings = settings.merged.model?.name;
        const model = runtimeModel || modelFromSettings || "gemini-1.5-flash";
        if (runtimeModel && runtimeModel.trim().length > 0) {
            // Prevent refreshAuth/createContentGeneratorConfig from re-applying a stale
            // OPENAI_MODEL value from the parent shell when this task explicitly sets a model.
            process.env["OPENAI_MODEL"] = runtimeModel.trim();
        }
        await updateSessionDetails({
            model,
            approval_mode: String(approvalMode),
            auth: runtimeAuthLabel ?? String(authType),
            phase: "running",
        });
        await touchTaskState((current, nowIso) => ({
            task_id: jobId,
            status: current?.status ?? "running",
            created_at: current?.created_at ?? nowIso,
            started_at: current?.started_at ?? nowIso,
            last_heartbeat: nowIso,
            prompt_preview: current?.prompt_preview ?? taskPromptPreview,
            parent_session_id: current?.parent_session_id ?? returnToSessionId,
            source_session_id: current?.source_session_id,
            dedupe_key: current?.dedupe_key,
            execution_mode_requested: current?.execution_mode_requested ?? "headless",
            execution_mode_actual: "headless",
            model_requested: current?.model_requested ?? runtimeModel,
            model_actual: current?.model_actual ?? model,
            auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
            auth_actual: current?.auth_actual ?? runtimeProfile?.auth,
            runtime_profile: current?.runtime_profile ?? runtimeProfile,
            result_ref: current?.result_ref,
            pid: current?.pid,
            tab_name: current?.tab_name,
            last_error: current?.last_error,
        }));
        // Create config
        const config = new Config({
            sessionId: sessionRunId,
            embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
            targetDir: cwd,
            cwd,
            model,
            includeDirectories: [],
            loadMemoryFromIncludeDirectories: false,
            debugMode: false,
            question: prompt,
            fullContext: false,
            approvalMode,
            userMemory: memoryContent,
            geminiMdFileCount: fileCount,
            telemetry: {
                enabled: false, // Disable telemetry for headless mode
            },
            usageStatisticsEnabled: false,
            fileFiltering: {
                respectGitIgnore: true,
                respectGeminiIgnore: true,
            },
            tavilyApiKey: settings.merged.advanced?.tavilyApiKey ||
                settings.merged.tavilyApiKey ||
                process.env["TAVILY_API_KEY"],
        });
        const cliToolConfig = loadCliToolConfig();
        const launchTaskDisabledInChild = process.env[ENV_DISABLE_LAUNCH_TASK] === "1";
        let effectiveToolConfig = cliToolConfig;
        if (launchTaskDisabledInChild) {
            const prunedCollections = Object.fromEntries(Object.entries(cliToolConfig.collections).map(([name, tools]) => [
                name,
                tools.filter((toolName) => toolName !== "launch_task"),
            ]));
            effectiveToolConfig = {
                ...cliToolConfig,
                collections: prunedCollections,
            };
        }
        const runtimeToolsetCollection = runtimeProfile?.toolset?.collection?.trim();
        if (runtimeToolsetCollection &&
            runtimeToolsetCollection.length > 0) {
            if (!effectiveToolConfig.collections[runtimeToolsetCollection]) {
                const available = Object.keys(effectiveToolConfig.collections)
                    .sort()
                    .join(", ");
                throw new Error(`Runtime toolset collection "${runtimeToolsetCollection}" was not found. Available collections: ${available || "(none)"}.`);
            }
            effectiveToolConfig = {
                ...effectiveToolConfig,
                activeCollection: runtimeToolsetCollection,
            };
        }
        syncCoreToolConfig(effectiveToolConfig);
        // Initialize config
        await config.initialize();
        // Initialize auth using the configured auth type
        await config.refreshAuth(authType);
        // Inject current timestamp for tasks that need real-time data
        const now = new Date();
        process.env["LOWCAL_CURRENT_TIMESTAMP"] = now.toISOString();
        process.env["LOWCAL_CURRENT_DATE"] = now.toISOString().split("T")[0];
        process.env["LOWCAL_CURRENT_TIME"] = now.toTimeString().split(" ")[0];
        // Use minute-level precision for system context timestamp to improve prefix caching.
        // Millisecond precision would make every task prompt unique, preventing cache reuse.
        const timestampMinute = now.toISOString().slice(0, 16); // "2026-05-04T14:23"
        // Append timestamp at the END (not beginning) to preserve prefix caching
        const systemContext = `\n${prompt}\n\n[System Context - Task timestamp: ${timestampMinute}]`;
        const returnContext = returnToSessionId
            ? `\n[System Context - Parent Session Return Channel]\nThis task was launched by session "${returnToSessionId}".\nYour completion result is returned through a session mailbox.\nDo not tell the parent to read log files.\nDo not call launch_task from this child session.\nWhen finished, include one final line exactly in this format:\n${RETURN_PAYLOAD_MARKER} <concise summary for the parent session>\n`
            : "";
        const fullPrompt = systemContext + returnContext;
        // Capture stdout
        const originalWrite = process.stdout.write;
        const originalWriteErr = process.stderr.write;
        const writeStdout = originalWrite.bind(process.stdout);
        const writeStderr = originalWriteErr.bind(process.stderr);
        let stdout = "";
        let stderr = "";
        const echoStdout = prettyOutput;
        const echoStderr = !prettyOutput;
        process.stdout.write = function (chunk) {
            const str = chunk.toString();
            stdout += str;
            if (!echoStdout)
                return true;
            return writeStdout(chunk);
        };
        process.stderr.write = function (chunk) {
            const str = chunk.toString();
            stderr += str;
            if (!echoStderr)
                return true;
            return writeStderr(chunk);
        };
        // Run the non-interactive mode with the full prompt (including system context)
        const prompt_id = `headless-${jobId}-${Date.now()}`;
        await runNonInteractive(config, fullPrompt, prompt_id);
        // Restore stdout/stderr
        process.stdout.write = originalWrite;
        process.stderr.write = originalWriteErr;
        // Write output to log file
        const outputData = {
            job_id: jobId,
            timestamp: new Date().toISOString(),
            prompt,
            result: stdout,
            stderr: stderr || undefined,
            status: "success",
        };
        await fs.mkdir(path.dirname(output), { recursive: true });
        await fs.writeFile(output, JSON.stringify(outputData, null, 2), "utf-8");
        await appendSessionReturnMessage("success", sessionRunId, jobId, output, prompt, { result: stdout });
        await touchTaskState((current, nowIso) => ({
            task_id: jobId,
            status: "completed",
            created_at: current?.created_at ?? nowIso,
            started_at: current?.started_at ?? nowIso,
            finished_at: nowIso,
            last_heartbeat: nowIso,
            prompt_preview: current?.prompt_preview ?? taskPromptPreview,
            parent_session_id: current?.parent_session_id ?? returnToSessionId,
            source_session_id: current?.source_session_id,
            dedupe_key: current?.dedupe_key,
            execution_mode_requested: current?.execution_mode_requested ?? "headless",
            execution_mode_actual: "headless",
            model_requested: current?.model_requested ?? runtimeModel,
            model_actual: current?.model_actual ?? runtimeModel,
            auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
            auth_actual: current?.auth_actual ?? runtimeProfile?.auth,
            runtime_profile: current?.runtime_profile ?? runtimeProfile,
            result_ref: {
                mailbox_path: process.env["LOWCAL_RETURN_MAILBOX_PATH"] ??
                    current?.result_ref?.mailbox_path,
                output_path: output,
                child_session_id: sessionRunId,
                message_timestamp: nowIso,
            },
            pid: current?.pid,
            tab_name: current?.tab_name,
            last_error: undefined,
        }));
        clearInterval(heartbeatTimer);
        await updateSessionDetails({ phase: "completed" });
        await stopSessionRegistration();
        if (prettyOutput) {
            const durationMs = Date.now() - runStart.getTime();
            console.log(`${COLORS.bold}${borderLine("╭─ Run Summary", COLORS.brightGreen)}`);
            console.log(`${borderLine("│", COLORS.brightGreen)} ${COLORS.bold}Status${COLORS.reset}: ${COLORS.brightGreen}success${COLORS.reset}`);
            console.log(`${borderLine("│", COLORS.brightGreen)} ${COLORS.bold}Finished${COLORS.reset}: ${new Date().toLocaleString()}`);
            console.log(`${borderLine("│", COLORS.brightGreen)} ${COLORS.bold}Duration${COLORS.reset}: ${(durationMs / 1000).toFixed(1)}s`);
            console.log(`${borderLine("│", COLORS.brightGreen)} ${COLORS.bold}Log${COLORS.reset}: ${output}`);
            console.log(`${COLORS.bold}${borderLine("╰──────────────────", COLORS.brightGreen)}`);
        }
        else {
            console.log("[Headless] Job completed successfully");
            console.log(`[Headless] Output written to: ${output}`);
        }
        process.exit(0);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (prettyOutput) {
            const durationMs = Date.now() - runStart.getTime();
            console.log(`${COLORS.bold}${borderLine("╭─ Run Summary", COLORS.brightRed)}`);
            console.log(`${borderLine("│", COLORS.brightRed)} ${COLORS.bold}Status${COLORS.reset}: ${COLORS.brightRed}error${COLORS.reset}`);
            console.log(`${borderLine("│", COLORS.brightRed)} ${COLORS.bold}Finished${COLORS.reset}: ${new Date().toLocaleString()}`);
            console.log(`${borderLine("│", COLORS.brightRed)} ${COLORS.bold}Duration${COLORS.reset}: ${(durationMs / 1000).toFixed(1)}s`);
            console.log(`${borderLine("│", COLORS.brightRed)} ${COLORS.bold}Error${COLORS.reset}: ${errorMessage}`);
            console.log(`${borderLine("│", COLORS.brightRed)} ${COLORS.bold}Log${COLORS.reset}: ${output}`);
            console.log(`${COLORS.bold}${borderLine("╰──────────────────", COLORS.brightRed)}`);
        }
        else {
            console.error("[Headless] Error:", errorMessage);
        }
        // Write error to output file
        const errorData = {
            job_id: jobId,
            timestamp: new Date().toISOString(),
            prompt,
            error: errorMessage,
            status: "error",
        };
        try {
            await fs.mkdir(path.dirname(output), { recursive: true });
            await fs.writeFile(output, JSON.stringify(errorData, null, 2), "utf-8");
            await appendSessionReturnMessage("error", sessionRunId, jobId, output, prompt, { error: errorMessage });
            await touchTaskState((current, nowIso) => ({
                task_id: jobId,
                status: "failed",
                created_at: current?.created_at ?? nowIso,
                started_at: current?.started_at ?? nowIso,
                finished_at: nowIso,
                last_heartbeat: nowIso,
                prompt_preview: current?.prompt_preview ?? taskPromptPreview,
                parent_session_id: current?.parent_session_id ?? returnToSessionId,
                source_session_id: current?.source_session_id,
                dedupe_key: current?.dedupe_key,
                execution_mode_requested: current?.execution_mode_requested ?? "headless",
                execution_mode_actual: "headless",
                model_requested: current?.model_requested ?? runtimeModel,
                model_actual: current?.model_actual ?? runtimeModel,
                auth_requested: current?.auth_requested ?? runtimeProfile?.auth,
                auth_actual: current?.auth_actual ?? runtimeProfile?.auth,
                runtime_profile: current?.runtime_profile ?? runtimeProfile,
                result_ref: {
                    mailbox_path: process.env["LOWCAL_RETURN_MAILBOX_PATH"] ??
                        current?.result_ref?.mailbox_path,
                    output_path: output,
                    child_session_id: sessionRunId,
                    message_timestamp: nowIso,
                },
                pid: current?.pid,
                tab_name: current?.tab_name,
                last_error: errorMessage,
            }));
        }
        catch (writeError) {
            console.error("[Headless] Failed to write error log:", writeError);
        }
        clearInterval(heartbeatTimer);
        await updateSessionDetails({ phase: "error", last_error: errorMessage });
        await stopSessionRegistration();
        process.exit(1);
    }
}
// Run main
main();
//# sourceMappingURL=headless.js.map