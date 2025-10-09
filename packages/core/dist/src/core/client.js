/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createUserContent, FinishReason, } from "@google/genai";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { ApprovalMode } from "../config/config.js";
import { DEFAULT_GEMINI_FLASH_MODEL } from "../config/models.js";
import { ideContext } from "../ide/ideContext.js";
import { LoopDetectionService } from "../services/loopDetectionService.js";
import { logChatCompression, logContentRetry, logContentRetryFailure, logNextSpeakerCheck, } from "../telemetry/loggers.js";
import { makeChatCompressionEvent, NextSpeakerCheckEvent, ContentRetryEvent, ContentRetryFailureEvent, } from "../telemetry/types.js";
import { TaskTool } from "../tools/task.js";
import { getDirectoryContextString, getEnvironmentContext, } from "../utils/environmentContext.js";
import { reportError } from "../utils/errorReporting.js";
import { getErrorMessage } from "../utils/errors.js";
import { getFunctionCalls } from "../utils/generateContentResponseUtilities.js";
import { isFunctionResponse } from "../utils/messageInspectors.js";
import { checkNextSpeaker } from "../utils/nextSpeakerChecker.js";
import { retryWithBackoff } from "../utils/retry.js";
import { flatMapTextParts } from "../utils/partUtils.js";
import { applyAdaptiveCompression, COMPRESSION_STRATEGIES, estimateCompressionRatio, } from "../utils/context-recovery.js";
import { AuthType, createContentGenerator } from "./contentGenerator.js";
import { GeminiChat } from "./geminiChat.js";
import { OpenAIContentGenerator } from "./openaiContentGenerator/openaiContentGenerator.js";
import { LMStudioOpenAICompatibleProvider } from "./openaiContentGenerator/provider/lmstudio.js";
import { getCompressionPrompt, getCoreSystemPrompt, getCustomSystemPrompt, getPlanModeSystemReminder, getSubagentSystemReminder, } from "./prompts.js";
import { CompressionStatus, GeminiEventType, Turn } from "./turn.js";
import { TokenBudgetExceededError, TokenBudgetManager, } from "./tokenBudgetManager.js";
import { getProviderTelemetryTag } from "../utils/providerTelemetry.js";
function isThinkingSupported(model) {
    if (model.startsWith("gemini-2.5"))
        return true;
    return false;
}
/**
 * Returns the index of the content after the fraction of the total characters in the history.
 *
 * Exported for testing purposes.
 */
export function findIndexAfterFraction(history, fraction) {
    if (fraction <= 0 || fraction >= 1) {
        throw new Error("Fraction must be between 0 and 1");
    }
    const contentLengths = history.map((content) => JSON.stringify(content).length);
    const totalCharacters = contentLengths.reduce((sum, length) => sum + length, 0);
    const targetCharacters = totalCharacters * fraction;
    let charactersSoFar = 0;
    for (let i = 0; i < contentLengths.length; i++) {
        charactersSoFar += contentLengths[i];
        if (charactersSoFar >= targetCharacters) {
            return i;
        }
    }
    return contentLengths.length;
}
const MAX_TURNS = 100;
/**
 * Threshold for compression token count as a fraction of the model's token limit.
 * If the chat history exceeds this threshold, it will be compressed.
 */
const COMPRESSION_TOKEN_THRESHOLD = 0.7;
/**
 * The fraction of the latest chat history to keep. A value of 0.3
 * means that only the last 30% of the chat history will be kept after compression.
 */
const COMPRESSION_PRESERVE_THRESHOLD = 0.3;
function isRecoverableStreamErrorMessage(message) {
    if (!message) {
        return false;
    }
    return (message.includes("Model stream ended with an invalid chunk or missing finish reason.") ||
        message.includes("Model stream completed without any chunks.") ||
        message.includes("Stream idle for"));
}
export class GeminiClient {
    config;
    chat;
    contentGenerator;
    embeddingModel;
    generateContentConfig = {
        temperature: 0,
        topP: 1,
    };
    sessionTurnCount = 0;
    loopDetector;
    lastPromptId;
    lastSentIdeContext;
    forceFullIdeContext = true;
    tokenBudgetManager;
    /**
     * At any point in this conversation, was compression triggered without
     * being forced and did it fail?
     */
    hasFailedCompressionAttempt = false;
    constructor(config) {
        this.config = config;
        if (config.getProxy()) {
            setGlobalDispatcher(new ProxyAgent(config.getProxy()));
        }
        this.embeddingModel = config.getEmbeddingModel();
        this.loopDetector = new LoopDetectionService(config);
        this.lastPromptId = this.config.getSessionId();
    }
    async initialize(contentGeneratorConfig, extraHistory) {
        this.contentGenerator = await createContentGenerator(contentGeneratorConfig, this.config, this.config.getSessionId());
        this.tokenBudgetManager = new TokenBudgetManager(this.getContentGenerator(), (model) => typeof this.config.getEffectiveContextLimit === "function"
            ? this.config.getEffectiveContextLimit(model)
            : undefined);
        /**
         * Always take the model from contentGeneratorConfig to initialize,
         * despite the `this.config.contentGeneratorConfig` is not updated yet because in
         * `Config` it will not be updated until the initialization is successful.
         */
        this.chat = await this.startChat(extraHistory || [], contentGeneratorConfig.model);
    }
    getContentGenerator() {
        if (!this.contentGenerator) {
            throw new Error("Content generator not initialized");
        }
        return this.contentGenerator;
    }
    getTokenBudgetManager() {
        if (!this.tokenBudgetManager) {
            throw new Error("Token budget manager not initialized");
        }
        return this.tokenBudgetManager;
    }
    getUserTier() {
        return this.contentGenerator?.userTier;
    }
    async addHistory(content) {
        this.getChat().addHistory(content);
    }
    getChat() {
        if (!this.chat) {
            throw new Error("Chat not initialized");
        }
        return this.chat;
    }
    isInitialized() {
        return this.chat !== undefined && this.contentGenerator !== undefined;
    }
    getHistory() {
        return this.getChat().getHistory();
    }
    setHistory(history, { stripThoughts = false } = {}) {
        const historyToSet = stripThoughts
            ? history.map((content) => {
                const newContent = { ...content };
                if (newContent.parts) {
                    newContent.parts = newContent.parts.map((part) => {
                        if (part &&
                            typeof part === "object" &&
                            "thoughtSignature" in part) {
                            const newPart = { ...part };
                            delete newPart
                                .thoughtSignature;
                            return newPart;
                        }
                        return part;
                    });
                }
                return newContent;
            })
            : history;
        this.getChat().setHistory(historyToSet);
        this.forceFullIdeContext = true;
    }
    async setTools() {
        const toolRegistry = this.config.getToolRegistry();
        const toolDeclarations = toolRegistry.getFunctionDeclarations();
        const tools = [{ functionDeclarations: toolDeclarations }];
        this.getChat().setTools(tools);
    }
    async resetChat() {
        this.chat = await this.startChat();
    }
    /**
     * Reinitializes the chat with the current contentGeneratorConfig while preserving chat history.
     * This creates a new chat object using the existing history and updated configuration.
     * Should be called when configuration changes (model, auth, etc.) to ensure consistency.
     */
    async reinitialize() {
        if (!this.chat) {
            return;
        }
        // If we're using LM Studio, try to explicitly unload the current model
        if (this.contentGenerator instanceof OpenAIContentGenerator) {
            const provider = this.contentGenerator.getProvider();
            if (provider instanceof LMStudioOpenAICompatibleProvider) {
                try {
                    // Attempt to unload the current model in LM Studio
                    await provider.unloadModel();
                }
                catch (error) {
                    console.debug("Failed to unload LM Studio model:", error);
                }
            }
        }
        // Preserve the current chat history (excluding environment context)
        const currentHistory = this.getHistory();
        // Remove the initial environment context (first 2 messages: user env + model acknowledgment)
        const userHistory = currentHistory.slice(2);
        // Get current content generator config and reinitialize with preserved history
        const contentGeneratorConfig = this.config.getContentGeneratorConfig();
        if (contentGeneratorConfig) {
            await this.initialize(contentGeneratorConfig, userHistory);
        }
    }
    async addDirectoryContext() {
        if (!this.chat) {
            return;
        }
        this.getChat().addHistory({
            role: "user",
            parts: [{ text: await getDirectoryContextString(this.config) }],
        });
    }
    async startChat(extraHistory, model) {
        this.forceFullIdeContext = true;
        this.hasFailedCompressionAttempt = false;
        const envParts = await getEnvironmentContext(this.config);
        const toolRegistry = this.config.getToolRegistry();
        const toolDeclarations = toolRegistry.getFunctionDeclarations();
        const tools = [{ functionDeclarations: toolDeclarations }];
        const history = [
            {
                role: "user",
                parts: envParts,
            },
            {
                role: "model",
                parts: [{ text: "Got it. Thanks for the context!" }],
            },
            ...(extraHistory ?? []),
        ];
        let streamIdleTimeoutOverride;
        const activeContentGenerator = this.getContentGenerator();
        if (activeContentGenerator instanceof OpenAIContentGenerator) {
            const provider = activeContentGenerator.getProvider();
            if (provider instanceof LMStudioOpenAICompatibleProvider) {
                streamIdleTimeoutOverride = 0;
            }
        }
        try {
            const userMemory = this.config.getUserMemory();
            const systemInstruction = getCoreSystemPrompt(userMemory, {}, model || this.config.getModel());
            const generateContentConfigWithThinking = isThinkingSupported(model || this.config.getModel())
                ? {
                    ...this.generateContentConfig,
                    thinkingConfig: {
                        thinkingBudget: -1,
                        includeThoughts: true,
                    },
                }
                : this.generateContentConfig;
            return new GeminiChat(this.config, this.getContentGenerator(), {
                systemInstruction,
                ...generateContentConfigWithThinking,
                tools,
            }, history, { streamIdleTimeoutOverride });
        }
        catch (error) {
            await reportError(error, "Error initializing Gemini chat session.", history, "startChat");
            throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
        }
    }
    getIdeContextParts(forceFullContext) {
        const currentIdeContext = ideContext.getIdeContext();
        if (!currentIdeContext) {
            return { contextParts: [], newIdeContext: undefined };
        }
        if (forceFullContext || !this.lastSentIdeContext) {
            // Send full context as JSON
            const openFiles = currentIdeContext.workspaceState?.openFiles || [];
            const activeFile = openFiles.find((f) => f.isActive);
            const otherOpenFiles = openFiles
                .filter((f) => !f.isActive)
                .map((f) => f.path);
            const contextData = {};
            if (activeFile) {
                contextData["activeFile"] = {
                    path: activeFile.path,
                    cursor: activeFile.cursor
                        ? {
                            line: activeFile.cursor.line,
                            character: activeFile.cursor.character,
                        }
                        : undefined,
                    selectedText: activeFile.selectedText || undefined,
                };
            }
            if (otherOpenFiles.length > 0) {
                contextData["otherOpenFiles"] = otherOpenFiles;
            }
            if (Object.keys(contextData).length === 0) {
                return { contextParts: [], newIdeContext: currentIdeContext };
            }
            const jsonString = JSON.stringify(contextData, null, 2);
            const contextParts = [
                "Here is the user's editor context as a JSON object. This is for your information only.",
                "```json",
                jsonString,
                "```",
            ];
            if (this.config.getDebugMode()) {
                console.log(contextParts.join("\n"));
            }
            return {
                contextParts,
                newIdeContext: currentIdeContext,
            };
        }
        else {
            // Calculate and send delta as JSON
            const delta = {};
            const changes = {};
            const lastFiles = new Map((this.lastSentIdeContext.workspaceState?.openFiles || []).map((f) => [f.path, f]));
            const currentFiles = new Map((currentIdeContext.workspaceState?.openFiles || []).map((f) => [
                f.path,
                f,
            ]));
            const openedFiles = [];
            for (const [path] of currentFiles.entries()) {
                if (!lastFiles.has(path)) {
                    openedFiles.push(path);
                }
            }
            if (openedFiles.length > 0) {
                changes["filesOpened"] = openedFiles;
            }
            const closedFiles = [];
            for (const [path] of lastFiles.entries()) {
                if (!currentFiles.has(path)) {
                    closedFiles.push(path);
                }
            }
            if (closedFiles.length > 0) {
                changes["filesClosed"] = closedFiles;
            }
            const lastActiveFile = (this.lastSentIdeContext.workspaceState?.openFiles || []).find((f) => f.isActive);
            const currentActiveFile = (currentIdeContext.workspaceState?.openFiles || []).find((f) => f.isActive);
            if (currentActiveFile) {
                if (!lastActiveFile || lastActiveFile.path !== currentActiveFile.path) {
                    changes["activeFileChanged"] = {
                        path: currentActiveFile.path,
                        cursor: currentActiveFile.cursor
                            ? {
                                line: currentActiveFile.cursor.line,
                                character: currentActiveFile.cursor.character,
                            }
                            : undefined,
                        selectedText: currentActiveFile.selectedText || undefined,
                    };
                }
                else {
                    const lastCursor = lastActiveFile.cursor;
                    const currentCursor = currentActiveFile.cursor;
                    if (currentCursor &&
                        (!lastCursor ||
                            lastCursor.line !== currentCursor.line ||
                            lastCursor.character !== currentCursor.character)) {
                        changes["cursorMoved"] = {
                            path: currentActiveFile.path,
                            cursor: {
                                line: currentCursor.line,
                                character: currentCursor.character,
                            },
                        };
                    }
                    const lastSelectedText = lastActiveFile.selectedText || "";
                    const currentSelectedText = currentActiveFile.selectedText || "";
                    if (lastSelectedText !== currentSelectedText) {
                        changes["selectionChanged"] = {
                            path: currentActiveFile.path,
                            selectedText: currentSelectedText,
                        };
                    }
                }
            }
            else if (lastActiveFile) {
                changes["activeFileChanged"] = {
                    path: null,
                    previousPath: lastActiveFile.path,
                };
            }
            if (Object.keys(changes).length === 0) {
                return { contextParts: [], newIdeContext: currentIdeContext };
            }
            delta["changes"] = changes;
            const jsonString = JSON.stringify(delta, null, 2);
            const contextParts = [
                "Here is a summary of changes in the user's editor context, in JSON format. This is for your information only.",
                "```json",
                jsonString,
                "```",
            ];
            if (this.config.getDebugMode()) {
                console.log(contextParts.join("\n"));
            }
            return {
                contextParts,
                newIdeContext: currentIdeContext,
            };
        }
    }
    async *sendMessageStream(request, signal, prompt_id, turns = MAX_TURNS, originalModel) {
        const isNewPrompt = this.lastPromptId !== prompt_id;
        if (isNewPrompt) {
            this.loopDetector.reset(prompt_id);
            this.lastPromptId = prompt_id;
            console.debug(`[Agent] Starting new prompt: ${prompt_id.substring(0, 8)}...`);
        }
        this.sessionTurnCount++;
        console.debug(`[Agent] Turn ${this.sessionTurnCount} (model: ${this.config.getModel()})`);
        if (this.config.getMaxSessionTurns() > 0 &&
            this.sessionTurnCount > this.config.getMaxSessionTurns()) {
            yield { type: GeminiEventType.MaxSessionTurns };
            return new Turn(this.getChat(), prompt_id);
        }
        // Ensure turns never exceeds MAX_TURNS to prevent infinite loops
        const boundedTurns = Math.min(turns, MAX_TURNS);
        if (!boundedTurns) {
            return new Turn(this.getChat(), prompt_id);
        }
        // Track the original model from the first call to detect model switching
        const initialModel = originalModel || this.config.getModel();
        const providerTag = getProviderTelemetryTag(this.config);
        const compressed = await this.tryCompressChat(prompt_id);
        if (compressed.compressionStatus === CompressionStatus.COMPRESSED) {
            yield { type: GeminiEventType.ChatCompressed, value: compressed };
        }
        // Check session token limit after compression using accurate token counting
        const sessionTokenLimit = this.config.getSessionTokenLimit();
        if (sessionTokenLimit > 0) {
            // Get all the content that would be sent in an API call
            const currentHistory = this.getChat().getHistory(true);
            const userMemory = this.config.getUserMemory();
            const systemPrompt = getCoreSystemPrompt(userMemory, {}, this.config.getModel());
            const environment = await getEnvironmentContext(this.config);
            // Create a mock request content to count total tokens
            const mockRequestContent = [
                {
                    role: "system",
                    parts: [{ text: systemPrompt }, ...environment],
                },
                ...currentHistory,
            ];
            // Use the improved countTokens method for accurate counting
            const { totalTokens: totalRequestTokens } = await this.getContentGenerator().countTokens({
                model: this.config.getModel(),
                contents: mockRequestContent,
            });
            if (totalRequestTokens !== undefined &&
                totalRequestTokens > sessionTokenLimit) {
                yield {
                    type: GeminiEventType.SessionTokenLimitExceeded,
                    value: {
                        currentTokens: totalRequestTokens,
                        limit: sessionTokenLimit,
                        message: `Session token limit exceeded: ${totalRequestTokens} tokens > ${sessionTokenLimit} limit. ` +
                            "Please start a new session or increase the sessionTokenLimit in your settings.json.",
                    },
                };
                return new Turn(this.getChat(), prompt_id);
            }
        }
        const budgetSnapshot = await this.ensureRequestWithinBudget(prompt_id, request);
        if (budgetSnapshot &&
            budgetSnapshot.tokens >= budgetSnapshot.warnThreshold &&
            budgetSnapshot.tokens <= budgetSnapshot.limit) {
            yield {
                type: GeminiEventType.TokenBudgetWarning,
                value: {
                    tokens: budgetSnapshot.tokens,
                    limit: budgetSnapshot.limit,
                    effectiveLimit: budgetSnapshot.effectiveLimit,
                },
            };
        }
        // Prevent context updates from being sent while a tool call is
        // waiting for a response. The Qwen API requires that a functionResponse
        // part from the user immediately follows a functionCall part from the model
        // in the conversation history . The IDE context is not discarded; it will
        // be included in the next regular message sent to the model.
        const history = this.getHistory();
        const lastMessage = history.length > 0 ? history[history.length - 1] : undefined;
        const hasPendingToolCall = !!lastMessage &&
            lastMessage.role === "model" &&
            (lastMessage.parts?.some((p) => "functionCall" in p) || false);
        if (this.config.getIdeMode() && !hasPendingToolCall) {
            const { contextParts, newIdeContext } = this.getIdeContextParts(this.forceFullIdeContext || history.length === 0);
            if (contextParts.length > 0) {
                this.getChat().addHistory({
                    role: "user",
                    parts: [{ text: contextParts.join("\n") }],
                });
            }
            this.lastSentIdeContext = newIdeContext;
            this.forceFullIdeContext = false;
        }
        const turn = new Turn(this.getChat(), prompt_id);
        if (!this.config.getSkipLoopDetection()) {
            const loopDetected = await this.loopDetector.turnStarted(signal);
            if (loopDetected) {
                yield { type: GeminiEventType.LoopDetected };
                return turn;
            }
        }
        // append system reminders to the request
        let requestToSent = await flatMapTextParts(request, async (text) => [text]);
        if (isNewPrompt) {
            const systemReminders = [];
            // add subagent system reminder if there are subagents
            const hasTaskTool = this.config.getToolRegistry().getTool(TaskTool.Name);
            const subagents = (await this.config.getSubagentManager().listSubagents())
                .filter((subagent) => subagent.level !== "builtin")
                .map((subagent) => subagent.name);
            if (hasTaskTool && subagents.length > 0) {
                systemReminders.push(getSubagentSystemReminder(subagents));
            }
            // add plan mode system reminder if approval mode is plan
            if (this.config.getApprovalMode() === ApprovalMode.PLAN) {
                systemReminders.push(getPlanModeSystemReminder());
            }
            requestToSent = [...systemReminders, ...requestToSent];
        }
        console.debug(`[Agent] Sending request to model...`);
        const resultStream = turn.run(requestToSent, signal);
        let contentChunks = 0;
        for await (const event of resultStream) {
            if (!this.config.getSkipLoopDetection()) {
                if (this.loopDetector.addAndCheck(event)) {
                    console.debug(`[Agent] Loop detected, stopping`);
                    yield { type: GeminiEventType.LoopDetected };
                    return turn;
                }
            }
            if (event.type === GeminiEventType.Error &&
                isRecoverableStreamErrorMessage(event.value?.error?.message)) {
                if (providerTag === "lmstudio") {
                    console.debug("[Agent] Recoverable stream error encountered; skipping non-streaming fallback for LM Studio.");
                    continue;
                }
                console.debug(`[Agent] Recoverable error, using non-streaming fallback`);
                const fallbackEvents = await this.runNonStreamingFallback(prompt_id, requestToSent);
                for (const fallbackEvent of fallbackEvents) {
                    yield fallbackEvent;
                }
                return turn;
            }
            // Log content streaming
            if (event.type === GeminiEventType.Content) {
                contentChunks++;
                if (contentChunks === 1) {
                    console.debug(`[Agent] Model started responding...`);
                }
            }
            yield event;
            if (event.type === GeminiEventType.Error) {
                console.debug(`[Agent] Error occurred: ${event.value?.error?.message || "Unknown"}`);
                return turn;
            }
        }
        if (contentChunks > 0) {
            console.debug(`[Agent] Model finished responding (${contentChunks} chunks)`);
        }
        if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
            // Check if model was switched during the call (likely due to quota error)
            const currentModel = this.config.getModel();
            if (currentModel !== initialModel) {
                // Model was switched (likely due to quota error fallback)
                // Don't continue with recursive call to prevent unwanted Flash execution
                return turn;
            }
            if (providerTag === "lmstudio" || this.config.getSkipNextSpeakerCheck()) {
                return turn;
            }
            const nextSpeakerCheck = await checkNextSpeaker(this.getChat(), this, signal);
            logNextSpeakerCheck(this.config, new NextSpeakerCheckEvent(prompt_id, turn.finishReason?.toString() || "", nextSpeakerCheck?.next_speaker || ""));
            if (nextSpeakerCheck?.next_speaker === "model") {
                const nextRequest = [{ text: "Please continue." }];
                // This recursive call's events will be yielded out, but the final
                // turn object will be from the top-level call.
                yield* this.sendMessageStream(nextRequest, signal, prompt_id, boundedTurns - 1, initialModel);
            }
        }
        return turn;
    }
    async ensureRequestWithinBudget(promptId, userMessage) {
        const model = this.config.getModel();
        if (!model) {
            return undefined;
        }
        const manager = this.getTokenBudgetManager();
        const buildPreview = () => {
            const historySnapshot = this.getChat().getHistory(true);
            const userContent = createUserContent(userMessage);
            return [...historySnapshot, userContent];
        };
        const compressionStrategies = [
            { force: false },
            { force: true, preserveFraction: 0.25 },
            { force: true, preserveFraction: 0.2 },
        ];
        for (let attempt = 0; attempt <= compressionStrategies.length; attempt++) {
            const previewContents = buildPreview();
            const snapshot = await manager.evaluate(model, previewContents);
            if (snapshot.fitsWithinEffective) {
                return snapshot;
            }
            const outOfHardLimit = !snapshot.withinHardLimit;
            if (attempt >= compressionStrategies.length) {
                const message = outOfHardLimit
                    ? `Request would exceed the model's context window (${snapshot.tokens.toLocaleString()} > ${snapshot.limit.toLocaleString()} tokens).`
                    : `Request would exceed the safe context budget (${snapshot.tokens.toLocaleString()} > ${snapshot.effectiveLimit.toLocaleString()} tokens).`;
                throw new TokenBudgetExceededError(message, snapshot);
            }
            const strategy = compressionStrategies[attempt];
            const compressionResult = await this.tryCompressChat(promptId, strategy.force, {
                preserveFraction: strategy.preserveFraction,
            });
            if (compressionResult.compressionStatus ===
                CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR ||
                compressionResult.compressionStatus ===
                    CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT) {
                // Standard compression failed - try adaptive recovery as last resort
                console.warn("[Context Management] Standard compression failed, attempting self-healing recovery...");
                const recovered = await this.tryAdaptiveRecovery(promptId);
                if (recovered) {
                    // Recovery successful - retry the budget check
                    const retrySnapshot = await manager.evaluate(model, buildPreview());
                    if (retrySnapshot.fitsWithinEffective) {
                        console.warn("[Context Management] ✓ Self-healing recovery successful");
                        return retrySnapshot;
                    }
                }
                // Recovery failed or still doesn't fit
                throw new TokenBudgetExceededError(`Unable to compress history to fit within the context window (${snapshot.tokens.toLocaleString()} tokens). Tried ${COMPRESSION_STRATEGIES.length} recovery strategies.`, snapshot);
            }
        }
        // Should never reach here because the loop either returns or throws.
        return undefined;
    }
    /**
     * Self-healing recovery from context overflow using adaptive compression.
     * This is a last-resort fallback when standard compression fails.
     */
    async tryAdaptiveRecovery(promptId) {
        console.warn("[Context Recovery] Standard compression failed, attempting adaptive recovery...");
        const currentHistory = this.getChat().getHistory(true);
        if (currentHistory.length === 0) {
            console.error("[Context Recovery] Cannot recover: history is empty");
            return false;
        }
        // Try each compression strategy progressively
        for (let i = 0; i < COMPRESSION_STRATEGIES.length; i++) {
            const strategy = COMPRESSION_STRATEGIES[i];
            console.warn(`[Context Recovery] Trying strategy ${i + 1}/${COMPRESSION_STRATEGIES.length}...`);
            const compressed = applyAdaptiveCompression(currentHistory, strategy);
            const ratio = estimateCompressionRatio(currentHistory, compressed);
            console.warn(`[Context Recovery] Compression ratio: ${(ratio * 100).toFixed(1)}% (${currentHistory.length} -> ${compressed.length} messages)`);
            // Apply the compressed history
            await this.startChat(compressed);
            // Check if it fits now
            const model = this.config.getModel();
            if (!model) {
                console.error("[Context Recovery] No model configured");
                return false;
            }
            const manager = this.getTokenBudgetManager();
            const snapshot = await manager.evaluate(model, compressed);
            if (snapshot.fitsWithinEffective) {
                console.warn(`[Context Recovery] ✓ Recovery successful with strategy ${i + 1}`);
                return true;
            }
            console.warn(`[Context Recovery] Strategy ${i + 1} insufficient (${snapshot.tokens} > ${snapshot.effectiveLimit} tokens)`);
        }
        console.error("[Context Recovery] All recovery strategies exhausted");
        return false;
    }
    async runNonStreamingFallback(promptId, message) {
        const fallbackResponse = await this.getChat().sendMessage({ message }, promptId);
        const events = [];
        const textParts = fallbackResponse.candidates?.[0]?.content?.parts?.map((part) => "text" in part && part.text ? part.text : "") ?? [];
        const text = textParts.filter(Boolean).join("");
        if (text) {
            events.push({
                type: GeminiEventType.Content,
                value: text,
            });
        }
        const functionCalls = getFunctionCalls(fallbackResponse) ?? [];
        functionCalls.forEach((call, index) => {
            const toolCall = {
                callId: call?.id ||
                    `fallback_call_${Date.now().toString(36)}_${index.toString(36)}`,
                name: call?.name ?? "unknown_tool",
                args: call?.args ?? {},
                isClientInitiated: false,
                prompt_id: promptId,
            };
            events.push({
                type: GeminiEventType.ToolCallRequest,
                value: toolCall,
            });
        });
        events.push({
            type: GeminiEventType.Finished,
            value: fallbackResponse.candidates?.[0]?.finishReason ??
                FinishReason.FINISH_REASON_UNSPECIFIED,
        });
        return events;
    }
    async generateJson(contents, schema, abortSignal, model, config = {}) {
        /**
         * TODO: ensure `model` consistency among GeminiClient, GeminiChat, and ContentGenerator
         * `model` passed to generateContent is not respected as we always use contentGenerator
         * We should ignore model for now because some calls use `DEFAULT_GEMINI_FLASH_MODEL`
         * which is not available as `qwen3-coder-flash`
         */
        const modelToUse = this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL;
        const providerTag = getProviderTelemetryTag(this.config);
        let lastRetryMetadata;
        try {
            const userMemory = this.config.getUserMemory();
            const finalSystemInstruction = config.systemInstruction
                ? getCustomSystemPrompt(config.systemInstruction, userMemory)
                : getCoreSystemPrompt(userMemory, {}, modelToUse);
            const requestConfig = {
                abortSignal,
                ...this.generateContentConfig,
                ...config,
                systemInstruction: finalSystemInstruction,
            };
            // Convert schema to function declaration
            const functionDeclaration = {
                name: "respond_in_schema",
                description: "Provide the response in provided schema",
                parameters: schema,
            };
            const tools = [
                {
                    functionDeclarations: [functionDeclaration],
                },
            ];
            const apiCall = () => this.getContentGenerator().generateContent({
                model: modelToUse,
                config: {
                    ...requestConfig,
                    tools,
                },
                contents,
            }, this.lastPromptId);
            const result = await retryWithBackoff(apiCall, {
                onPersistent429: async (authType, error) => await this.handleFlashFallback(authType, error),
                authType: this.config.getContentGeneratorConfig()?.authType,
                onRetryableError: (error, context) => {
                    lastRetryMetadata = {
                        attempt: context.attempt,
                        classification: context.classification,
                        status: context.status,
                    };
                    logContentRetry(this.config, new ContentRetryEvent(context.attempt, error.name ?? "Error", Math.round(context.delayMs), {
                        classification: context.classification,
                        provider: providerTag,
                        status_code: context.status,
                        error_message: error.message,
                    }));
                },
            });
            lastRetryMetadata = undefined;
            const functionCalls = getFunctionCalls(result);
            if (functionCalls && functionCalls.length > 0) {
                const functionCall = functionCalls.find((call) => call.name === "respond_in_schema");
                if (functionCall && functionCall.args) {
                    return functionCall.args;
                }
            }
            return {};
        }
        catch (error) {
            if (abortSignal.aborted) {
                throw error;
            }
            if (lastRetryMetadata) {
                logContentRetryFailure(this.config, new ContentRetryFailureEvent(lastRetryMetadata.attempt, error instanceof Error ? error.name : "UnknownError", undefined, {
                    final_classification: lastRetryMetadata.classification,
                    provider: providerTag,
                    status_code: lastRetryMetadata.status,
                    error_message: error instanceof Error ? error.message : String(error),
                }));
                lastRetryMetadata = undefined;
            }
            // Avoid double reporting for the empty response case handled above
            if (error instanceof Error &&
                error.message === "API returned an empty response for generateJson.") {
                throw error;
            }
            await reportError(error, "Error generating JSON content via API.", contents, "generateJson-api");
            throw new Error(`Failed to generate JSON content: ${getErrorMessage(error)}`);
        }
    }
    async generateContent(contents, generationConfig, abortSignal, model) {
        const modelToUse = model ?? this.config.getModel();
        const configToUse = {
            ...this.generateContentConfig,
            ...generationConfig,
        };
        const providerTag = getProviderTelemetryTag(this.config);
        let lastRetryMetadata;
        try {
            const userMemory = this.config.getUserMemory();
            const finalSystemInstruction = generationConfig.systemInstruction
                ? getCustomSystemPrompt(generationConfig.systemInstruction, userMemory)
                : getCoreSystemPrompt(userMemory, {}, this.config.getModel());
            const requestConfig = {
                abortSignal,
                ...configToUse,
                systemInstruction: finalSystemInstruction,
            };
            const apiCall = () => this.getContentGenerator().generateContent({
                model: modelToUse,
                config: requestConfig,
                contents,
            }, this.lastPromptId);
            const result = await retryWithBackoff(apiCall, {
                onPersistent429: async (authType, error) => await this.handleFlashFallback(authType, error),
                authType: this.config.getContentGeneratorConfig()?.authType,
                onRetryableError: (error, context) => {
                    lastRetryMetadata = {
                        attempt: context.attempt,
                        classification: context.classification,
                        status: context.status,
                    };
                    logContentRetry(this.config, new ContentRetryEvent(context.attempt, error.name ?? "Error", Math.round(context.delayMs), {
                        classification: context.classification,
                        provider: providerTag,
                        status_code: context.status,
                        error_message: error.message,
                    }));
                },
            });
            lastRetryMetadata = undefined;
            return result;
        }
        catch (error) {
            if (abortSignal.aborted) {
                throw error;
            }
            if (lastRetryMetadata) {
                logContentRetryFailure(this.config, new ContentRetryFailureEvent(lastRetryMetadata.attempt, error instanceof Error ? error.name : "UnknownError", undefined, {
                    final_classification: lastRetryMetadata.classification,
                    provider: providerTag,
                    status_code: lastRetryMetadata.status,
                    error_message: error instanceof Error ? error.message : String(error),
                }));
                lastRetryMetadata = undefined;
            }
            await reportError(error, `Error generating content via API with model ${modelToUse}.`, {
                requestContents: contents,
                requestConfig: configToUse,
            }, "generateContent-api");
            throw new Error(`Failed to generate content with model ${modelToUse}: ${getErrorMessage(error)}`);
        }
    }
    async generateEmbedding(texts) {
        if (!texts || texts.length === 0) {
            return [];
        }
        const embedModelParams = {
            model: this.embeddingModel,
            contents: texts,
        };
        const embedContentResponse = await this.getContentGenerator().embedContent(embedModelParams);
        if (!embedContentResponse.embeddings ||
            embedContentResponse.embeddings.length === 0) {
            throw new Error("No embeddings found in API response.");
        }
        if (embedContentResponse.embeddings.length !== texts.length) {
            throw new Error(`API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`);
        }
        return embedContentResponse.embeddings.map((embedding, index) => {
            const values = embedding.values;
            if (!values || values.length === 0) {
                throw new Error(`API returned an empty embedding for input text at index ${index}: "${texts[index]}"`);
            }
            return values;
        });
    }
    async tryCompressChat(prompt_id, force = false, options = {}) {
        const curatedHistory = this.getChat().getHistory(true);
        // Regardless of `force`, don't do anything if the history is empty.
        if (curatedHistory.length === 0 ||
            (this.hasFailedCompressionAttempt && !force)) {
            return {
                originalTokenCount: 0,
                newTokenCount: 0,
                compressionStatus: CompressionStatus.NOOP,
            };
        }
        const model = this.config.getModel();
        const contextLimit = this.config.getEffectiveContextLimit(model);
        const { totalTokens: originalTokenCount } = await this.getContentGenerator().countTokens({
            model,
            contents: curatedHistory,
        });
        if (originalTokenCount === undefined) {
            console.warn(`Could not determine token count for model ${model}.`);
            this.hasFailedCompressionAttempt = !force && true;
            return {
                originalTokenCount: 0,
                newTokenCount: 0,
                compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
            };
        }
        const contextPercentageThreshold = this.config.getChatCompression()?.contextPercentageThreshold;
        // Don't compress if not forced and we are under the limit.
        if (!force) {
            const threshold = contextPercentageThreshold ?? COMPRESSION_TOKEN_THRESHOLD;
            if (originalTokenCount < threshold * contextLimit) {
                return {
                    originalTokenCount,
                    newTokenCount: originalTokenCount,
                    compressionStatus: CompressionStatus.NOOP,
                };
            }
        }
        const preserveFraction = Math.min(Math.max(options.preserveFraction ?? COMPRESSION_PRESERVE_THRESHOLD, 0.05), 0.8);
        let compressBeforeIndex = findIndexAfterFraction(curatedHistory, 1 - preserveFraction);
        // Find the first user message after the index. This is the start of the next turn.
        while (compressBeforeIndex < curatedHistory.length &&
            (curatedHistory[compressBeforeIndex]?.role === "model" ||
                isFunctionResponse(curatedHistory[compressBeforeIndex]))) {
            compressBeforeIndex++;
        }
        const historyToCompress = curatedHistory.slice(0, compressBeforeIndex);
        const historyToKeep = curatedHistory.slice(compressBeforeIndex);
        this.getChat().setHistory(historyToCompress);
        const { text: summary } = await this.getChat().sendMessage({
            message: {
                text: "First, reason in your scratchpad. Then, generate the <state_snapshot>.",
            },
            config: {
                systemInstruction: { text: getCompressionPrompt() },
                maxOutputTokens: originalTokenCount,
            },
        }, prompt_id);
        const chat = await this.startChat([
            {
                role: "user",
                parts: [{ text: summary }],
            },
            {
                role: "model",
                parts: [{ text: "Got it. Thanks for the additional context!" }],
            },
            ...historyToKeep,
        ]);
        this.forceFullIdeContext = true;
        const { totalTokens: newTokenCount } = await this.getContentGenerator().countTokens({
            // model might change after calling `sendMessage`, so we get the newest value from config
            model: this.config.getModel(),
            contents: chat.getHistory(),
        });
        if (newTokenCount === undefined) {
            console.warn("Could not determine compressed history token count.");
            this.hasFailedCompressionAttempt = !force && true;
            return {
                originalTokenCount,
                newTokenCount: originalTokenCount,
                compressionStatus: CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
            };
        }
        logChatCompression(this.config, makeChatCompressionEvent({
            tokens_before: originalTokenCount,
            tokens_after: newTokenCount,
        }));
        if (newTokenCount > originalTokenCount) {
            this.getChat().setHistory(curatedHistory);
            this.hasFailedCompressionAttempt = !force && true;
            return {
                originalTokenCount,
                newTokenCount,
                compressionStatus: CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
            };
        }
        else {
            this.chat = chat; // Chat compression successful, set new state.
        }
        logChatCompression(this.config, makeChatCompressionEvent({
            tokens_before: originalTokenCount,
            tokens_after: newTokenCount,
        }));
        return {
            originalTokenCount,
            newTokenCount,
            compressionStatus: CompressionStatus.COMPRESSED,
        };
    }
    /**
     * Handles falling back to Flash model when persistent 429 errors occur for OAuth users.
     * Uses a fallback handler if provided by the config; otherwise, returns null.
     */
    async handleFlashFallback(authType, error) {
        // Handle different auth types
        if (authType === AuthType.QWEN_OAUTH) {
            return this.handleQwenOAuthError(error);
        }
        // Only handle fallback for OAuth users
        if (authType !== AuthType.LOGIN_WITH_GOOGLE) {
            return null;
        }
        const currentModel = this.config.getModel();
        const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;
        // Don't fallback if already using Flash model
        if (currentModel === fallbackModel) {
            return null;
        }
        // Check if config has a fallback handler (set by CLI package)
        const fallbackHandler = this.config.flashFallbackHandler;
        if (typeof fallbackHandler === "function") {
            try {
                const accepted = await fallbackHandler(currentModel, fallbackModel, error);
                if (accepted !== false && accepted !== null) {
                    await this.config.setModel(fallbackModel);
                    this.config.setFallbackMode(true);
                    return fallbackModel;
                }
                // Check if the model was switched manually in the handler
                if (this.config.getModel() === fallbackModel) {
                    return null; // Model was switched but don't continue with current prompt
                }
            }
            catch (error) {
                console.warn("Flash fallback handler failed:", error);
            }
        }
        return null;
    }
    /**
     * Handles Qwen OAuth authentication errors and rate limiting
     */
    async handleQwenOAuthError(error) {
        if (!error) {
            return null;
        }
        const errorMessage = error instanceof Error
            ? error.message.toLowerCase()
            : String(error).toLowerCase();
        const errorCode = error?.status ||
            error?.code;
        // Check if this is an authentication/authorization error
        const isAuthError = errorCode === 401 ||
            errorCode === 403 ||
            errorMessage.includes("unauthorized") ||
            errorMessage.includes("forbidden") ||
            errorMessage.includes("invalid api key") ||
            errorMessage.includes("authentication") ||
            errorMessage.includes("access denied") ||
            (errorMessage.includes("token") && errorMessage.includes("expired"));
        // Check if this is a rate limiting error
        const isRateLimitError = errorCode === 429 ||
            errorMessage.includes("429") ||
            errorMessage.includes("rate limit") ||
            errorMessage.includes("too many requests");
        if (isAuthError) {
            console.warn("Qwen OAuth authentication error detected:", errorMessage);
            // The QwenContentGenerator should automatically handle token refresh
            // If it still fails, it likely means the refresh token is also expired
            console.log("Note: If this persists, you may need to re-authenticate with Qwen OAuth");
            return null;
        }
        if (isRateLimitError) {
            console.warn("Qwen API rate limit encountered:", errorMessage);
            // For rate limiting, we don't need to do anything special
            // The retry mechanism will handle the backoff
            return null;
        }
        // For other errors, don't handle them specially
        return null;
    }
}
export const TEST_ONLY = {
    COMPRESSION_PRESERVE_THRESHOLD,
    COMPRESSION_TOKEN_THRESHOLD,
};
//# sourceMappingURL=client.js.map