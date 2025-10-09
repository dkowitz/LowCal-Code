/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FileFilteringOptions } from "@qwen-code/qwen-code-core";
import { Config, FileDiscoveryService } from "@qwen-code/qwen-code-core";
import type { Settings } from "./settings.js";
import type { Extension } from "./extension.js";
export interface CliArgs {
    model: string | undefined;
    sandbox: boolean | string | undefined;
    sandboxImage: string | undefined;
    debug: boolean | undefined;
    prompt: string | undefined;
    promptInteractive: string | undefined;
    allFiles: boolean | undefined;
    showMemoryUsage: boolean | undefined;
    yolo: boolean | undefined;
    approvalMode: string | undefined;
    telemetry: boolean | undefined;
    checkpointing: boolean | undefined;
    telemetryTarget: string | undefined;
    telemetryOtlpEndpoint: string | undefined;
    telemetryOtlpProtocol: string | undefined;
    telemetryLogPrompts: boolean | undefined;
    telemetryOutfile: string | undefined;
    allowedMcpServerNames: string[] | undefined;
    allowedTools: string[] | undefined;
    experimentalAcp: boolean | undefined;
    extensions: string[] | undefined;
    listExtensions: boolean | undefined;
    openaiLogging: boolean | undefined;
    openaiApiKey: string | undefined;
    openaiBaseUrl: string | undefined;
    proxy: string | undefined;
    includeDirectories: string[] | undefined;
    tavilyApiKey: string | undefined;
    screenReader: boolean | undefined;
    vlmSwitchMode: string | undefined;
}
export declare function parseArguments(settings: Settings): Promise<CliArgs>;
export declare function loadHierarchicalGeminiMemory(currentWorkingDirectory: string, includeDirectoriesToReadGemini: readonly string[] | undefined, debugMode: boolean, fileService: FileDiscoveryService, settings: Settings, extensionContextFilePaths?: string[], memoryImportFormat?: "flat" | "tree", fileFilteringOptions?: FileFilteringOptions): Promise<{
    memoryContent: string;
    fileCount: number;
}>;
export declare function loadCliConfig(settings: Settings, extensions: Extension[], sessionId: string, argv: CliArgs, cwd?: string): Promise<Config>;
