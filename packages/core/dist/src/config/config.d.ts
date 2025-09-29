/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeminiClient } from '../core/client.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { AuthType } from '../core/contentGenerator.js';
import { IdeClient } from '../ide/ide-client.js';
import type { MCPOAuthConfig } from '../mcp/oauth-provider.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { type FileSystemService } from '../services/fileSystemService.js';
import { GitService } from '../services/gitService.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import type { TelemetryTarget } from '../telemetry/index.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { AnyToolInvocation } from '../tools/tools.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from './models.js';
import { Storage } from './storage.js';
import { type ModelSwitchEvent } from '../core/logger.js';
export type { AnyToolInvocation, MCPOAuthConfig };
export declare enum ApprovalMode {
    PLAN = "plan",
    DEFAULT = "default",
    AUTO_EDIT = "auto-edit",
    YOLO = "yolo"
}
export declare const APPROVAL_MODES: ApprovalMode[];
export interface AccessibilitySettings {
    disableLoadingPhrases?: boolean;
    screenReader?: boolean;
}
export interface BugCommandSettings {
    urlTemplate: string;
}
export interface ChatCompressionSettings {
    contextPercentageThreshold?: number;
}
export interface SummarizeToolOutputSettings {
    tokenBudget?: number;
}
export interface TelemetrySettings {
    enabled?: boolean;
    target?: TelemetryTarget;
    otlpEndpoint?: string;
    otlpProtocol?: 'grpc' | 'http';
    logPrompts?: boolean;
    outfile?: string;
}
export interface GitCoAuthorSettings {
    enabled?: boolean;
    name?: string;
    email?: string;
}
export interface GeminiCLIExtension {
    name: string;
    version: string;
    isActive: boolean;
    path: string;
}
export interface FileFilteringOptions {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
}
export declare const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: FileFilteringOptions;
export declare const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions;
export declare class MCPServerConfig {
    readonly command?: string | undefined;
    readonly args?: string[] | undefined;
    readonly env?: Record<string, string> | undefined;
    readonly cwd?: string | undefined;
    readonly url?: string | undefined;
    readonly httpUrl?: string | undefined;
    readonly headers?: Record<string, string> | undefined;
    readonly tcp?: string | undefined;
    readonly timeout?: number | undefined;
    readonly trust?: boolean | undefined;
    readonly description?: string | undefined;
    readonly includeTools?: string[] | undefined;
    readonly excludeTools?: string[] | undefined;
    readonly extensionName?: string | undefined;
    readonly oauth?: MCPOAuthConfig | undefined;
    readonly authProviderType?: AuthProviderType | undefined;
    constructor(command?: string | undefined, args?: string[] | undefined, env?: Record<string, string> | undefined, cwd?: string | undefined, url?: string | undefined, httpUrl?: string | undefined, headers?: Record<string, string> | undefined, tcp?: string | undefined, timeout?: number | undefined, trust?: boolean | undefined, description?: string | undefined, includeTools?: string[] | undefined, excludeTools?: string[] | undefined, extensionName?: string | undefined, oauth?: MCPOAuthConfig | undefined, authProviderType?: AuthProviderType | undefined);
}
export declare enum AuthProviderType {
    DYNAMIC_DISCOVERY = "dynamic_discovery",
    GOOGLE_CREDENTIALS = "google_credentials"
}
export interface SandboxConfig {
    command: 'docker' | 'podman' | 'sandbox-exec';
    image: string;
}
export type FlashFallbackHandler = (currentModel: string, fallbackModel: string, error?: unknown) => Promise<boolean | string | null>;
export interface ConfigParameters {
    sessionId: string;
    embeddingModel?: string;
    sandbox?: SandboxConfig;
    targetDir: string;
    debugMode: boolean;
    question?: string;
    fullContext?: boolean;
    coreTools?: string[];
    allowedTools?: string[];
    excludeTools?: string[];
    toolDiscoveryCommand?: string;
    toolCallCommand?: string;
    mcpServerCommand?: string;
    mcpServers?: Record<string, MCPServerConfig>;
    userMemory?: string;
    geminiMdFileCount?: number;
    approvalMode?: ApprovalMode;
    showMemoryUsage?: boolean;
    contextFileName?: string | string[];
    accessibility?: AccessibilitySettings;
    telemetry?: TelemetrySettings;
    gitCoAuthor?: GitCoAuthorSettings;
    usageStatisticsEnabled?: boolean;
    fileFiltering?: {
        respectGitIgnore?: boolean;
        respectGeminiIgnore?: boolean;
        enableRecursiveFileSearch?: boolean;
        disableFuzzySearch?: boolean;
    };
    checkpointing?: boolean;
    proxy?: string;
    cwd: string;
    fileDiscoveryService?: FileDiscoveryService;
    includeDirectories?: string[];
    bugCommand?: BugCommandSettings;
    model: string;
    extensionContextFilePaths?: string[];
    maxSessionTurns?: number;
    sessionTokenLimit?: number;
    experimentalZedIntegration?: boolean;
    listExtensions?: boolean;
    extensions?: GeminiCLIExtension[];
    blockedMcpServers?: Array<{
        name: string;
        extensionName: string;
    }>;
    noBrowser?: boolean;
    summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;
    folderTrustFeature?: boolean;
    folderTrust?: boolean;
    ideMode?: boolean;
    enableOpenAILogging?: boolean;
    systemPromptMappings?: Array<{
        baseUrls: string[];
        modelNames: string[];
        template: string;
    }>;
    authType?: AuthType;
    contentGenerator?: {
        timeout?: number;
        maxRetries?: number;
        disableCacheControl?: boolean;
        samplingParams?: {
            [key: string]: unknown;
        };
    };
    cliVersion?: string;
    loadMemoryFromIncludeDirectories?: boolean;
    tavilyApiKey?: string;
    chatCompression?: ChatCompressionSettings;
    interactive?: boolean;
    trustedFolder?: boolean;
    useRipgrep?: boolean;
    shouldUseNodePtyShell?: boolean;
    skipNextSpeakerCheck?: boolean;
    extensionManagement?: boolean;
    enablePromptCompletion?: boolean;
    skipLoopDetection?: boolean;
    vlmSwitchMode?: string;
}
export declare class Config {
    private toolRegistry;
    private promptRegistry;
    private subagentManager;
    private sessionId;
    private fileSystemService;
    private contentGeneratorConfig;
    private readonly embeddingModel;
    private readonly sandbox;
    private readonly targetDir;
    private workspaceContext;
    private readonly debugMode;
    private readonly question;
    private readonly fullContext;
    private readonly coreTools;
    private readonly allowedTools;
    private readonly excludeTools;
    private readonly toolDiscoveryCommand;
    private readonly toolCallCommand;
    private readonly mcpServerCommand;
    private readonly mcpServers;
    private userMemory;
    private geminiMdFileCount;
    private approvalMode;
    private readonly showMemoryUsage;
    private readonly accessibility;
    private readonly telemetrySettings;
    private readonly gitCoAuthor;
    private readonly usageStatisticsEnabled;
    private geminiClient;
    private readonly fileFiltering;
    private fileDiscoveryService;
    private gitService;
    private readonly checkpointing;
    private readonly proxy;
    private readonly cwd;
    private readonly bugCommand;
    private model;
    private readonly extensionContextFilePaths;
    private readonly noBrowser;
    private readonly folderTrustFeature;
    private readonly folderTrust;
    private ideMode;
    private ideClient;
    private inFallbackMode;
    private readonly systemPromptMappings?;
    private readonly maxSessionTurns;
    private readonly sessionTokenLimit;
    private readonly listExtensions;
    private readonly _extensions;
    private readonly _blockedMcpServers;
    flashFallbackHandler?: FlashFallbackHandler;
    private quotaErrorOccurred;
    private readonly summarizeToolOutput;
    private authType?;
    private readonly enableOpenAILogging;
    private readonly contentGenerator?;
    private readonly cliVersion?;
    private readonly experimentalZedIntegration;
    private readonly loadMemoryFromIncludeDirectories;
    private readonly tavilyApiKey?;
    private readonly chatCompression;
    private readonly interactive;
    private readonly trustedFolder;
    private readonly useRipgrep;
    private readonly shouldUseNodePtyShell;
    private readonly skipNextSpeakerCheck;
    private readonly extensionManagement;
    private readonly enablePromptCompletion;
    private readonly skipLoopDetection;
    private readonly vlmSwitchMode;
    private initialized;
    readonly storage: Storage;
    private readonly fileExclusions;
    private logger;
    constructor(params: ConfigParameters);
    /**
     * Must only be called once, throws if called again.
     */
    initialize(): Promise<void>;
    refreshAuth(authMethod: AuthType): Promise<void>;
    getSessionId(): string;
    setSessionId(sessionId: string): void;
    shouldLoadMemoryFromIncludeDirectories(): boolean;
    getContentGeneratorConfig(): ContentGeneratorConfig;
    getModel(): string;
    setModel(newModel: string, options?: {
        reason?: ModelSwitchEvent['reason'];
        context?: string;
    }): Promise<void>;
    isInFallbackMode(): boolean;
    setFallbackMode(active: boolean): void;
    setFlashFallbackHandler(handler: FlashFallbackHandler): void;
    getMaxSessionTurns(): number;
    getSessionTokenLimit(): number;
    setQuotaErrorOccurred(value: boolean): void;
    getQuotaErrorOccurred(): boolean;
    getEmbeddingModel(): string;
    getSandbox(): SandboxConfig | undefined;
    isRestrictiveSandbox(): boolean;
    getTargetDir(): string;
    getProjectRoot(): string;
    getWorkspaceContext(): WorkspaceContext;
    getToolRegistry(): ToolRegistry;
    getPromptRegistry(): PromptRegistry;
    getDebugMode(): boolean;
    getQuestion(): string | undefined;
    getFullContext(): boolean;
    getCoreTools(): string[] | undefined;
    getAllowedTools(): string[] | undefined;
    getExcludeTools(): string[] | undefined;
    getToolDiscoveryCommand(): string | undefined;
    getToolCallCommand(): string | undefined;
    getMcpServerCommand(): string | undefined;
    getMcpServers(): Record<string, MCPServerConfig> | undefined;
    getUserMemory(): string;
    setUserMemory(newUserMemory: string): void;
    getGeminiMdFileCount(): number;
    setGeminiMdFileCount(count: number): void;
    getApprovalMode(): ApprovalMode;
    setApprovalMode(mode: ApprovalMode): void;
    getShowMemoryUsage(): boolean;
    getAccessibility(): AccessibilitySettings;
    getTelemetryEnabled(): boolean;
    getTelemetryLogPromptsEnabled(): boolean;
    getTelemetryOtlpEndpoint(): string;
    getTelemetryOtlpProtocol(): 'grpc' | 'http';
    getTelemetryTarget(): TelemetryTarget;
    getTelemetryOutfile(): string | undefined;
    getGitCoAuthor(): GitCoAuthorSettings;
    getGeminiClient(): GeminiClient;
    getEnableRecursiveFileSearch(): boolean;
    getFileFilteringDisableFuzzySearch(): boolean;
    getFileFilteringRespectGitIgnore(): boolean;
    getFileFilteringRespectGeminiIgnore(): boolean;
    getFileFilteringOptions(): FileFilteringOptions;
    /**
     * Gets custom file exclusion patterns from configuration.
     * TODO: This is a placeholder implementation. In the future, this could
     * read from settings files, CLI arguments, or environment variables.
     */
    getCustomExcludes(): string[];
    getCheckpointingEnabled(): boolean;
    getProxy(): string | undefined;
    getWorkingDir(): string;
    getBugCommand(): BugCommandSettings | undefined;
    getFileService(): FileDiscoveryService;
    getUsageStatisticsEnabled(): boolean;
    getExtensionContextFilePaths(): string[];
    getExperimentalZedIntegration(): boolean;
    getListExtensions(): boolean;
    getExtensionManagement(): boolean;
    getExtensions(): GeminiCLIExtension[];
    getBlockedMcpServers(): Array<{
        name: string;
        extensionName: string;
    }>;
    getNoBrowser(): boolean;
    isBrowserLaunchSuppressed(): boolean;
    getSummarizeToolOutputConfig(): Record<string, SummarizeToolOutputSettings> | undefined;
    getTavilyApiKey(): string | undefined;
    getIdeClient(): IdeClient;
    getIdeMode(): boolean;
    getFolderTrustFeature(): boolean;
    getFolderTrust(): boolean;
    isTrustedFolder(): boolean | undefined;
    setIdeMode(value: boolean): void;
    setIdeModeAndSyncConnection(value: boolean): Promise<void>;
    getAuthType(): AuthType | undefined;
    getEnableOpenAILogging(): boolean;
    getContentGeneratorTimeout(): number | undefined;
    getContentGeneratorMaxRetries(): number | undefined;
    getContentGeneratorDisableCacheControl(): boolean | undefined;
    getContentGeneratorSamplingParams(): ContentGeneratorConfig['samplingParams'];
    getCliVersion(): string | undefined;
    getSystemPromptMappings(): Array<{
        baseUrls?: string[];
        modelNames?: string[];
        template?: string;
    }> | undefined;
    /**
     * Get the current FileSystemService
     */
    getFileSystemService(): FileSystemService;
    /**
     * Set a custom FileSystemService
     */
    setFileSystemService(fileSystemService: FileSystemService): void;
    getChatCompression(): ChatCompressionSettings | undefined;
    isInteractive(): boolean;
    getUseRipgrep(): boolean;
    getShouldUseNodePtyShell(): boolean;
    getSkipNextSpeakerCheck(): boolean;
    getScreenReader(): boolean;
    getEnablePromptCompletion(): boolean;
    getSkipLoopDetection(): boolean;
    getVlmSwitchMode(): string | undefined;
    getGitService(): Promise<GitService>;
    getFileExclusions(): FileExclusions;
    getSubagentManager(): SubagentManager;
    createToolRegistry(): Promise<ToolRegistry>;
}
export { DEFAULT_GEMINI_FLASH_MODEL };
