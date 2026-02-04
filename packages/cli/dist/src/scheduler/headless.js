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
import { normalizeAuthType } from "../config/auth.js";
import { loadCliToolConfig, syncCoreToolConfig, } from "../ui/commands/utils/toolConfig.js";
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
    console.log(`[Headless] Starting job ${jobId}`);
    console.log(`[Headless] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);
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
            throw new Error(`Settings errors: ${settings.errors.map(e => e.message).join(", ")}`);
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
        // Get auth type from settings, fallback to USE_GEMINI
        const authTypeFromSettings = normalizeAuthType(settings.merged.security?.auth?.selectedType);
        const authType = authTypeFromSettings || AuthType.USE_GEMINI;
        // Get model from settings, fallback to default
        const modelFromSettings = settings.merged.model?.name;
        const model = modelFromSettings || "gemini-1.5-flash";
        // Get base URL for OpenAI-compatible providers
        const providerId = settings.merged.security?.auth?.providerId;
        const providers = settings.merged.security?.auth?.providers;
        const baseUrl = providerId && providers?.[providerId]?.['baseUrl'];
        // Set base URL environment variable if configured
        if (baseUrl) {
            process.env["OPENAI_BASE_URL"] = baseUrl;
        }
        // Create config
        const config = new Config({
            sessionId: `headless-${jobId}-${Date.now()}`,
            embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
            targetDir: cwd,
            cwd,
            model: model,
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
        });
        const cliToolConfig = loadCliToolConfig();
        syncCoreToolConfig(cliToolConfig);
        // Initialize config
        await config.initialize();
        // Initialize auth using the configured auth type
        await config.refreshAuth(authType);
        // Inject current timestamp for tasks that need real-time data
        const now = new Date();
        process.env["LOWCAL_CURRENT_TIMESTAMP"] = now.toISOString();
        process.env["LOWCAL_CURRENT_DATE"] = now.toISOString().split('T')[0];
        process.env["LOWCAL_CURRENT_TIME"] = now.toTimeString().split(' ')[0];
        // Prepend system context with current timestamp to the user's prompt
        const systemContext = `\n[System Context - Current timestamp: ${now.toISOString()}]\n`;
        const fullPrompt = systemContext + prompt;
        // Capture stdout
        const originalWrite = process.stdout.write;
        const originalWriteErr = process.stderr.write;
        let stdout = "";
        let stderr = "";
        process.stdout.write = function (chunk) {
            const str = chunk.toString();
            stdout += str;
            return originalWrite.apply(process.stdout, [chunk]);
        };
        process.stderr.write = function (chunk) {
            const str = chunk.toString();
            stderr += str;
            return originalWriteErr.apply(process.stderr, [chunk]);
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
        console.log("[Headless] Job completed successfully");
        console.log(`[Headless] Output written to: ${output}`);
        process.exit(0);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[Headless] Error:", errorMessage);
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
        }
        catch (writeError) {
            console.error("[Headless] Failed to write error log:", writeError);
        }
        process.exit(1);
    }
}
// Run main
main();
//# sourceMappingURL=headless.js.map