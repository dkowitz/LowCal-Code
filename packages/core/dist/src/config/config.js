/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'node:path';
import process from 'node:process';
import { GeminiClient } from '../core/client.js';
import { AuthType, createContentGeneratorConfig, } from '../core/contentGenerator.js';
import { IdeClient } from '../ide/ide-client.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { StandardFileSystemService, } from '../services/fileSystemService.js';
import { GitService } from '../services/gitService.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import { DEFAULT_OTLP_ENDPOINT, DEFAULT_TELEMETRY_TARGET, initializeTelemetry, StartSessionEvent, } from '../telemetry/index.js';
import { logCliConfiguration, logIdeConnection } from '../telemetry/loggers.js';
import { IdeConnectionEvent, IdeConnectionType } from '../telemetry/types.js';
import { EditTool } from '../tools/edit.js';
import { ExitPlanModeTool } from '../tools/exitPlanMode.js';
import { GlobTool } from '../tools/glob.js';
import { GrepTool } from '../tools/grep.js';
import { LSTool } from '../tools/ls.js';
import { MemoryTool, setGeminiMdFilename } from '../tools/memoryTool.js';
import { ReadFileTool } from '../tools/read-file.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { RipGrepTool } from '../tools/ripGrep.js';
import { ShellTool } from '../tools/shell.js';
import { TaskTool } from '../tools/task.js';
import { TodoWriteTool } from '../tools/todoWrite.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { WebSearchTool } from '../tools/web-search.js';
import { WriteFileTool } from '../tools/write-file.js';
import { shouldAttemptBrowserLaunch } from '../utils/browser.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { DEFAULT_GEMINI_EMBEDDING_MODEL, DEFAULT_GEMINI_FLASH_MODEL, } from './models.js';
import { Storage } from './storage.js';
import { Logger } from '../core/logger.js';
export var ApprovalMode;
(function (ApprovalMode) {
    ApprovalMode["PLAN"] = "plan";
    ApprovalMode["DEFAULT"] = "default";
    ApprovalMode["AUTO_EDIT"] = "auto-edit";
    ApprovalMode["YOLO"] = "yolo";
})(ApprovalMode || (ApprovalMode = {}));
export const APPROVAL_MODES = Object.values(ApprovalMode);
// For memory files
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS = {
    respectGitIgnore: false,
    respectGeminiIgnore: true,
};
// For all other files
export const DEFAULT_FILE_FILTERING_OPTIONS = {
    respectGitIgnore: true,
    respectGeminiIgnore: true,
};
export class MCPServerConfig {
    command;
    args;
    env;
    cwd;
    url;
    httpUrl;
    headers;
    tcp;
    timeout;
    trust;
    description;
    includeTools;
    excludeTools;
    extensionName;
    oauth;
    authProviderType;
    constructor(
    // For stdio transport
    command, args, env, cwd, 
    // For sse transport
    url, 
    // For streamable http transport
    httpUrl, headers, 
    // For websocket transport
    tcp, 
    // Common
    timeout, trust, 
    // Metadata
    description, includeTools, excludeTools, extensionName, 
    // OAuth configuration
    oauth, authProviderType) {
        this.command = command;
        this.args = args;
        this.env = env;
        this.cwd = cwd;
        this.url = url;
        this.httpUrl = httpUrl;
        this.headers = headers;
        this.tcp = tcp;
        this.timeout = timeout;
        this.trust = trust;
        this.description = description;
        this.includeTools = includeTools;
        this.excludeTools = excludeTools;
        this.extensionName = extensionName;
        this.oauth = oauth;
        this.authProviderType = authProviderType;
    }
}
export var AuthProviderType;
(function (AuthProviderType) {
    AuthProviderType["DYNAMIC_DISCOVERY"] = "dynamic_discovery";
    AuthProviderType["GOOGLE_CREDENTIALS"] = "google_credentials";
})(AuthProviderType || (AuthProviderType = {}));
export class Config {
    toolRegistry;
    promptRegistry;
    subagentManager;
    sessionId;
    fileSystemService;
    contentGeneratorConfig;
    embeddingModel;
    sandbox;
    targetDir;
    workspaceContext;
    debugMode;
    question;
    fullContext;
    coreTools;
    allowedTools;
    excludeTools;
    toolDiscoveryCommand;
    toolCallCommand;
    mcpServerCommand;
    mcpServers;
    userMemory;
    geminiMdFileCount;
    approvalMode;
    showMemoryUsage;
    accessibility;
    telemetrySettings;
    gitCoAuthor;
    usageStatisticsEnabled;
    geminiClient;
    fileFiltering;
    fileDiscoveryService = null;
    gitService = undefined;
    checkpointing;
    proxy;
    cwd;
    bugCommand;
    model;
    extensionContextFilePaths;
    noBrowser;
    folderTrustFeature;
    folderTrust;
    ideMode;
    ideClient;
    inFallbackMode = false;
    systemPromptMappings;
    maxSessionTurns;
    sessionTokenLimit;
    listExtensions;
    _extensions;
    _blockedMcpServers;
    flashFallbackHandler;
    quotaErrorOccurred = false;
    summarizeToolOutput;
    authType;
    enableOpenAILogging;
    contentGenerator;
    cliVersion;
    experimentalZedIntegration = false;
    loadMemoryFromIncludeDirectories = false;
    tavilyApiKey;
    chatCompression;
    interactive;
    trustedFolder;
    useRipgrep;
    shouldUseNodePtyShell;
    skipNextSpeakerCheck;
    extensionManagement;
    enablePromptCompletion = false;
    skipLoopDetection;
    vlmSwitchMode;
    initialized = false;
    storage;
    fileExclusions;
    logger = null;
    constructor(params) {
        this.sessionId = params.sessionId;
        this.embeddingModel =
            params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
        this.fileSystemService = new StandardFileSystemService();
        this.sandbox = params.sandbox;
        this.targetDir = path.resolve(params.targetDir);
        this.workspaceContext = new WorkspaceContext(this.targetDir, params.includeDirectories ?? []);
        this.debugMode = params.debugMode;
        this.question = params.question;
        this.fullContext = params.fullContext ?? false;
        this.coreTools = params.coreTools;
        this.allowedTools = params.allowedTools;
        this.excludeTools = params.excludeTools;
        this.toolDiscoveryCommand = params.toolDiscoveryCommand;
        this.toolCallCommand = params.toolCallCommand;
        this.mcpServerCommand = params.mcpServerCommand;
        this.mcpServers = params.mcpServers;
        this.userMemory = params.userMemory ?? '';
        this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
        this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
        this.showMemoryUsage = params.showMemoryUsage ?? false;
        this.accessibility = params.accessibility ?? {};
        this.telemetrySettings = {
            enabled: params.telemetry?.enabled ?? false,
            target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
            otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
            otlpProtocol: params.telemetry?.otlpProtocol,
            logPrompts: params.telemetry?.logPrompts ?? true,
            outfile: params.telemetry?.outfile,
        };
        this.gitCoAuthor = {
            enabled: params.gitCoAuthor?.enabled ?? true,
            name: params.gitCoAuthor?.name ?? 'Qwen-Coder',
            email: params.gitCoAuthor?.email ?? 'qwen-coder@alibabacloud.com',
        };
        this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;
        this.fileFiltering = {
            respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
            respectGeminiIgnore: params.fileFiltering?.respectGeminiIgnore ?? true,
            enableRecursiveFileSearch: params.fileFiltering?.enableRecursiveFileSearch ?? true,
            disableFuzzySearch: params.fileFiltering?.disableFuzzySearch ?? false,
        };
        this.checkpointing = params.checkpointing ?? false;
        this.proxy = params.proxy;
        this.cwd = params.cwd ?? process.cwd();
        this.fileDiscoveryService = params.fileDiscoveryService ?? null;
        this.bugCommand = params.bugCommand;
        this.model = params.model;
        this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];
        this.maxSessionTurns = params.maxSessionTurns ?? -1;
        this.sessionTokenLimit = params.sessionTokenLimit ?? -1;
        this.experimentalZedIntegration =
            params.experimentalZedIntegration ?? false;
        this.listExtensions = params.listExtensions ?? false;
        this._extensions = params.extensions ?? [];
        this._blockedMcpServers = params.blockedMcpServers ?? [];
        this.noBrowser = params.noBrowser ?? false;
        this.summarizeToolOutput = params.summarizeToolOutput;
        this.folderTrustFeature = params.folderTrustFeature ?? false;
        this.folderTrust = params.folderTrust ?? false;
        this.ideMode = params.ideMode ?? false;
        this.systemPromptMappings = params.systemPromptMappings;
        this.authType = params.authType;
        this.enableOpenAILogging = params.enableOpenAILogging ?? false;
        this.contentGenerator = params.contentGenerator;
        this.cliVersion = params.cliVersion;
        this.loadMemoryFromIncludeDirectories =
            params.loadMemoryFromIncludeDirectories ?? false;
        this.chatCompression = params.chatCompression;
        this.interactive = params.interactive ?? false;
        this.trustedFolder = params.trustedFolder;
        this.shouldUseNodePtyShell = params.shouldUseNodePtyShell ?? false;
        this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? false;
        this.skipLoopDetection = params.skipLoopDetection ?? false;
        // Web search
        this.tavilyApiKey = params.tavilyApiKey;
        this.useRipgrep = params.useRipgrep ?? false;
        this.shouldUseNodePtyShell = params.shouldUseNodePtyShell ?? false;
        this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? false;
        this.extensionManagement = params.extensionManagement ?? false;
        this.storage = new Storage(this.targetDir);
        this.enablePromptCompletion = params.enablePromptCompletion ?? false;
        this.vlmSwitchMode = params.vlmSwitchMode;
        this.fileExclusions = new FileExclusions(this);
        // Initialize logger asynchronously
        this.logger = new Logger(this.sessionId, this.storage);
        this.logger.initialize().catch((error) => {
            console.debug('Failed to initialize logger:', error);
        });
        if (params.contextFileName) {
            setGeminiMdFilename(params.contextFileName);
        }
        if (this.telemetrySettings.enabled) {
            initializeTelemetry(this);
        }
        logCliConfiguration(this, new StartSessionEvent(this));
    }
    /**
     * Must only be called once, throws if called again.
     */
    async initialize() {
        if (this.initialized) {
            throw Error('Config was already initialized');
        }
        this.initialized = true;
        this.ideClient = await IdeClient.getInstance();
        // Initialize centralized FileDiscoveryService
        this.getFileService();
        if (this.getCheckpointingEnabled()) {
            await this.getGitService();
        }
        this.promptRegistry = new PromptRegistry();
        this.subagentManager = new SubagentManager(this);
        this.toolRegistry = await this.createToolRegistry();
        logCliConfiguration(this, new StartSessionEvent(this, this.toolRegistry));
    }
    async refreshAuth(authMethod) {
        // Save the current conversation history before creating a new client
        let existingHistory = [];
        if (this.geminiClient && this.geminiClient.isInitialized()) {
            existingHistory = this.geminiClient.getHistory();
        }
        // Create new content generator config
        const newContentGeneratorConfig = createContentGeneratorConfig(this, authMethod);
        // Create and initialize new client in local variable first
        const newGeminiClient = new GeminiClient(this);
        await newGeminiClient.initialize(newContentGeneratorConfig);
        // Vertex and Genai have incompatible encryption and sending history with
        // throughtSignature from Genai to Vertex will fail, we need to strip them
        const fromGenaiToVertex = this.contentGeneratorConfig?.authType === AuthType.USE_GEMINI &&
            authMethod === AuthType.LOGIN_WITH_GOOGLE;
        // Only assign to instance properties after successful initialization
        this.contentGeneratorConfig = newContentGeneratorConfig;
        this.geminiClient = newGeminiClient;
        // Restore the conversation history to the new client
        if (existingHistory.length > 0) {
            this.geminiClient.setHistory(existingHistory, {
                stripThoughts: fromGenaiToVertex,
            });
        }
        // Reset the session flag since we're explicitly changing auth and using default model
        this.inFallbackMode = false;
        this.authType = authMethod;
    }
    getSessionId() {
        return this.sessionId;
    }
    setSessionId(sessionId) {
        this.sessionId = sessionId;
    }
    shouldLoadMemoryFromIncludeDirectories() {
        return this.loadMemoryFromIncludeDirectories;
    }
    getContentGeneratorConfig() {
        return this.contentGeneratorConfig;
    }
    getModel() {
        return this.contentGeneratorConfig?.model || this.model;
    }
    async setModel(newModel, options) {
        const oldModel = this.getModel();
        this.model = newModel;
        if (this.contentGeneratorConfig) {
            this.contentGeneratorConfig.model = newModel;
        }
        // Log the model switch if the model actually changed
        if (oldModel !== newModel && this.logger) {
            const switchEvent = {
                fromModel: oldModel,
                toModel: newModel,
                reason: options?.reason || 'manual',
                context: options?.context,
            };
            // Log asynchronously to avoid blocking
            this.logger.logModelSwitch(switchEvent).catch((error) => {
                console.debug('Failed to log model switch:', error);
            });
        }
        // Reinitialize chat with updated configuration while preserving history
        const geminiClient = this.getGeminiClient();
        if (geminiClient && geminiClient.isInitialized()) {
            // Now await the reinitialize operation to ensure completion
            try {
                await geminiClient.reinitialize();
            }
            catch (error) {
                console.error('Failed to reinitialize chat with updated config:', error);
                throw error; // Re-throw to let callers handle the error
            }
        }
    }
    isInFallbackMode() {
        return this.inFallbackMode;
    }
    setFallbackMode(active) {
        this.inFallbackMode = active;
    }
    setFlashFallbackHandler(handler) {
        this.flashFallbackHandler = handler;
    }
    getMaxSessionTurns() {
        return this.maxSessionTurns;
    }
    getSessionTokenLimit() {
        return this.sessionTokenLimit;
    }
    setQuotaErrorOccurred(value) {
        this.quotaErrorOccurred = value;
    }
    getQuotaErrorOccurred() {
        return this.quotaErrorOccurred;
    }
    getEmbeddingModel() {
        return this.embeddingModel;
    }
    getSandbox() {
        return this.sandbox;
    }
    isRestrictiveSandbox() {
        const sandboxConfig = this.getSandbox();
        const seatbeltProfile = process.env['SEATBELT_PROFILE'];
        return (!!sandboxConfig &&
            sandboxConfig.command === 'sandbox-exec' &&
            !!seatbeltProfile &&
            seatbeltProfile.startsWith('restrictive-'));
    }
    getTargetDir() {
        return this.targetDir;
    }
    getProjectRoot() {
        return this.targetDir;
    }
    getWorkspaceContext() {
        return this.workspaceContext;
    }
    getToolRegistry() {
        return this.toolRegistry;
    }
    getPromptRegistry() {
        return this.promptRegistry;
    }
    getDebugMode() {
        return this.debugMode;
    }
    getQuestion() {
        return this.question;
    }
    getFullContext() {
        return this.fullContext;
    }
    getCoreTools() {
        return this.coreTools;
    }
    getAllowedTools() {
        return this.allowedTools;
    }
    getExcludeTools() {
        return this.excludeTools;
    }
    getToolDiscoveryCommand() {
        return this.toolDiscoveryCommand;
    }
    getToolCallCommand() {
        return this.toolCallCommand;
    }
    getMcpServerCommand() {
        return this.mcpServerCommand;
    }
    getMcpServers() {
        return this.mcpServers;
    }
    getUserMemory() {
        return this.userMemory;
    }
    setUserMemory(newUserMemory) {
        this.userMemory = newUserMemory;
    }
    getGeminiMdFileCount() {
        return this.geminiMdFileCount;
    }
    setGeminiMdFileCount(count) {
        this.geminiMdFileCount = count;
    }
    getApprovalMode() {
        return this.approvalMode;
    }
    setApprovalMode(mode) {
        if (this.isTrustedFolder() === false &&
            mode !== ApprovalMode.DEFAULT &&
            mode !== ApprovalMode.PLAN) {
            throw new Error('Cannot enable privileged approval modes in an untrusted folder.');
        }
        this.approvalMode = mode;
    }
    getShowMemoryUsage() {
        return this.showMemoryUsage;
    }
    getAccessibility() {
        return this.accessibility;
    }
    getTelemetryEnabled() {
        return this.telemetrySettings.enabled ?? false;
    }
    getTelemetryLogPromptsEnabled() {
        return this.telemetrySettings.logPrompts ?? true;
    }
    getTelemetryOtlpEndpoint() {
        return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
    }
    getTelemetryOtlpProtocol() {
        return this.telemetrySettings.otlpProtocol ?? 'grpc';
    }
    getTelemetryTarget() {
        return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
    }
    getTelemetryOutfile() {
        return this.telemetrySettings.outfile;
    }
    getGitCoAuthor() {
        return this.gitCoAuthor;
    }
    getGeminiClient() {
        return this.geminiClient;
    }
    getEnableRecursiveFileSearch() {
        return this.fileFiltering.enableRecursiveFileSearch;
    }
    getFileFilteringDisableFuzzySearch() {
        return this.fileFiltering.disableFuzzySearch;
    }
    getFileFilteringRespectGitIgnore() {
        return this.fileFiltering.respectGitIgnore;
    }
    getFileFilteringRespectGeminiIgnore() {
        return this.fileFiltering.respectGeminiIgnore;
    }
    getFileFilteringOptions() {
        return {
            respectGitIgnore: this.fileFiltering.respectGitIgnore,
            respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
        };
    }
    /**
     * Gets custom file exclusion patterns from configuration.
     * TODO: This is a placeholder implementation. In the future, this could
     * read from settings files, CLI arguments, or environment variables.
     */
    getCustomExcludes() {
        // Placeholder implementation - returns empty array for now
        // Future implementation could read from:
        // - User settings file
        // - Project-specific configuration
        // - Environment variables
        // - CLI arguments
        return [];
    }
    getCheckpointingEnabled() {
        return this.checkpointing;
    }
    getProxy() {
        return this.proxy;
    }
    getWorkingDir() {
        return this.cwd;
    }
    getBugCommand() {
        return this.bugCommand;
    }
    getFileService() {
        if (!this.fileDiscoveryService) {
            this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
        }
        return this.fileDiscoveryService;
    }
    getUsageStatisticsEnabled() {
        return this.usageStatisticsEnabled;
    }
    getExtensionContextFilePaths() {
        return this.extensionContextFilePaths;
    }
    getExperimentalZedIntegration() {
        return this.experimentalZedIntegration;
    }
    getListExtensions() {
        return this.listExtensions;
    }
    getExtensionManagement() {
        return this.extensionManagement;
    }
    getExtensions() {
        return this._extensions;
    }
    getBlockedMcpServers() {
        return this._blockedMcpServers;
    }
    getNoBrowser() {
        return this.noBrowser;
    }
    isBrowserLaunchSuppressed() {
        return this.getNoBrowser() || !shouldAttemptBrowserLaunch();
    }
    getSummarizeToolOutputConfig() {
        return this.summarizeToolOutput;
    }
    // Web search provider configuration
    getTavilyApiKey() {
        return this.tavilyApiKey;
    }
    getIdeClient() {
        return this.ideClient;
    }
    getIdeMode() {
        return this.ideMode;
    }
    getFolderTrustFeature() {
        return this.folderTrustFeature;
    }
    getFolderTrust() {
        return this.folderTrust;
    }
    isTrustedFolder() {
        return this.trustedFolder;
    }
    setIdeMode(value) {
        this.ideMode = value;
    }
    async setIdeModeAndSyncConnection(value) {
        this.ideMode = value;
        if (value) {
            await this.ideClient.connect();
            logIdeConnection(this, new IdeConnectionEvent(IdeConnectionType.SESSION));
        }
        else {
            await this.ideClient.disconnect();
        }
    }
    getAuthType() {
        return this.authType;
    }
    getEnableOpenAILogging() {
        return this.enableOpenAILogging;
    }
    getContentGeneratorTimeout() {
        return this.contentGenerator?.timeout;
    }
    getContentGeneratorMaxRetries() {
        return this.contentGenerator?.maxRetries;
    }
    getContentGeneratorDisableCacheControl() {
        return this.contentGenerator?.disableCacheControl;
    }
    getContentGeneratorSamplingParams() {
        return this.contentGenerator?.samplingParams;
    }
    getCliVersion() {
        return this.cliVersion;
    }
    getSystemPromptMappings() {
        return this.systemPromptMappings;
    }
    /**
     * Get the current FileSystemService
     */
    getFileSystemService() {
        return this.fileSystemService;
    }
    /**
     * Set a custom FileSystemService
     */
    setFileSystemService(fileSystemService) {
        this.fileSystemService = fileSystemService;
    }
    getChatCompression() {
        return this.chatCompression;
    }
    isInteractive() {
        return this.interactive;
    }
    getUseRipgrep() {
        return this.useRipgrep;
    }
    getShouldUseNodePtyShell() {
        return this.shouldUseNodePtyShell;
    }
    getSkipNextSpeakerCheck() {
        return this.skipNextSpeakerCheck;
    }
    getScreenReader() {
        return this.accessibility.screenReader ?? false;
    }
    getEnablePromptCompletion() {
        return this.enablePromptCompletion;
    }
    getSkipLoopDetection() {
        return this.skipLoopDetection;
    }
    getVlmSwitchMode() {
        return this.vlmSwitchMode;
    }
    async getGitService() {
        if (!this.gitService) {
            this.gitService = new GitService(this.targetDir, this.storage);
            await this.gitService.initialize();
        }
        return this.gitService;
    }
    getFileExclusions() {
        return this.fileExclusions;
    }
    getSubagentManager() {
        return this.subagentManager;
    }
    async createToolRegistry() {
        const registry = new ToolRegistry(this);
        // helper to create & register core tools that are enabled
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const registerCoreTool = (ToolClass, ...args) => {
            const className = ToolClass.name;
            const toolName = ToolClass.Name || className;
            const coreTools = this.getCoreTools();
            const excludeTools = this.getExcludeTools() || [];
            let isEnabled = true; // Enabled by default if coreTools is not set.
            if (coreTools) {
                isEnabled = coreTools.some((tool) => tool === className ||
                    tool === toolName ||
                    tool.startsWith(`${className}(`) ||
                    tool.startsWith(`${toolName}(`));
            }
            const isExcluded = excludeTools.some((tool) => tool === className || tool === toolName);
            if (isExcluded) {
                isEnabled = false;
            }
            if (isEnabled) {
                registry.registerTool(new ToolClass(...args));
            }
        };
        registerCoreTool(TaskTool, this);
        registerCoreTool(LSTool, this);
        registerCoreTool(ReadFileTool, this);
        if (this.getUseRipgrep()) {
            registerCoreTool(RipGrepTool, this);
        }
        else {
            registerCoreTool(GrepTool, this);
        }
        registerCoreTool(GlobTool, this);
        registerCoreTool(EditTool, this);
        registerCoreTool(WriteFileTool, this);
        registerCoreTool(ReadManyFilesTool, this);
        registerCoreTool(ShellTool, this);
        registerCoreTool(MemoryTool);
        registerCoreTool(TodoWriteTool, this);
        registerCoreTool(ExitPlanModeTool, this);
        registerCoreTool(WebFetchTool, this);
        // Conditionally register web search tool only if Tavily API key is set
        if (this.getTavilyApiKey()) {
            registerCoreTool(WebSearchTool, this);
        }
        await registry.discoverAllTools();
        return registry;
    }
}
// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
//# sourceMappingURL=config.js.map