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

// Parse command line arguments
function parseArgs(): { prompt: string; jobId: string; output: string } {
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
async function main(): Promise<void> {
  const { prompt, jobId, output } = parseArgs();
  
  console.log(`[Headless] Starting job ${jobId}`);
  console.log(`[Headless] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);
  
  try {
    // Import required modules
    const { Config, ApprovalMode, DEFAULT_GEMINI_EMBEDDING_MODEL } = await import("@qwen-code/qwen-code-core");
    const { loadSettings } = await import("../config/settings.js");
    const { loadHierarchicalGeminiMemory } = await import("../config/config.js");
    const { FileDiscoveryService } = await import("@qwen-code/qwen-code-core");
    const { runNonInteractive } = await import("../nonInteractiveCli.js");
    
    const cwd = process.cwd();
    
    // Load settings
    const settings = loadSettings(cwd);
    
    if (settings.errors.length > 0) {
      throw new Error(`Settings errors: ${settings.errors.map(e => e.message).join(", ")}`);
    }
    
    // Create file service
    const fileService = new FileDiscoveryService(cwd);
    
    // Load memory
    const memoryImportFormat = settings.merged.context?.importFormat || "tree";
    const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
      cwd,
      [],
      false, // debugMode
      fileService,
      settings.merged,
      [],
      memoryImportFormat,
    );
    
    // Determine approval mode - use YOLO for scheduled tasks to avoid interactive prompts
    const approvalMode = ApprovalMode.YOLO;
    
    // Create config
    const config = new Config({
      sessionId: `headless-${jobId}-${Date.now()}`,
      embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
      targetDir: cwd,
      cwd,
      model: DEFAULT_GEMINI_EMBEDDING_MODEL,
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
    
    // Initialize config
    await config.initialize();
    
    // Capture stdout
    const originalWrite = process.stdout.write;
    const originalWriteErr = process.stderr.write;
    let stdout = "";
    let stderr = "";
    
    process.stdout.write = function(chunk: string | Buffer): boolean {
      const str = chunk.toString();
      stdout += str;
      return originalWrite.apply(process.stdout, [chunk] as any);
    };
    
    process.stderr.write = function(chunk: string | Buffer): boolean {
      const str = chunk.toString();
      stderr += str;
      return originalWriteErr.apply(process.stderr, [chunk] as any);
    };
    
    // Run the non-interactive mode
    const prompt_id = `headless-${jobId}-${Date.now()}`;
    await runNonInteractive(config, prompt, prompt_id);
    
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
  } catch (error) {
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
    } catch (writeError) {
      console.error("[Headless] Failed to write error log:", writeError);
    }
    
    process.exit(1);
  }
}

// Run main
main();
