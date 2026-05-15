import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Box, measureElement, Static, Text, useStdin, useStdout, } from "ink";
import { ViewOverlay } from "./components/ViewOverlay.js";
import { StreamingState, MessageType, ToolCallStatus, } from "./types.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { useGeminiStream } from "./hooks/useGeminiStream.js";
import { useLoadingIndicator } from "./hooks/useLoadingIndicator.js";
import { useThemeCommand } from "./hooks/useThemeCommand.js";
import { useAuthCommand } from "./hooks/useAuthCommand.js";
import { useQwenAuth } from "./hooks/useQwenAuth.js";
import { useFolderTrust } from "./hooks/useFolderTrust.js";
import { useEditorSettings } from "./hooks/useEditorSettings.js";
import { useQuitConfirmation } from "./hooks/useQuitConfirmation.js";
import { useWelcomeBack } from "./hooks/useWelcomeBack.js";
import { useStartupStatus } from "./hooks/useStartupStatus.js";
import { useDialogClose } from "./hooks/useDialogClose.js";
import { useSlashCommandProcessor } from "./hooks/slashCommandProcessor.js";
import { useSessionLoggingController } from "./hooks/useSessionLoggingController.js";
import { useAutoAcceptIndicator } from "./hooks/useAutoAcceptIndicator.js";
import { useMessageQueue } from "./hooks/useMessageQueue.js";
import { useConsoleMessages } from "./hooks/useConsoleMessages.js";
import { Header } from "./components/Header.js";
import { LoadingIndicator } from "./components/LoadingIndicator.js";
import { AutoAcceptIndicator } from "./components/AutoAcceptIndicator.js";
import { ShellModeIndicator } from "./components/ShellModeIndicator.js";
import { InputPrompt } from "./components/InputPrompt.js";
import { Footer } from "./components/Footer.js";
import { ThemeDialog } from "./components/ThemeDialog.js";
import { AuthDialog } from "./components/AuthDialog.js";
import { AuthInProgress } from "./components/AuthInProgress.js";
import { QwenOAuthProgress } from "./components/QwenOAuthProgress.js";
import { EditorSettingsDialog } from "./components/EditorSettingsDialog.js";
import { FolderTrustDialog } from "./components/FolderTrustDialog.js";
import { ShellConfirmationDialog } from "./components/ShellConfirmationDialog.js";
import { QuitConfirmationDialog } from "./components/QuitConfirmationDialog.js";
import { RadioButtonSelect } from "./components/shared/RadioButtonSelect.js";
import { ModelSelectionDialog } from "./components/ModelSelectionDialog.js";
import { TaskTemplateEditorDialog, } from "./components/TaskTemplateEditorDialog.js";
import { MailboxDialog } from "./components/MailboxDialog.js";
import { ResumeDialog, } from "./components/ResumeDialog.js";
import { ModelSwitchDialog, } from "./components/ModelSwitchDialog.js";
import { LlamaCppModelConfigDialog } from "./components/LlamaCppModelConfigDialog.js";
import { LlamaCppLoadingBar } from "./components/LlamaCppLoadingBar.js";
import { getOpenAIAvailableModelFromEnv, getFilteredGeminiModels, getFilteredQwenModels, fetchOpenAICompatibleModels, fetchGeminiModels, getLMStudioLoadedModel, } from "./models/availableModels.js";
import { processVisionSwitchOutcome } from "./hooks/useVisionAutoSwitch.js";
import { Colors } from "./colors.js";
import { loadHierarchicalGeminiMemory } from "../config/config.js";
import { setOpenAIModel, validateAuthMethod } from "../config/auth.js";
import { SettingScope } from "../config/settings.js";
/** Helper to read a nested property from a settings object by dot-path. */
function getNestedProperty(obj, path) {
    const keys = path.split(".");
    let current = obj;
    for (const key of keys) {
        if (typeof current !== "object" || current === null || !(key in current)) {
            return undefined;
        }
        current = current[key];
    }
    return current;
}
import { Tips } from "./components/Tips.js";
import { ConsolePatcher } from "./utils/ConsolePatcher.js";
import { registerCleanup } from "../utils/cleanup.js";
import { DetailedMessagesDisplay } from "./components/DetailedMessagesDisplay.js";
import { HistoryItemDisplay } from "./components/HistoryItemDisplay.js";
import { ContextSummaryDisplay } from "./components/ContextSummaryDisplay.js";
import { useHistory } from "./hooks/useHistoryManager.js";
import process from "node:process";
import { ApprovalMode, getAllGeminiMdFilenames, isEditorAvailable, getErrorMessage, AuthType, logFlashFallback, FlashFallbackEvent, ideContext, isProQuotaExceededError, isGenericQuotaExceededError, UserTierId, CheckpointService, terminalSessionService, } from "@qwen-code/qwen-code-core";
import { IdeIntegrationNudge } from "./IdeIntegrationNudge.js";
import { useLogger } from "./hooks/useLogger.js";
import { StreamingContext } from "./contexts/StreamingContext.js";
import { SessionStatsProvider, useSessionStats, } from "./contexts/SessionContext.js";
import { useGitBranchName } from "./hooks/useGitBranchName.js";
import { useFocus } from "./hooks/useFocus.js";
import { useBracketedPaste } from "./hooks/useBracketedPaste.js";
import { useTextBuffer } from "./components/shared/text-buffer.js";
import { useVimMode, VimModeProvider } from "./contexts/VimModeContext.js";
import { useVim } from "./hooks/vim.js";
import { useKeypress } from "./hooks/useKeypress.js";
import { KeypressProvider } from "./contexts/KeypressContext.js";
import { useKittyKeyboardProtocol } from "./hooks/useKittyKeyboardProtocol.js";
import { keyMatchers, Command } from "./keyMatchers.js";
import * as fs from "node:fs";
import { UpdateNotification } from "./components/UpdateNotification.js";
import ansiEscapes from "ansi-escapes";
import { OverflowProvider } from "./contexts/OverflowContext.js";
import { ShowMoreLines } from "./components/ShowMoreLines.js";
import { PrivacyNotice } from "./privacy/PrivacyNotice.js";
import { useSettingsCommand } from "./hooks/useSettingsCommand.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { setUpdateHandler } from "../utils/handleAutoUpdate.js";
import { appEvents, AppEvent } from "../utils/events.js";
import { isNarrowWidth } from "./utils/isNarrowWidth.js";
import { useWorkspaceMigration } from "./hooks/useWorkspaceMigration.js";
import { WorkspaceMigrationDialog } from "./components/WorkspaceMigrationDialog.js";
import { WelcomeBackDialog } from "./components/WelcomeBackDialog.js";
import { LiveTerminalPanel, HEADER_ROWS } from "./components/LiveTerminalPanel.js";
// Maximum number of queued messages to display in UI to prevent performance issues
const MAX_DISPLAYED_QUEUED_MESSAGES = 3;
function isToolExecuting(pendingHistoryItems) {
    return pendingHistoryItems.some((item) => {
        if (item && item.type === "tool_group") {
            return item.tools.some((tool) => ToolCallStatus.Executing === tool.status);
        }
        return false;
    });
}
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const LIVE_TERMINAL_TEXT_SCAN_LIMIT = 20000;
function sanitizeLiveTerminalText(text, maxChars) {
    const source = text ?? "";
    const clippedSource = source.length > maxChars ? `${source.slice(0, maxChars)}...` : source;
    return clippedSource
        .replace(ANSI_ESCAPE_PATTERN, "")
        .replace(CONTROL_CHARACTER_PATTERN, "")
        .replace(/\r/g, "");
}
function fitLiveTerminalRow(text, width) {
    const maxWidth = Math.max(10, width);
    if (text.length <= maxWidth) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxWidth - 3))}...`;
}
function pushLiveTerminalTextRows(rows, keyPrefix, prefix, text, width, color, maxRows = 3) {
    const maxScannedChars = Math.min(LIVE_TERMINAL_TEXT_SCAN_LIMIT, Math.max(200, width * maxRows * 2));
    const cleanText = sanitizeLiveTerminalText(text, maxScannedChars).trimEnd();
    const contentWidth = Math.max(10, width - prefix.length);
    const sourceLines = cleanText.length > 0 ? cleanText.split("\n") : [""];
    const outputLines = [];
    for (const sourceLine of sourceLines) {
        let remaining = sourceLine.trimEnd();
        do {
            outputLines.push(remaining.slice(0, contentWidth));
            remaining = remaining.slice(contentWidth);
        } while (remaining.length > 0 && outputLines.length < maxRows);
        if (outputLines.length >= maxRows) {
            break;
        }
    }
    if (outputLines.length === 0) {
        outputLines.push("");
    }
    outputLines.forEach((line, index) => {
        const rowPrefix = index === 0 ? prefix : " ".repeat(prefix.length);
        rows.push({
            key: `${keyPrefix}-line-${index}`,
            text: fitLiveTerminalRow(`${rowPrefix}${line}`, width),
            color,
        });
    });
    if (sourceLines.length > outputLines.length ||
        cleanText.length > outputLines.join("").length) {
        rows[rows.length - 1].text = fitLiveTerminalRow(`${rows[rows.length - 1].text}...`, width);
    }
}
function getToolStatusColor(status) {
    switch (status) {
        case ToolCallStatus.Success:
            return Colors.AccentGreen;
        case ToolCallStatus.Error:
            return Colors.AccentRed;
        case ToolCallStatus.Canceled:
            return Colors.Gray;
        case ToolCallStatus.Executing:
        case ToolCallStatus.Confirming:
        case ToolCallStatus.Pending:
            return Colors.AccentYellow;
        default:
            return Colors.Gray;
    }
}
function buildLiveTerminalConversationItemRows(conversationItem, width) {
    const rows = [];
    const { item, isPending } = conversationItem;
    const keyPrefix = `${isPending ? "pending" : "history"}-${item.id}`;
    const pendingPrefix = isPending ? "* " : "";
    switch (item.type) {
        case "user":
            pushLiveTerminalTextRows(rows, keyPrefix, `${pendingPrefix}> `, item.text, width, Colors.AccentBlue, 40);
            break;
        case "user_shell":
            pushLiveTerminalTextRows(rows, keyPrefix, `${pendingPrefix}$ `, item.text, width, Colors.AccentCyan, 20);
            break;
        case "gemini":
        case "gemini_content":
            pushLiveTerminalTextRows(rows, keyPrefix, `${pendingPrefix}LLM: `, item.text, width, undefined, 120);
            break;
        case "info":
            pushLiveTerminalTextRows(rows, keyPrefix, `${pendingPrefix}info: `, item.text, width, Colors.AccentCyan, 30);
            break;
        case "error":
            pushLiveTerminalTextRows(rows, keyPrefix, `${pendingPrefix}error: `, item.text, width, Colors.AccentRed, 80);
            break;
        case "tool_group":
            item.tools.forEach((tool, index) => {
                const status = tool.status.toLowerCase();
                rows.push({
                    key: `${keyPrefix}-tool-${tool.callId}-${index}`,
                    text: fitLiveTerminalRow(`${pendingPrefix}tool: ${tool.name} ${tool.description} [${status}]`, width),
                    color: getToolStatusColor(tool.status),
                });
                if (tool.name === "Interactive Terminal") {
                    rows.push({
                        key: `${keyPrefix}-tool-${tool.callId}-${index}-terminal`,
                        text: fitLiveTerminalRow("  Terminal panel updated.", width),
                        color: Colors.Gray,
                    });
                    return;
                }
                if (typeof tool.resultDisplay === "string") {
                    pushLiveTerminalTextRows(rows, `${keyPrefix}-tool-${tool.callId}-${index}-result`, "  ", tool.resultDisplay, width, Colors.Gray, 30);
                }
            });
            break;
        case "compression":
            rows.push({
                key: `${keyPrefix}-compression`,
                text: fitLiveTerminalRow(`${pendingPrefix}compression: ${item.compression.compressionStatus ?? "pending"}`, width),
                color: Colors.Gray,
            });
            break;
        case "summary":
            rows.push({
                key: `${keyPrefix}-summary`,
                text: fitLiveTerminalRow(`${pendingPrefix}summary: ${item.summary.stage}${item.summary.filePath ? ` ${item.summary.filePath}` : ""}`, width),
                color: Colors.Gray,
            });
            break;
        case "stats":
        case "model_stats":
        case "tool_stats":
        case "about":
        case "help":
        case "quit":
        case "quit_confirmation":
        case "view":
            rows.push({
                key: `${keyPrefix}-${item.type}`,
                text: fitLiveTerminalRow(`${pendingPrefix}${item.type}`, width),
                color: Colors.Gray,
            });
            break;
    }
    return rows;
}
function selectLiveTerminalConversationRowsFromSources(historyItems, pendingItems, width, viewportHeight, scrollOffset) {
    const rowsNeeded = Math.max(1, viewportHeight);
    const selectedRowsNewestFirst = [];
    let rowsToSkip = Math.max(0, scrollOffset);
    let hasOlderRows = false;
    const visitItem = (item, isPending) => {
        if (!isPending && item.type === "view") {
            return false;
        }
        const itemRows = buildLiveTerminalConversationItemRows({ item, isPending }, width);
        for (let rowIndex = itemRows.length - 1; rowIndex >= 0; rowIndex--) {
            if (rowsToSkip > 0) {
                rowsToSkip -= 1;
                continue;
            }
            if (selectedRowsNewestFirst.length < rowsNeeded) {
                selectedRowsNewestFirst.push(itemRows[rowIndex]);
                continue;
            }
            hasOlderRows = true;
            return true;
        }
        return false;
    };
    for (let itemIndex = pendingItems.length - 1; itemIndex >= 0; itemIndex--) {
        if (visitItem(pendingItems[itemIndex], true)) {
            return {
                rows: selectedRowsNewestFirst.reverse(),
                hasOlderRows,
                hasNewerRows: scrollOffset > 0,
                requestedScrollOffset: scrollOffset,
            };
        }
    }
    for (let itemIndex = historyItems.length - 1; itemIndex >= 0; itemIndex--) {
        if (visitItem(historyItems[itemIndex], false)) {
            return {
                rows: selectedRowsNewestFirst.reverse(),
                hasOlderRows,
                hasNewerRows: scrollOffset > 0,
                requestedScrollOffset: scrollOffset,
            };
        }
    }
    return {
        rows: selectedRowsNewestFirst.reverse(),
        hasOlderRows,
        hasNewerRows: scrollOffset > 0,
        requestedScrollOffset: scrollOffset,
    };
}
export const AppWrapper = (props) => {
    const kittyProtocolStatus = useKittyKeyboardProtocol();
    const nodeMajorVersion = parseInt(process.versions.node.split(".")[0], 10);
    return (_jsx(KeypressProvider, { kittyProtocolEnabled: kittyProtocolStatus.enabled, pasteWorkaround: process.platform === "win32" || nodeMajorVersion < 20, config: props.config, debugKeystrokeLogging: props.settings.merged.general?.debugKeystrokeLogging, children: _jsx(SessionStatsProvider, { children: _jsx(VimModeProvider, { settings: props.settings, children: _jsx(App, { ...props }) }) }) }));
};
const App = ({ config, settings, startupWarnings = [], version }) => {
    const isFocused = useFocus();
    useBracketedPaste();
    const [updateInfo, setUpdateInfo] = useState(null);
    const { stdout } = useStdout();
    const nightly = version.includes("nightly");
    const { history, addItem, clearItems, loadHistory } = useHistory();
    const [idePromptAnswered, setIdePromptAnswered] = useState(false);
    const currentIDE = config.getIdeClient().getCurrentIde();
    useEffect(() => {
        registerCleanup(() => config.getIdeClient().disconnect());
    }, [config]);
    const shouldShowIdePrompt = currentIDE &&
        !config.getIdeMode() &&
        !settings.merged.ide?.hasSeenNudge &&
        !idePromptAnswered;
    useEffect(() => {
        const cleanup = setUpdateHandler(addItem, setUpdateInfo);
        return cleanup;
    }, [addItem]);
    const { consoleMessages, handleNewMessage, clearConsoleMessages: clearConsoleMessagesState, } = useConsoleMessages();
    useEffect(() => {
        const consolePatcher = new ConsolePatcher({
            onNewMessage: handleNewMessage,
            debugMode: config.getDebugMode(),
        });
        consolePatcher.patch();
        registerCleanup(consolePatcher.cleanup);
    }, [handleNewMessage, config]);
    const { stats: sessionStats } = useSessionStats();
    const sessionLoggingController = useSessionLoggingController({
        history,
        config,
        sessionStats,
    });
    const [staticNeedsRefresh, setStaticNeedsRefresh] = useState(false);
    const [staticKey, setStaticKey] = useState(0);
    const refreshStatic = useCallback(() => {
        stdout.write(ansiEscapes.clearTerminal);
        setStaticKey((prev) => prev + 1);
    }, [setStaticKey, stdout]);
    const [geminiMdFileCount, setGeminiMdFileCount] = useState(0);
    const [debugMessage, setDebugMessage] = useState("");
    const [themeError, setThemeError] = useState(null);
    const [authError, setAuthError] = useState(null);
    const [editorError, setEditorError] = useState(null);
    const [footerHeight, setFooterHeight] = useState(0);
    const [corgiMode, setCorgiMode] = useState(false);
    const [isTrustedFolderState, setIsTrustedFolder] = useState(config.isTrustedFolder());
    const [currentModel, setCurrentModel] = useState(config.getModel());
    /** Human-readable display label for the footer (e.g. short name for llama.cpp paths) */
    const [currentModelLabel, setCurrentModelLabel] = useState();
    const [, setLmStudioModel] = useState(null);
    const lastLmStudioModelFetchRef = useRef(0);
    // bump this to force re-render when model-level context limits change
    const [, setModelLimitVersion] = useState(0);
    // If the user has a saved model in settings, ensure the config and UI
    // reflect it on startup. This will restore the last-used model across
    // restarts.
    useEffect(() => {
        const savedModel = settings.merged.model?.name;
        if (savedModel && savedModel !== config.getModel()) {
            void (async () => {
                try {
                    await config.setModel(savedModel);
                    setCurrentModel(savedModel);
                    if (settings.merged.security?.auth?.providerId === "openrouter") {
                        try {
                            setOpenAIModel(savedModel);
                        }
                        catch (err) {
                            console.warn("Failed to persist OpenRouter model to .env:", err);
                        }
                    }
                }
                catch (e) {
                    console.warn("Failed to restore saved model from settings:", e);
                }
            })();
        }
    }, [
        config,
        settings.merged.model?.name,
        settings.merged.security?.auth?.providerId,
    ]);
    const refreshLmStudioModel = useCallback(async (force = false) => {
        const contentGeneratorConfig = config.getContentGeneratorConfig();
        if (!contentGeneratorConfig) {
            return;
        }
        const baseUrl = contentGeneratorConfig.baseUrl || process.env["OPENAI_BASE_URL"] || "";
        const providerId = settings.merged.security?.auth?.providerId;
        const isLmStudioProvider = providerId === "lmstudio" ||
            baseUrl.includes("127.0.0.1:1234") ||
            baseUrl.includes("localhost:1234");
        if (!isLmStudioProvider || !baseUrl) {
            setLmStudioModel(null);
            lastLmStudioModelFetchRef.current = 0;
            return;
        }
        const now = Date.now();
        if (!force && now - lastLmStudioModelFetchRef.current < 60000) {
            return;
        }
        lastLmStudioModelFetchRef.current = now;
        try {
            const loadedModel = await getLMStudioLoadedModel(baseUrl);
            setLmStudioModel(loadedModel);
        }
        catch (error) {
            if (config.getDebugMode()) {
                console.debug("[LMStudio] Failed to fetch loaded model:", error);
            }
        }
    }, [config, settings.merged.security?.auth?.providerId]);
    useEffect(() => {
        void refreshLmStudioModel(true);
    }, [refreshLmStudioModel]);
    useEffect(() => {
        const activeModel = config.getModel();
        if (!activeModel) {
            return;
        }
        // clear any existing model-specific override immediately; we will set a new one below
        try {
            config.setModelContextLimit(activeModel, undefined);
        }
        catch (e) {
            // ignore
        }
        // If provider is LM Studio/OpenRouter, attempt to fetch REST models to get provider-reported context lengths.
        let cancelled = false;
        (async () => {
            try {
                const providerId = settings.merged.security?.auth?.providerId;
                // If user changed provider recently and it's not LMStudio or OpenRouter,
                // clear overrides and return early.
                if (!providerId) {
                    return;
                }
                // For llama.cpp, read GGUF metadata to get the model's max context length
                if (providerId === "llamacpp") {
                    try {
                        const discoveredModel = allAvailableModels.find((m) => m.id === activeModel);
                        if (!cancelled && discoveredModel?.maxContextLength) {
                            config.setModelContextLimit(activeModel, discoveredModel.maxContextLength);
                            setModelLimitVersion((v) => v + 1);
                        }
                    }
                    catch {
                        // GGUF read failed — leave limit as-is
                    }
                    return;
                }
                // If provider is LM Studio/OpenRouter/OpenAI, try to fetch REST models to obtain context_length
                if (providerId === "openrouter" ||
                    providerId === "lmstudio" ||
                    providerId === "openai") {
                    try {
                        const contentGeneratorConfig = config.getContentGeneratorConfig();
                        const baseUrl = contentGeneratorConfig?.baseUrl ||
                            process.env["OPENAI_BASE_URL"] ||
                            "";
                        const apiKey = contentGeneratorConfig?.apiKey || process.env["OPENAI_API_KEY"];
                        if (baseUrl) {
                            const restModels = await (await import("./models/availableModels.js")).fetchOpenAICompatibleModels(baseUrl, apiKey, {
                                forceLmStudio: providerId === "lmstudio",
                            });
                            const matched = restModels.find((r) => r.id === activeModel || r.label === activeModel);
                            const override = matched?.maxContextLength ??
                                matched?.contextLength ??
                                matched?.maxContextLength;
                            if (!cancelled) {
                                config.setModelContextLimit(activeModel, override);
                                setModelLimitVersion((v) => v + 1);
                            }
                        }
                        else {
                            // If we don't have baseUrl, clear any override
                            if (!cancelled) {
                                config.setModelContextLimit(activeModel, undefined);
                                setModelLimitVersion((v) => v + 1);
                            }
                        }
                    }
                    catch (error) {
                        if (config.getDebugMode())
                            console.debug("Failed to fetch OpenAI-compatible model context length:", error);
                        if (!cancelled) {
                            config.setModelContextLimit(activeModel, undefined);
                            setModelLimitVersion((v) => v + 1);
                        }
                    }
                    return;
                }
                // For other providers, clear any model-level override
                if (!cancelled) {
                    config.setModelContextLimit(activeModel, undefined);
                }
            }
            catch (error) {
                if (config.getDebugMode()) {
                    console.debug("Failed to resolve provider context length:", error);
                }
                if (!cancelled) {
                    config.setModelContextLimit(activeModel, undefined);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [config, currentModel, settings.merged.security?.auth?.providerId]);
    useEffect(() => {
        const providerId = settings.merged.security?.auth?.providerId;
        if (providerId !== "lmstudio") {
            setLmStudioModel(null);
        }
    }, [settings.merged.security?.auth?.providerId]);
    const [shellModeActive, setShellModeActive] = useState(false);
    const [showErrorDetails, setShowErrorDetails] = useState(false);
    const [showToolDescriptions, setShowToolDescriptions] = useState(false);
    const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
    const [quittingMessages, setQuittingMessages] = useState(null);
    const ctrlCTimerRef = useRef(null);
    const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
    const ctrlDTimerRef = useRef(null);
    const [constrainHeight, setConstrainHeight] = useState(true);
    const [showPrivacyNotice, setShowPrivacyNotice] = useState(false);
    const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] = useState(false);
    const [userTier, setUserTier] = useState(undefined);
    const [ideContextState, setIdeContextState] = useState();
    const [showEscapePrompt, setShowEscapePrompt] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const { showWorkspaceMigrationDialog, workspaceExtensions, onWorkspaceMigrationDialogOpen, onWorkspaceMigrationDialogClose, } = useWorkspaceMigration(settings);
    // Model selection dialog states
    const [isModelSelectionDialogOpen, setIsModelSelectionDialogOpen] = useState(false);
    const [availableModelsForDialog, setAvailableModelsForDialog] = useState([]);
    const [allAvailableModels, setAllAvailableModels] = useState([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false);
    const [resumeCheckpoints, setResumeCheckpoints] = useState([]);
    const [isTaskTemplateDialogOpen, setIsTaskTemplateDialogOpen] = useState(false);
    const [isMailboxDialogOpen, setIsMailboxDialogOpen] = useState(false);
    // Compress-model selection dialog states (for picking OpenRouter compression model)
    const [isCompressModelDialogOpen, setIsCompressModelDialogOpen] = useState(false);
    const [compressModelsForDialog, setCompressModelsForDialog] = useState([]);
    // Invalidate cached model lists when auth/provider changes so discovery is
    // re-run for the currently selected provider. This ensures that after the
    // user switches authentication/provider, the model selection dialog will show
    // provider-appropriate models instead of stale cached entries.
    useEffect(() => {
        // Clear cached model lists prepared for the dialog and the global cache.
        setAllAvailableModels([]);
        setAvailableModelsForDialog([]);
        // If the dialog is already open, close it so next open triggers a fresh fetch.
        setIsModelSelectionDialogOpen(false);
        // Note: we intentionally keep this effect minimal — it only clears UI cache
        // state when either the selected authType or providerId changes.
    }, [
        settings.merged.security?.auth?.selectedType,
        settings.merged.security?.auth?.providerId,
    ]);
    const [isVisionSwitchDialogOpen, setIsVisionSwitchDialogOpen] = useState(false);
    const [visionSwitchResolver, setVisionSwitchResolver] = useState(null);
    // llama.cpp server config dialog state
    const [isLlamaCppConfigDialogOpen, setIsLlamaCppConfigDialogOpen] = useState(false);
    const [pendingLlamaCppModel, setPendingLlamaCppModel] = useState(null);
    const [pendingLlamaCppPrevSettings, setPendingLlamaCppPrevSettings] = useState(undefined);
    /** llama.cpp model loading progress for progress bar overlay */
    const [llamaCppLoadingProgress, setLlamaCppLoadingProgress] = useState(null);
    useEffect(() => {
        const unsubscribe = ideContext.subscribeToIdeContext(setIdeContextState);
        // Set the initial value
        setIdeContextState(ideContext.getIdeContext());
        return unsubscribe;
    }, []);
    useEffect(() => {
        const openDebugConsole = () => {
            setShowErrorDetails(true);
            setConstrainHeight(false); // Make sure the user sees the full message.
        };
        appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);
        const logErrorHandler = (errorMessage) => {
            handleNewMessage({
                type: "error",
                content: String(errorMessage),
                count: 1,
            });
        };
        appEvents.on(AppEvent.LogError, logErrorHandler);
        const showInfoHandler = (payload) => {
            try {
                const text = String(payload);
                addItem({ type: MessageType.INFO, text }, Date.now());
            }
            catch (e) {
                // ignore
            }
        };
        appEvents.on(AppEvent.ShowInfo, showInfoHandler);
        return () => {
            appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
            appEvents.off(AppEvent.LogError, logErrorHandler);
            appEvents.off(AppEvent.ShowInfo, showInfoHandler);
        };
    }, [handleNewMessage]);
    const openPrivacyNotice = useCallback(() => {
        setShowPrivacyNotice(true);
    }, []);
    const openTaskTemplateDialog = useCallback(() => {
        setIsTaskTemplateDialogOpen(true);
    }, []);
    const closeTaskTemplateDialog = useCallback(() => {
        setIsTaskTemplateDialogOpen(false);
    }, []);
    const openMailboxDialog = useCallback(() => {
        setIsMailboxDialogOpen(true);
    }, []);
    const closeMailboxDialog = useCallback(() => {
        setIsMailboxDialogOpen(false);
    }, []);
    const handleEscapePromptChange = useCallback((showPrompt) => {
        setShowEscapePrompt(showPrompt);
    }, []);
    const initialPromptSubmitted = useRef(false);
    const errorCount = useMemo(() => consoleMessages
        .filter((msg) => msg.type === "error")
        .reduce((total, msg) => total + msg.count, 0), [consoleMessages]);
    const { isThemeDialogOpen, openThemeDialog, handleThemeSelect, handleThemeHighlight, } = useThemeCommand(settings, setThemeError, addItem);
    const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } = useSettingsCommand();
    const { isFolderTrustDialogOpen, handleFolderTrustSelect, isRestarting } = useFolderTrust(settings, setIsTrustedFolder);
    const { showQuitConfirmation, handleQuitConfirmationSelect } = useQuitConfirmation();
    const { isAuthDialogOpen, openAuthDialog, handleAuthSelect, isAuthenticating, cancelAuthentication, } = useAuthCommand(settings, setAuthError, config);
    const { isQwenAuthenticating, deviceAuth, isQwenAuth, cancelQwenAuth, authStatus, authMessage, } = useQwenAuth(settings, isAuthenticating);
    useEffect(() => {
        if (settings.merged.security?.auth?.selectedType &&
            !settings.merged.security?.auth?.useExternal) {
            const error = validateAuthMethod(settings.merged.security.auth.selectedType);
            if (error) {
                setAuthError(error);
                openAuthDialog();
            }
        }
    }, [
        settings.merged.security?.auth?.selectedType,
        settings.merged.security?.auth?.useExternal,
        openAuthDialog,
        setAuthError,
    ]);
    // Sync user tier from config when authentication changes
    useEffect(() => {
        // Only sync when not currently authenticating
        if (!isAuthenticating) {
            setUserTier(config.getGeminiClient()?.getUserTier());
        }
    }, [config, isAuthenticating]);
    // Handle Qwen OAuth timeout
    useEffect(() => {
        if (isQwenAuth && authStatus === "timeout") {
            setAuthError(authMessage ||
                "Qwen OAuth authentication timed out. Please try again or select a different authentication method.");
            cancelQwenAuth();
            cancelAuthentication();
            openAuthDialog();
        }
    }, [
        isQwenAuth,
        authStatus,
        authMessage,
        cancelQwenAuth,
        cancelAuthentication,
        openAuthDialog,
        setAuthError,
    ]);
    const { isEditorDialogOpen, openEditorDialog, handleEditorSelect, exitEditorDialog, } = useEditorSettings(settings, setEditorError, addItem);
    const toggleCorgiMode = useCallback(() => {
        setCorgiMode((prev) => !prev);
    }, []);
    const toggleYoloMode = useCallback(() => {
        if (!config)
            return;
        const currentMode = config.getApprovalMode();
        const newMode = currentMode === ApprovalMode.YOLO
            ? ApprovalMode.DEFAULT
            : ApprovalMode.YOLO;
        try {
            config.setApprovalMode(newMode);
            addItem({
                type: MessageType.INFO,
                text: `Approval mode set to: ${newMode}`,
            }, Date.now());
        }
        catch (e) {
            addItem({
                type: MessageType.ERROR,
                text: e instanceof Error ? e.message : String(e),
            }, Date.now());
        }
    }, [config, addItem]);
    const performMemoryRefresh = useCallback(async () => {
        addItem({
            type: MessageType.INFO,
            text: "Refreshing hierarchical memory (LOWCAL.md or other context files)...",
        }, Date.now());
        try {
            const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(process.cwd(), settings.merged.context?.loadMemoryFromIncludeDirectories
                ? config.getWorkspaceContext().getDirectories()
                : [], config.getDebugMode(), config.getFileService(), settings.merged, config.getExtensionContextFilePaths(), settings.merged.context?.importFormat || "tree", // Use setting or default to 'tree'
            config.getFileFilteringOptions());
            config.setUserMemory(memoryContent);
            config.setGeminiMdFileCount(fileCount);
            setGeminiMdFileCount(fileCount);
            addItem({
                type: MessageType.INFO,
                text: `Memory refreshed successfully. ${memoryContent.length > 0 ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).` : "No memory content found."}`,
            }, Date.now());
            if (config.getDebugMode()) {
                console.log(`[DEBUG] Refreshed memory content in config: ${memoryContent.substring(0, 200)}...`);
            }
        }
        catch (error) {
            const errorMessage = getErrorMessage(error);
            addItem({
                type: MessageType.ERROR,
                text: `Error refreshing memory: ${errorMessage}`,
            }, Date.now());
            console.error("Error refreshing memory:", error);
        }
    }, [config, addItem, settings.merged]);
    // Watch for model changes (e.g., from Flash fallback)
    useEffect(() => {
        const checkModelChange = () => {
            const configModel = config.getModel();
            if (configModel !== currentModel) {
                setCurrentModel(configModel);
            }
        };
        // Check immediately and then periodically
        checkModelChange();
        const interval = setInterval(checkModelChange, 1000); // Check every second
        return () => clearInterval(interval);
    }, [config, currentModel]);
    // Set up Flash fallback handler
    useEffect(() => {
        const flashFallbackHandler = async (currentModel, fallbackModel, error) => {
            let message;
            if (config.getContentGeneratorConfig().authType ===
                AuthType.LOGIN_WITH_GOOGLE) {
                // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
                const isPaidTier = userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;
                // Check if this is a Pro quota exceeded error
                if (error && isProQuotaExceededError(error)) {
                    if (isPaidTier) {
                        message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
                    }
                    else {
                        message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
                    }
                }
                else if (error && isGenericQuotaExceededError(error)) {
                    if (isPaidTier) {
                        message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
                    }
                    else {
                        message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
                    }
                }
                else {
                    if (isPaidTier) {
                        // Default fallback message for other cases (like consecutive 429s)
                        message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
                    }
                    else {
                        // Default fallback message for other cases (like consecutive 429s)
                        message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
                    }
                }
                // Add message to UI history
                addItem({
                    type: MessageType.INFO,
                    text: message,
                }, Date.now());
                // Set the flag to prevent tool continuation
                setModelSwitchedFromQuotaError(true);
                // Set global quota error flag to prevent Flash model calls
                config.setQuotaErrorOccurred(true);
            }
            // Switch model for future use but return false to stop current retry
            config.setModel(fallbackModel).catch((error) => {
                console.error("Failed to switch to fallback model:", error);
            });
            config.setFallbackMode(true);
            logFlashFallback(config, new FlashFallbackEvent(config.getContentGeneratorConfig().authType));
            return false; // Don't continue with current prompt
        };
        config.setFlashFallbackHandler(flashFallbackHandler);
    }, [config, addItem, userTier]);
    // Terminal and UI setup
    const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
    const mainAreaWidth = Math.floor(terminalWidth * 0.9);
    const isNarrow = isNarrowWidth(terminalWidth);
    const { stdin, setRawMode } = useStdin();
    const isInitialMount = useRef(true);
    const [activeTerminalSnapshot, setActiveTerminalSnapshot] = useState(null);
    const [terminalHistoryScrollOffset, setTerminalHistoryScrollOffset] = useState(0);
    // Scroll offset for the terminal panel's own content (lines within snapshot.screen).
    // 0 means following the bottom; higher values scroll up into history.
    const [terminalPanelScrollOffset, setTerminalPanelScrollOffset] = useState(0);
    const pendingTerminalSnapshotRef = useRef(null);
    const terminalSnapshotFlushTimerRef = useRef(null);
    useEffect(() => {
        const flushPendingSnapshot = () => {
            terminalSnapshotFlushTimerRef.current = null;
            const snapshot = pendingTerminalSnapshotRef.current;
            setActiveTerminalSnapshot(snapshot?.running ? snapshot : null);
        };
        const unsubscribe = terminalSessionService.subscribeToSnapshots((snapshot) => {
            if (!snapshot.running) {
                pendingTerminalSnapshotRef.current = null;
                if (terminalSnapshotFlushTimerRef.current) {
                    clearTimeout(terminalSnapshotFlushTimerRef.current);
                    terminalSnapshotFlushTimerRef.current = null;
                }
                setActiveTerminalSnapshot(null);
                setTerminalPanelScrollOffset(0);
                return;
            }
            pendingTerminalSnapshotRef.current = snapshot;
            if (!terminalSnapshotFlushTimerRef.current) {
                terminalSnapshotFlushTimerRef.current = setTimeout(flushPendingSnapshot, 33);
            }
        });
        return () => {
            unsubscribe();
            if (terminalSnapshotFlushTimerRef.current) {
                clearTimeout(terminalSnapshotFlushTimerRef.current);
                terminalSnapshotFlushTimerRef.current = null;
            }
        };
    }, []);
    const widthFraction = 0.9;
    const inputWidth = Math.max(20, Math.floor(terminalWidth * widthFraction) - 3);
    const suggestionsWidth = Math.max(20, Math.floor(terminalWidth * 0.8));
    // Utility callbacks
    const isValidPath = useCallback((filePath) => {
        try {
            return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
        }
        catch (_e) {
            return false;
        }
    }, []);
    const getPreferredEditor = useCallback(() => {
        const editorType = settings.merged.general?.preferredEditor;
        const isValidEditor = isEditorAvailable(editorType);
        if (!isValidEditor) {
            openEditorDialog();
            return;
        }
        return editorType;
    }, [settings, openEditorDialog]);
    const onAuthError = useCallback(() => {
        setAuthError("reauth required");
        openAuthDialog();
    }, [openAuthDialog, setAuthError]);
    // Vision switch handler for auto-switch functionality
    const handleVisionSwitchRequired = useCallback(async (_query) => new Promise((resolve, reject) => {
        setVisionSwitchResolver({ resolve, reject });
        setIsVisionSwitchDialogOpen(true);
    }), []);
    const handleVisionSwitchSelect = useCallback((outcome) => {
        setIsVisionSwitchDialogOpen(false);
        if (visionSwitchResolver) {
            const result = processVisionSwitchOutcome(outcome);
            visionSwitchResolver.resolve(result);
            setVisionSwitchResolver(null);
        }
    }, [visionSwitchResolver]);
    const handleModelSelectionOpen = useCallback((forceRefresh) => {
        (async () => {
            if (allAvailableModels.length > 0 && !forceRefresh) {
                setAvailableModelsForDialog(allAvailableModels);
                setIsModelSelectionDialogOpen(true);
                return;
            }
            if (isFetchingModels) {
                return;
            }
            setIsFetchingModels(true);
            const contentGeneratorConfig = config.getContentGeneratorConfig();
            if (!contentGeneratorConfig) {
                setAvailableModelsForDialog([]);
                setIsModelSelectionDialogOpen(true);
                setIsFetchingModels(false);
                return;
            }
            let models = [];
            try {
                if (contentGeneratorConfig.authType === AuthType.USE_OPENAI) {
                    const providerId = settings.merged.security?.auth?.providerId;
                    const providerSettings = settings.merged.security?.auth?.providers || {};
                    const provider = providerSettings[providerId];
                    const providerWithKey = provider;
                    const baseUrl = providerWithKey?.baseUrl?.trim() ||
                        contentGeneratorConfig.baseUrl ||
                        process.env["OPENAI_BASE_URL"] ||
                        "";
                    const isLmStudioProvider = providerId === "lmstudio" ||
                        baseUrl.includes("127.0.0.1:1234") ||
                        baseUrl.includes("localhost:1234");
                    const apiKey = providerWithKey?.apiKey?.trim() ||
                        contentGeneratorConfig.apiKey ||
                        process.env["OPENAI_API_KEY"];
                    if (baseUrl) {
                        models = await fetchOpenAICompatibleModels(baseUrl, apiKey, {
                            forceLmStudio: isLmStudioProvider,
                        });
                    }
                    const openAIModel = getOpenAIAvailableModelFromEnv();
                    if (openAIModel &&
                        !isLmStudioProvider &&
                        !models.find((m) => m.id === openAIModel.id)) {
                        models.push(openAIModel);
                    }
                }
                else if (contentGeneratorConfig.authType === AuthType.USE_GEMINI ||
                    contentGeneratorConfig.authType === AuthType.USE_VERTEX_AI) {
                    const apiKey = process.env["GEMINI_API_KEY"]?.trim();
                    const fetched = apiKey ? await fetchGeminiModels(apiKey) : [];
                    models =
                        fetched.length > 0
                            ? fetched
                            : getFilteredGeminiModels(currentModel);
                }
                else if (contentGeneratorConfig.authType === AuthType.USE_LLAMACPP) {
                    // llama.cpp: discover GGUF models from disk
                    const llamacppConfig = settings.merged.security?.auth?.providers;
                    const modelsDir = llamacppConfig?.["llamacpp"]?.modelsDir || process.env["LLAMA_CPP_MODELS_DIR"] || "";
                    if (modelsDir) {
                        models = await import("../ui/models/availableModels.js").then((m) => m.discoverGgufModels(modelsDir));
                    }
                }
                else {
                    models = getFilteredQwenModels(settings.merged.experimental?.visionModelPreview ?? true);
                }
                // Deduplicate models by id to avoid duplicate labels / React key collisions
                const seenIds = new Set();
                models = models.filter((m) => {
                    if (!m || !m.id)
                        return false;
                    if (seenIds.has(m.id))
                        return false;
                    seenIds.add(m.id);
                    return true;
                });
                setAllAvailableModels(models);
                setAvailableModelsForDialog(models);
                setIsModelSelectionDialogOpen(true);
            }
            finally {
                setIsFetchingModels(false);
            }
        })();
    }, [
        allAvailableModels,
        config,
        settings.merged.experimental?.visionModelPreview,
        isFetchingModels,
    ]);
    const handleModelSelectionClose = useCallback(() => {
        setIsModelSelectionDialogOpen(false);
    }, []);
    // llama.cpp per-model config dialog handlers
    const handleLlamaCppConfigSubmit = useCallback(async (modelSettings) => {
        try {
            if (!pendingLlamaCppModel)
                return;
            const modelId = pendingLlamaCppModel;
            // Persist settings for this specific model path
            settings.setValue(SettingScope.User, `llamacpp.model.${modelId}`, JSON.stringify(modelSettings));
            setIsLlamaCppConfigDialogOpen(false);
            setPendingLlamaCppModel(null);
            setPendingLlamaCppPrevSettings(undefined);
            // Show loading progress bar
            setLlamaCppLoadingProgress({ phase: "spawning", elapsedMs: 0, message: "Starting llama-server..." });
            // Restart server with model-specific params and load the model
            const modelsDir = process.env["LLAMA_CPP_MODELS_DIR"];
            if (!modelsDir) {
                setLlamaCppLoadingProgress(null);
                addItem({ type: MessageType.ERROR, text: "llama.cpp models directory not configured." }, Date.now());
                return;
            }
            const port = parseInt(process.env["LLAMA_CPP_PORT"] || "8080", 10);
            const { LlamaCppProcessManager } = await import("@qwen-code/qwen-code-core");
            const manager = LlamaCppProcessManager.instance;
            // Stop existing server if running
            if (await manager.isHealthy()) {
                await manager.stop();
            }
            await manager.start({
                modelsDir,
                port,
                binaryPath: process.env["LLAMA_CPP_BINARY"] || undefined,
                modelPath: modelId,
                nCtx: modelSettings.nCtx,
                nGpuLayers: modelSettings.nGpuLayers,
                kvCacheType: modelSettings.kvCacheType,
                temperature: modelSettings.temperature,
                topP: modelSettings.topP,
                repeatPenalty: modelSettings.repeatPenalty,
            }, (event) => {
                setLlamaCppLoadingProgress(event);
            });
            // Query authoritative runtime model metadata from llama.cpp server
            let modelMaxContext;
            try {
                const resp = await fetch(`http://127.0.0.1:${port}/v1/models`);
                if (resp.ok) {
                    const data = await resp.json();
                    modelMaxContext = data.data?.[0]?.meta?.n_ctx_train;
                }
            }
            catch {
                // Best effort only — fallback to selected runtime context below
            }
            // Set context limit and load the model
            config.setModelContextLimit(modelId, modelMaxContext ?? modelSettings.nCtx);
            await config.setModel(modelId);
            setCurrentModel(modelId);
            // Set display label for the footer — look up from discovered models
            const discoveredModel = allAvailableModels.find((m) => m.id === modelId);
            setCurrentModelLabel(discoveredModel?.label);
            addItem({
                type: MessageType.INFO,
                text: modelMaxContext && modelMaxContext !== modelSettings.nCtx
                    ? `Loaded \`${modelId.split("/").pop()}\` with ${modelSettings.nCtx.toLocaleString()} runtime context (model max: ${modelMaxContext.toLocaleString()}), KV=${modelSettings.kvCacheType}.`
                    : `Loaded \`${modelId.split("/").pop()}\` with ${modelSettings.nCtx.toLocaleString()} context, KV=${modelSettings.kvCacheType}.`,
            }, Date.now());
            // Warm-up query
            try {
                const gemini = config.getGeminiClient();
                if (gemini) {
                    void gemini
                        .generateContent([{ role: "user", parts: [{ text: "Say hello." }] }], {}, new AbortController().signal, modelId)
                        .catch(() => { });
                }
            }
            catch {
                // ignore warm-up errors
            }
            // Clear progress indicator
            setLlamaCppLoadingProgress(null);
        }
        catch (err) {
            console.error(`[llama.cpp] Failed to load model: ${err instanceof Error ? err.message : String(err)}`);
            setLlamaCppLoadingProgress(null);
            addItem({ type: MessageType.ERROR, text: `Failed to load model: ${err instanceof Error ? err.message : String(err)}` }, Date.now());
        }
    }, [settings, pendingLlamaCppModel, config, setCurrentModel, setCurrentModelLabel, addItem, allAvailableModels]);
    const handleLlamaCppConfigCancel = useCallback(() => {
        setIsLlamaCppConfigDialogOpen(false);
        setPendingLlamaCppModel(null);
        setPendingLlamaCppPrevSettings(undefined);
    }, []);
    // Compress-model dialog handlers (for picking OpenRouter compression model)
    const openCompressModelDialog = useCallback(async () => {
        try {
            const auth = settings.merged.security?.auth;
            const providers = auth?.providers || {};
            const openrouter = providers.openrouter;
            const baseUrl = openrouter?.baseUrl?.trim() || process.env["OPENAI_BASE_URL"]?.trim();
            const apiKey = openrouter?.apiKey?.trim() || process.env["OPENAI_API_KEY"];
            if (!baseUrl || !apiKey) {
                addItem({
                    type: MessageType.ERROR,
                    text: "OpenRouter not configured. Set it via /auth → OpenRouter first.",
                }, Date.now());
                return;
            }
            const models = await fetchOpenAICompatibleModels(baseUrl, apiKey, {
                forceLmStudio: false,
            });
            if (models.length === 0) {
                addItem({
                    type: MessageType.ERROR,
                    text: "Could not fetch OpenRouter model list. Check your API key and connection.",
                }, Date.now());
                return;
            }
            setCompressModelsForDialog(models);
            setIsCompressModelDialogOpen(true);
        }
        catch (err) {
            addItem({
                type: MessageType.ERROR,
                text: `Failed to fetch OpenRouter models: ${getErrorMessage(err)}`,
            }, Date.now());
        }
    }, [settings.merged.security?.auth, addItem]);
    const handleCompressModelSelect = useCallback((modelId) => {
        settings.setValue(SettingScope.User, "model.chatCompression.openRouterModel", modelId);
        setIsCompressModelDialogOpen(false);
        addItem({
            type: MessageType.INFO,
            text: `Auto-compression model set to: ${modelId}`,
        }, Date.now());
    }, [settings, addItem]);
    const handleCompressModelClose = useCallback(() => {
        setIsCompressModelDialogOpen(false);
    }, []);
    const closeResumeDialog = useCallback(() => {
        setIsResumeDialogOpen(false);
        setResumeCheckpoints([]);
    }, []);
    const openResumeDialog = useCallback(() => {
        try {
            const checkpointService = new CheckpointService(config);
            const checkpoints = checkpointService.listCheckpoints();
            if (checkpoints.length === 0) {
                addItem({
                    type: MessageType.INFO,
                    text: "No saved conversation checkpoints found.",
                }, Date.now());
                return;
            }
            const checkpointOptions = checkpoints.map((checkpoint) => {
                const lastMessage = checkpoint.messages[checkpoint.messages.length - 1];
                const content = lastMessage?.content ?? "";
                // Strip newlines and collapse whitespace for single-line display
                const cleanedContent = content.replace(/\s+/g, " ").trim();
                const lastMessagePreview = cleanedContent.length > 40
                    ? `${cleanedContent.slice(0, 40)}...`
                    : cleanedContent;
                // Build full content string for search (all messages concatenated)
                const fullContent = checkpoint.messages
                    .map((msg) => msg.content || "")
                    .join(" ")
                    .replace(/\s+/g, " ")
                    .trim();
                return {
                    id: checkpoint.id,
                    createdAt: new Date(checkpoint.createdAt),
                    messageCount: checkpoint.messages.length,
                    sessionId: checkpoint.sessionId,
                    lastMessagePreview: lastMessagePreview || undefined,
                    fullContent,
                };
            });
            setResumeCheckpoints(checkpointOptions);
            setIsResumeDialogOpen(true);
        }
        catch (error) {
            addItem({
                type: MessageType.ERROR,
                text: `Failed to load checkpoints: ${getErrorMessage(error)}`,
            }, Date.now());
        }
    }, [addItem, config]);
    const handleModelSelect = useCallback(async (modelId) => {
        try {
            const selectedModel = allAvailableModels.find((model) => model.id === modelId);
            // For llama.cpp: show per-model config dialog instead of loading immediately
            if (settings.merged.security?.auth?.providerId === "llamacpp") {
                setIsModelSelectionDialogOpen(false);
                setPendingLlamaCppModel(modelId);
                // Load previously saved settings for this model path from user settings file
                try {
                    const userSettings = settings.forScope(SettingScope.User).settings;
                    const rawValue = getNestedProperty(userSettings, `llamacpp.model.${modelId}`);
                    if (rawValue && typeof rawValue === "string") {
                        setPendingLlamaCppPrevSettings(JSON.parse(rawValue));
                    }
                }
                catch { /* no saved settings */ }
                setIsLlamaCppConfigDialogOpen(true);
                return;
            }
            const contextLength = selectedModel?.maxContextLength ?? selectedModel?.contextLength;
            config.setModelContextLimit(modelId, contextLength);
            const contentGeneratorConfig = config.getContentGeneratorConfig();
            const baseUrl = contentGeneratorConfig?.baseUrl || "";
            const providerId = settings.merged.security?.auth?.providerId;
            const isLmStudioProvider = providerId === "lmstudio" ||
                baseUrl.includes("127.0.0.1:1234") ||
                baseUrl.includes("localhost:1234");
            // Unload previous model by setting new model (config.setModel will reinitialize client)
            await config.setModel(modelId);
            setCurrentModel(modelId);
            // Set display label for the footer
            setCurrentModelLabel(selectedModel?.label);
            if (settings.merged.security?.auth?.providerId === "openrouter" ||
                settings.merged.security?.auth?.providerId === "openai") {
                try {
                    setOpenAIModel(modelId);
                }
                catch (err) {
                    console.warn("Failed to persist OpenAI-compatible model to .env:", err);
                }
                // Attempt to fetch REST models immediately to pick up provider-reported context_length
                try {
                    const contentGeneratorConfig = config.getContentGeneratorConfig();
                    const baseUrl = contentGeneratorConfig?.baseUrl ||
                        process.env["OPENAI_BASE_URL"] ||
                        "";
                    const apiKey = contentGeneratorConfig?.apiKey || process.env["OPENAI_API_KEY"];
                    if (baseUrl) {
                        const restModels = await (await import("./models/availableModels.js")).fetchOpenAICompatibleModels(baseUrl, apiKey, {
                            forceLmStudio: providerId === "lmstudio",
                        });
                        const matched = restModels.find((r) => r.id === modelId || r.label === modelId);
                        const ctx = matched?.contextLength ??
                            matched?.maxContextLength ??
                            undefined;
                        config.setModelContextLimit(modelId, ctx);
                        // notify UI to re-read model-level limits (forces re-render)
                        try {
                            // bump version so Footer/ContextUsageDisplay can pick up new limit via config.getModelContextLimit
                            setModelLimitVersion((v) => v + 1);
                        }
                        catch (e) {
                            // ignore
                        }
                    }
                }
                catch (e) {
                    if (config.getDebugMode())
                        console.debug("Failed to fetch OpenAI-compatible models for immediate context length update:", e);
                }
            }
            // Persist selected model to user settings so it is restored on next startup.
            try {
                settings.setValue(SettingScope.User, "model.name", modelId);
            }
            catch (e) {
                console.warn("Failed to persist selected model to settings:", e);
            }
            setIsModelSelectionDialogOpen(false);
            addItem({
                type: MessageType.INFO,
                text: `Switched model to \`${modelId}\` for this session.`,
            }, Date.now());
            // Send a small warm-up query to prime models (LM Studio loads on demand).
            if (!isLmStudioProvider) {
                try {
                    const gemini = config.getGeminiClient();
                    if (gemini) {
                        void gemini
                            .generateContent([{ role: "user", parts: [{ text: "Say hello." }] }], {}, new AbortController().signal, modelId)
                            .catch(() => { });
                    }
                }
                catch (e) {
                    // ignore warm-up errors
                }
            }
            if (isLmStudioProvider) {
                try {
                    const contentGeneratorConfig = config.getContentGeneratorConfig();
                    const baseUrl = contentGeneratorConfig?.baseUrl ||
                        process.env["OPENAI_BASE_URL"] ||
                        "";
                    const apiKey = contentGeneratorConfig?.apiKey || process.env["OPENAI_API_KEY"];
                    if (baseUrl) {
                        const warmupUrl = baseUrl.endsWith("/v1")
                            ? `${baseUrl}/chat/completions`
                            : `${baseUrl.replace(/\/*$/, "")}/v1/chat/completions`;
                        const headers = {
                            "Content-Type": "application/json",
                        };
                        if (apiKey) {
                            headers["Authorization"] = `Bearer ${apiKey}`;
                        }
                        void fetch(warmupUrl, {
                            method: "POST",
                            headers,
                            body: JSON.stringify({
                                model: modelId,
                                messages: [{ role: "user", content: "Say hello." }],
                                max_tokens: 1,
                                temperature: 0,
                                stream: false,
                            }),
                        }).catch(() => { });
                    }
                }
                catch (e) {
                    // ignore LM Studio warm-up errors
                }
            }
            if (isLmStudioProvider) {
                await refreshLmStudioModel(true);
            }
        }
        catch (error) {
            console.error("Failed to switch model:", error);
            addItem({
                type: MessageType.ERROR,
                text: `Failed to switch to model \`${modelId}\`. Please try again.`,
            }, Date.now());
        }
    }, [
        allAvailableModels,
        config,
        setCurrentModel,
        addItem,
        settings.merged.security?.auth?.providerId,
        refreshLmStudioModel,
    ]);
    // available models for dialog are populated via handleModelSelectionOpen
    // Core hooks and processors
    const { vimEnabled: vimModeEnabled, vimMode, toggleVimEnabled, } = useVimMode();
    const { handleSlashCommand, slashCommands, pendingHistoryItems: pendingSlashCommandHistoryItems, commandContext, shellConfirmationRequest, confirmationRequest, quitConfirmationRequest, } = useSlashCommandProcessor(config, settings, addItem, clearItems, loadHistory, history, refreshStatic, setDebugMessage, openThemeDialog, openAuthDialog, openEditorDialog, openTaskTemplateDialog, toggleCorgiMode, setQuittingMessages, openPrivacyNotice, openSettingsDialog, handleModelSelectionOpen, openResumeDialog, toggleVimEnabled, setIsProcessing, setGeminiMdFileCount, showQuitConfirmation, sessionLoggingController, openMailboxDialog, openCompressModelDialog, () => setIsLlamaCppConfigDialogOpen(true));
    const handleResumeCheckpointSelect = useCallback((checkpointId) => {
        closeResumeDialog();
        void handleSlashCommand(`/resume ${checkpointId}`);
    }, [closeResumeDialog, handleSlashCommand]);
    const submitQueryForDeployRef = useRef(async () => { });
    const handleTaskTemplateDeploy = useCallback(async (request) => {
        const templateId = request.templateId.trim();
        if (!templateId) {
            addItem({
                type: MessageType.ERROR,
                text: "Cannot deploy task template: missing template id.",
            }, Date.now());
            return;
        }
        const levelArg = request.templateLevel
            ? ` --level ${request.templateLevel}`
            : "";
        if (request.deployMode === "schedule") {
            const schedule = request.schedule?.trim();
            if (!schedule) {
                addItem({
                    type: MessageType.ERROR,
                    text: "Cannot schedule task template: missing cron expression.",
                }, Date.now());
                return;
            }
            const escapedSchedule = schedule.replace(/"/g, '\\"');
            const trimmedJobId = request.jobId?.trim();
            const jobArg = trimmedJobId
                ? ` --id "${trimmedJobId.replace(/"/g, '\\"')}"`
                : "";
            await submitQueryForDeployRef.current(`/tasks schedule ${templateId} "${escapedSchedule}"${jobArg}${levelArg}`);
            if (request.scheduleStartMode === "run_immediately") {
                await submitQueryForDeployRef.current(`/tasks run ${templateId}${levelArg}`);
            }
        }
        else {
            await submitQueryForDeployRef.current(`/tasks run ${templateId}${levelArg}`);
        }
        setIsTaskTemplateDialogOpen(false);
    }, [addItem]);
    const handleMailboxPayloadUse = useCallback(async (payload) => {
        const text = payload.trim();
        if (!text) {
            return;
        }
        setIsMailboxDialogOpen(false);
        addItem({
            type: "gemini_content",
            text,
        }, Date.now());
        try {
            await config.getGeminiClient()?.addHistory({
                role: "user",
                parts: [{ text }],
            });
        }
        catch (error) {
            addItem({
                type: MessageType.ERROR,
                text: `Failed to add mailbox payload to model history: ${error instanceof Error ? error.message : String(error)}`,
            }, Date.now());
        }
    }, [addItem, config]);
    const buffer = useTextBuffer({
        initialText: "",
        viewport: { height: 10, width: inputWidth },
        stdin,
        setRawMode,
        isValidPath,
        shellModeActive,
    });
    const [userMessages, setUserMessages] = useState([]);
    // Stable reference for cancel handler to avoid circular dependency
    const cancelHandlerRef = useRef(() => { });
    const { streamingState, submitQuery, initError, pendingHistoryItems: pendingGeminiHistoryItems, thought, cancelOngoingRequest, } = useGeminiStream(config.getGeminiClient(), history, addItem, config, setDebugMessage, handleSlashCommand, shellModeActive, getPreferredEditor, onAuthError, performMemoryRefresh, modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError, refreshStatic, () => cancelHandlerRef.current(), settings.merged.experimental?.visionModelPreview ?? true, handleVisionSwitchRequired, refreshLmStudioModel);
    submitQueryForDeployRef.current = async (query) => {
        await submitQuery(query);
    };
    const pendingHistoryItems = useMemo(() => [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems].map((item, index) => ({
        ...item,
        id: index,
    })), [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems]);
    // Welcome back functionality
    const { welcomeBackInfo, showWelcomeBackDialog, welcomeBackChoice, handleWelcomeBackSelection, handleWelcomeBackClose, } = useWelcomeBack(config, submitQuery, buffer, settings.merged);
    // Startup status display
    useStartupStatus({ addItem });
    // Dialog close functionality
    const { closeAnyOpenDialog } = useDialogClose({
        isThemeDialogOpen,
        handleThemeSelect,
        isAuthDialogOpen,
        handleAuthSelect,
        selectedAuthType: settings.merged.security?.auth?.selectedType,
        isEditorDialogOpen,
        exitEditorDialog,
        isTaskTemplateDialogOpen,
        closeTaskTemplateDialog,
        isMailboxDialogOpen,
        closeMailboxDialog,
        isSettingsDialogOpen,
        closeSettingsDialog,
        isResumeDialogOpen,
        closeResumeDialog,
        isFolderTrustDialogOpen,
        showPrivacyNotice,
        setShowPrivacyNotice,
        showWelcomeBackDialog,
        handleWelcomeBackClose,
        quitConfirmationRequest,
    });
    // Message queue for handling input during streaming
    const { messageQueue, addMessage, clearQueue, getQueuedMessagesText } = useMessageQueue({
        streamingState,
        submitQuery,
    });
    // Update the cancel handler with message queue support
    cancelHandlerRef.current = useCallback(() => {
        if (isToolExecuting(pendingHistoryItems)) {
            buffer.setText(""); // Just clear the prompt
            return;
        }
        const lastUserMessage = userMessages.at(-1);
        let textToSet = lastUserMessage || "";
        // Append queued messages if any exist
        const queuedText = getQueuedMessagesText();
        if (queuedText) {
            textToSet = textToSet ? `${textToSet}\n\n${queuedText}` : queuedText;
            clearQueue();
        }
        if (textToSet) {
            buffer.setText(textToSet);
        }
    }, [
        buffer,
        userMessages,
        getQueuedMessagesText,
        clearQueue,
        pendingHistoryItems,
    ]);
    // Input handling - queue messages for processing
    const handleFinalSubmit = useCallback((submittedValue) => {
        addMessage(submittedValue);
    }, [addMessage]);
    const handleIdePromptComplete = useCallback((result) => {
        if (result.userSelection === "yes") {
            if (result.isExtensionPreInstalled) {
                handleSlashCommand("/ide enable");
            }
            else {
                handleSlashCommand("/ide install");
            }
            settings.setValue(SettingScope.User, "hasSeenIdeIntegrationNudge", true);
        }
        else if (result.userSelection === "dismiss") {
            settings.setValue(SettingScope.User, "hasSeenIdeIntegrationNudge", true);
        }
        setIdePromptAnswered(true);
    }, [handleSlashCommand, settings]);
    const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);
    const { elapsedTime, currentLoadingPhrase } = useLoadingIndicator(streamingState);
    const showAutoAcceptIndicator = useAutoAcceptIndicator({ config, addItem });
    const handleExit = useCallback((pressedOnce, setPressedOnce, timerRef) => {
        // Fast double-press: Direct quit (preserve user habit)
        if (pressedOnce) {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            // Exit directly without showing confirmation dialog
            handleSlashCommand("/quit");
            return;
        }
        // First press: Prioritize cleanup tasks
        // Special case: If quit-confirm dialog is open, Ctrl+C means "quit immediately"
        if (quitConfirmationRequest) {
            handleSlashCommand("/quit");
            return;
        }
        // 1. Close other dialogs (highest priority)
        if (closeAnyOpenDialog()) {
            return; // Dialog closed, end processing
        }
        // 2. Cancel ongoing requests
        if (streamingState === StreamingState.Responding) {
            cancelOngoingRequest?.();
            return; // Request cancelled, end processing
        }
        // 3. Clear input buffer (if has content)
        if (buffer.text.length > 0) {
            buffer.setText("");
            return; // Input cleared, end processing
        }
        // All cleanup tasks completed, show quit confirmation dialog
        handleSlashCommand("/quit-confirm");
    }, [
        handleSlashCommand,
        quitConfirmationRequest,
        closeAnyOpenDialog,
        streamingState,
        cancelOngoingRequest,
        buffer,
    ]);
    const handleGlobalKeypress = useCallback((key) => {
        // Debug log keystrokes if enabled
        if (settings.merged.general?.debugKeystrokeLogging) {
            console.log("[DEBUG] Keystroke:", JSON.stringify(key));
        }
        let enteringConstrainHeightMode = false;
        if (!constrainHeight) {
            enteringConstrainHeightMode = true;
            setConstrainHeight(true);
        }
        // --- Terminal panel scrolling (Ctrl+U / Ctrl+D) ---
        // Dedicated keys so Up/Down are always free for prompt history navigation.
        if (activeTerminalSnapshot !== null && key.ctrl && key.name === "u") {
            const termBodyH = Math.max(1, liveTerminalPanelHeight - HEADER_ROWS);
            const totalTermLines = activeTerminalSnapshot.screen
                ? activeTerminalSnapshot.screen.split("\n").length
                : 1;
            const maxTermScroll = Math.max(0, totalTermLines - termBodyH);
            setTerminalPanelScrollOffset((o) => Math.min(o + Math.floor(termBodyH / 2), maxTermScroll));
            return;
        }
        if (activeTerminalSnapshot !== null && key.ctrl && key.name === "d") {
            setTerminalPanelScrollOffset((o) => Math.max(0, o - Math.floor(liveTerminalPanelHeight / 2)));
            return;
        }
        // --- Conversation history scrolling (PageUp / PageDown) ---
        if (activeTerminalSnapshot !== null && key.name === "pageup") {
            setTerminalHistoryScrollOffset((offset) => offset + 5);
            return;
        }
        if (activeTerminalSnapshot !== null && key.name === "pagedown") {
            setTerminalHistoryScrollOffset((offset) => Math.max(0, offset - 5));
            return;
        }
        // --- End: snap both terminal and conversation to follow mode ---
        if (activeTerminalSnapshot !== null && key.name === "end") {
            setTerminalPanelScrollOffset(0);
            setTerminalHistoryScrollOffset(0);
            return;
        }
        // Up/Down are NOT intercepted here — they always pass through for prompt history navigation.
        if (keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
            setShowErrorDetails((prev) => !prev);
        }
        else if (keyMatchers[Command.TOGGLE_TOOL_DESCRIPTIONS](key)) {
            const newValue = !showToolDescriptions;
            setShowToolDescriptions(newValue);
            const mcpServers = config.getMcpServers();
            if (Object.keys(mcpServers || {}).length > 0) {
                handleSlashCommand(newValue ? "/mcp desc" : "/mcp nodesc");
            }
        }
        else if (keyMatchers[Command.TOGGLE_IDE_CONTEXT_DETAIL](key) &&
            config.getIdeMode() &&
            ideContextState) {
            // Show IDE status when in IDE mode and context is available.
            handleSlashCommand("/ide status");
        }
        else if (keyMatchers[Command.TOGGLE_YOLO_MODE](key)) {
            toggleYoloMode();
        }
        else if (keyMatchers[Command.QUIT](key)) {
            // When authenticating, let AuthInProgress component handle Ctrl+C.
            if (isAuthenticating) {
                return;
            }
            handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
        }
        else if (keyMatchers[Command.EXIT](key)) {
            if (buffer.text.length > 0) {
                return;
            }
            handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
        }
        else if (keyMatchers[Command.SHOW_MORE_LINES](key) &&
            !enteringConstrainHeightMode) {
            setConstrainHeight(false);
        }
    }, [
        constrainHeight,
        setConstrainHeight,
        setShowErrorDetails,
        showToolDescriptions,
        setShowToolDescriptions,
        config,
        ideContextState,
        handleExit,
        ctrlCPressedOnce,
        setCtrlCPressedOnce,
        ctrlCTimerRef,
        buffer.text.length,
        ctrlDPressedOnce,
        setCtrlDPressedOnce,
        ctrlDTimerRef,
        handleSlashCommand,
        isAuthenticating,
        settings.merged.general?.debugKeystrokeLogging,
        activeTerminalSnapshot,
    ]);
    useKeypress(handleGlobalKeypress, {
        isActive: true,
    });
    useEffect(() => {
        if (config) {
            setGeminiMdFileCount(config.getGeminiMdFileCount());
        }
    }, [config, config.getGeminiMdFileCount]);
    const logger = useLogger(config.storage);
    useEffect(() => {
        const fetchUserMessages = async () => {
            const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || []; // Newest first
            const currentSessionUserMessages = [];
            for (let index = history.length - 1; index >= 0; index--) {
                const item = history[index];
                if (item.type === "user" &&
                    typeof item.text === "string" &&
                    item.text.trim() !== "") {
                    currentSessionUserMessages.push(item.text);
                }
            }
            // Combine, with current session messages being more recent
            const combinedMessages = [
                ...currentSessionUserMessages,
                ...pastMessagesRaw,
            ];
            // Deduplicate consecutive identical messages from the combined list (still newest first)
            const deduplicatedMessages = [];
            if (combinedMessages.length > 0) {
                deduplicatedMessages.push(combinedMessages[0]); // Add the newest one unconditionally
                for (let i = 1; i < combinedMessages.length; i++) {
                    if (combinedMessages[i] !== combinedMessages[i - 1]) {
                        deduplicatedMessages.push(combinedMessages[i]);
                    }
                }
            }
            // Reverse to oldest first for useInputHistory
            setUserMessages(deduplicatedMessages.reverse());
        };
        fetchUserMessages();
    }, [history, logger]);
    const isInputActive = (streamingState === StreamingState.Idle ||
        streamingState === StreamingState.Responding) &&
        !initError &&
        !isProcessing &&
        !showWelcomeBackDialog &&
        !isAuthDialogOpen &&
        !isThemeDialogOpen &&
        !isEditorDialogOpen &&
        !isSettingsDialogOpen &&
        !isTaskTemplateDialogOpen &&
        !isMailboxDialogOpen &&
        !isModelSelectionDialogOpen &&
        !isCompressModelDialogOpen &&
        !isResumeDialogOpen &&
        !isVisionSwitchDialogOpen &&
        !isLlamaCppConfigDialogOpen &&
        !showPrivacyNotice &&
        true; // activeViewId declaration moved earlier to avoid TDZ
    const handleClearScreen = useCallback(() => {
        clearItems();
        clearConsoleMessagesState();
        console.clear();
        refreshStatic();
    }, [clearItems, clearConsoleMessagesState, refreshStatic]);
    useEffect(() => {
        if (history.length === 0) {
            setActiveViewId(null);
            setViewScrollOffset(0);
            lastSeenViewIdRef.current = null;
            return;
        }
        let latestViewItem;
        for (let index = history.length - 1; index >= 0; index--) {
            const item = history[index];
            if (item.type === "view") {
                latestViewItem = item;
                break;
            }
        }
        if (latestViewItem) {
            // Only auto-open the viewer if this is a newly added view item we haven't seen yet.
            if (lastSeenViewIdRef.current !== latestViewItem.id) {
                setActiveViewId(latestViewItem.id);
                lastSeenViewIdRef.current = latestViewItem.id;
            }
            setViewScrollOffset(0);
            setAvailableViewHeight(Math.max(10, terminalHeight - footerHeight - 6));
        }
        else {
            setActiveViewId(null);
            setViewScrollOffset(0);
            setAvailableViewHeight(0);
            lastSeenViewIdRef.current = null;
        }
    }, [history, terminalHeight, footerHeight]);
    const mainControlsRef = useRef(null);
    const pendingHistoryItemRef = useRef(null);
    useEffect(() => {
        if (mainControlsRef.current) {
            const fullFooterMeasurement = measureElement(mainControlsRef.current);
            setFooterHeight(fullFooterMeasurement.height);
        }
    }, [terminalHeight, consoleMessages, showErrorDetails]);
    const staticExtraHeight = /* margins and padding */ 3;
    const liveTerminalRenderSafetyRows = 6;
    // Fixed-height terminal panel: exactly ~50% of available screen height.
    // Deterministic based only on terminal dimensions — never depends on snapshot.rows.
    const LIVE_TERMINAL_MIN_HEIGHT = 10;
    const liveTerminalPanelHeight = activeTerminalSnapshot
        ? Math.max(LIVE_TERMINAL_MIN_HEIGHT, Math.min(Math.floor((terminalHeight - footerHeight) * 0.5), terminalHeight - footerHeight - liveTerminalRenderSafetyRows))
        : 0;
    const isLiveTerminalPanelVisible = activeTerminalSnapshot !== null && liveTerminalPanelHeight >= 6;
    const availableTerminalHeight = useMemo(() => terminalHeight -
        footerHeight -
        staticExtraHeight -
        liveTerminalRenderSafetyRows -
        liveTerminalPanelHeight, [
        terminalHeight,
        footerHeight,
        liveTerminalRenderSafetyRows,
        liveTerminalPanelHeight,
    ]);
    const liveTerminalConversationHeight = Math.max(1, availableTerminalHeight);
    const liveTerminalConversationStatusHeight = 1;
    const liveTerminalConversationBodyHeight = Math.max(1, liveTerminalConversationHeight - liveTerminalConversationStatusHeight);
    const liveTerminalConversationSelection = useMemo(() => {
        if (!isLiveTerminalPanelVisible) {
            return {
                rows: [],
                hasOlderRows: false,
                hasNewerRows: false,
                requestedScrollOffset: 0,
            };
        }
        return selectLiveTerminalConversationRowsFromSources(history, pendingHistoryItems, mainAreaWidth, liveTerminalConversationBodyHeight, terminalHistoryScrollOffset);
    }, [
        history,
        isLiveTerminalPanelVisible,
        liveTerminalConversationBodyHeight,
        mainAreaWidth,
        pendingHistoryItems,
        terminalHistoryScrollOffset,
    ]);
    const previousLiveTerminalVisibleRef = useRef(isLiveTerminalPanelVisible);
    useEffect(() => {
        if (previousLiveTerminalVisibleRef.current !== isLiveTerminalPanelVisible) {
            previousLiveTerminalVisibleRef.current = isLiveTerminalPanelVisible;
            setTerminalHistoryScrollOffset(0);
            setTerminalPanelScrollOffset(0);
            // When terminal opens, fully clear stdout to wipe any residual Static output
            // that would push the live region down. refreshStatic() then rebuilds cleanly.
            if (isLiveTerminalPanelVisible) {
                stdout.write(ansiEscapes.clearTerminal);
            }
            refreshStatic();
        }
    }, [isLiveTerminalPanelVisible, refreshStatic, stdout]);
    useEffect(() => {
        if (terminalHistoryScrollOffset > 0 &&
            liveTerminalConversationSelection.rows.length === 0) {
            setTerminalHistoryScrollOffset((offset) => Math.max(0, offset - 10));
        }
    }, [
        liveTerminalConversationSelection.rows.length,
        terminalHistoryScrollOffset,
    ]);
    // Modal view state must be declared before isInputActive which depends on it
    const [activeViewId, setActiveViewId] = useState(null);
    const [viewScrollOffset, setViewScrollOffset] = useState(0);
    const [availableViewHeight, setAvailableViewHeight] = useState(0);
    // Track the last-seen view item id so we only auto-open the viewer when a new view is added.
    // This prevents re-opening a previously-closed viewer when unrelated history updates occur.
    const lastSeenViewIdRef = useRef(null);
    // skip refreshing Static during first mount (moved here so activeViewId is declared first)
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (isLiveTerminalPanelVisible) {
            return;
        }
        // debounce so it doesn't fire up too often during resize
        const handler = setTimeout(() => {
            setStaticNeedsRefresh(false);
            refreshStatic();
        }, 300);
        return () => {
            clearTimeout(handler);
        };
    }, [
        terminalWidth,
        terminalHeight,
        refreshStatic,
        isLiveTerminalPanelVisible,
    ]);
    useEffect(() => {
        if (streamingState === StreamingState.Idle && staticNeedsRefresh) {
            setStaticNeedsRefresh(false);
            refreshStatic();
        }
    }, [streamingState, refreshStatic, staticNeedsRefresh]);
    const filteredConsoleMessages = useMemo(() => {
        if (config.getDebugMode()) {
            return consoleMessages;
        }
        return consoleMessages.filter((msg) => msg.type !== "debug");
    }, [consoleMessages, config]);
    const branchName = useGitBranchName(config.getTargetDir());
    const contextFileNames = useMemo(() => {
        const fromSettings = settings.merged.context?.fileName;
        if (fromSettings) {
            return Array.isArray(fromSettings) ? fromSettings : [fromSettings];
        }
        return getAllGeminiMdFilenames();
    }, [settings.merged.context?.fileName]);
    const initialPrompt = useMemo(() => config.getQuestion(), [config]);
    const geminiClient = config.getGeminiClient();
    useEffect(() => {
        const isSlashInitialPrompt = typeof initialPrompt === "string" && initialPrompt.trim().startsWith("/");
        const slashCommandsReady = slashCommands.length > 0;
        if (initialPrompt &&
            !initialPromptSubmitted.current &&
            !isAuthenticating &&
            !isAuthDialogOpen &&
            !isThemeDialogOpen &&
            !isEditorDialogOpen &&
            !isTaskTemplateDialogOpen &&
            !isMailboxDialogOpen &&
            !isModelSelectionDialogOpen &&
            !isResumeDialogOpen &&
            !isVisionSwitchDialogOpen &&
            !showPrivacyNotice &&
            !showWelcomeBackDialog &&
            welcomeBackChoice !== "restart" &&
            geminiClient?.isInitialized?.() &&
            (!isSlashInitialPrompt || slashCommandsReady)) {
            submitQuery(initialPrompt);
            initialPromptSubmitted.current = true;
        }
    }, [
        initialPrompt,
        submitQuery,
        isAuthenticating,
        isAuthDialogOpen,
        isThemeDialogOpen,
        isEditorDialogOpen,
        isTaskTemplateDialogOpen,
        isMailboxDialogOpen,
        showPrivacyNotice,
        showWelcomeBackDialog,
        welcomeBackChoice,
        geminiClient,
        isModelSelectionDialogOpen,
        isResumeDialogOpen,
        isVisionSwitchDialogOpen,
        slashCommands,
    ]);
    if (quittingMessages) {
        return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: quittingMessages.map((item) => (_jsx(HistoryItemDisplay, { availableTerminalHeight: constrainHeight ? availableTerminalHeight : undefined, terminalWidth: terminalWidth, item: item, isPending: false, config: config }, item.id))) }));
    }
    const debugConsoleMaxHeight = Math.floor(Math.max(terminalHeight * 0.2, 5));
    // Arbitrary threshold to ensure that items in the static area are large
    // enough but not too large to make the terminal hard to use.
    const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);
    const placeholder = vimModeEnabled
        ? "  Press 'i' for INSERT mode and 'Esc' for NORMAL mode."
        : "  Type your message or @path/to/file";
    return (_jsx(StreamingContext.Provider, { value: streamingState, children: _jsxs(Box, { flexDirection: "column", width: "90%", children: [isLiveTerminalPanelVisible && (_jsx(LiveTerminalPanel, { snapshot: activeTerminalSnapshot, height: liveTerminalPanelHeight, width: mainAreaWidth, scrollOffset: terminalPanelScrollOffset })), !isLiveTerminalPanelVisible && (
                /*
                 * The Static component is an Ink intrinsic in which there can only be 1 per application.
                 * We must not use it while the live terminal panel is visible: Static always prints above
                 * Ink's live region, which prevents a fixed top panel.
                 */
                _jsx(Static, { items: [
                        _jsxs(Box, { flexDirection: "column", children: [!(settings.merged.ui?.hideBanner || config.getScreenReader()) && _jsx(Header, { version: version, nightly: nightly }), !(settings.merged.ui?.hideTips || config.getScreenReader()) && _jsx(Tips, { config: config })] }, "header"),
                        ...history
                            .filter((h) => h.type !== "view")
                            .map((h) => (_jsx(HistoryItemDisplay, { terminalWidth: mainAreaWidth, availableTerminalHeight: staticAreaMaxItemHeight, item: h, isPending: false, config: config, commands: slashCommands }, h.id))),
                    ], children: (item) => item }, staticKey)), isLiveTerminalPanelVisible && (_jsxs(Box, { flexDirection: "column", height: liveTerminalConversationHeight, overflow: "hidden", children: [_jsx(Box, { flexShrink: 0, children: _jsx(Text, { color: Colors.Gray, children: terminalHistoryScrollOffset > 0 || terminalPanelScrollOffset > 0
                                    ? `Scrolled: terminal ↑${terminalPanelScrollOffset}, conversation ↑${terminalHistoryScrollOffset}. Ctrl+U/D=term scroll, PgUp/PgDn=conv scroll, End=follow.`
                                    : liveTerminalConversationSelection.hasOlderRows
                                        ? "Following latest. Ctrl+U/Ctrl+D = scroll terminal, PgUp/PgDn = scroll conversation."
                                        : "Following latest." }) }), liveTerminalConversationSelection.rows.map((row) => (_jsx(Box, { flexShrink: 0, width: mainAreaWidth, children: _jsx(Text, { color: row.color, dimColor: row.dimColor, children: row.text }) }, row.key)))] })), !isLiveTerminalPanelVisible && (_jsx(OverflowProvider, { children: _jsxs(Box, { ref: pendingHistoryItemRef, flexDirection: "column", children: [pendingHistoryItems.map((item) => (_jsx(HistoryItemDisplay, { availableTerminalHeight: constrainHeight ? availableTerminalHeight : undefined, terminalWidth: mainAreaWidth, item: item, isPending: true, config: config, isFocused: !isEditorDialogOpen &&
                                    !isTaskTemplateDialogOpen &&
                                    !isMailboxDialogOpen, viewControls: item.type === "view"
                                    ? {
                                        isActive: activeViewId === item.id,
                                        scrollOffset: viewScrollOffset,
                                        maxHeight: Math.min(constrainHeight
                                            ? (availableTerminalHeight ?? 20)
                                            : 20, 20),
                                        onScroll: (direction) => {
                                            setViewScrollOffset((prev) => direction === "up"
                                                ? Math.max(0, prev - 1)
                                                : prev + 1);
                                        },
                                        onExit: () => {
                                            setActiveViewId(null);
                                        },
                                    }
                                    : undefined }, item.id))), _jsx(ShowMoreLines, { constrainHeight: constrainHeight })] }) })), _jsxs(Box, { flexDirection: "column", ref: mainControlsRef, children: [activeViewId !== null &&
                            (() => {
                                const viewItem = history.find((h) => h.id === activeViewId && h.type === "view");
                                if (!viewItem || viewItem.type !== "view")
                                    return null;
                                if (!viewItem)
                                    return null;
                                return (_jsx(ViewOverlay, { item: viewItem, height: availableViewHeight ||
                                        Math.max(10, terminalHeight - footerHeight - 6), width: Math.floor(terminalWidth * 0.9), scrollOffset: viewScrollOffset, onScroll: (dir) => setViewScrollOffset((prev) => dir === "up" ? Math.max(0, prev - 3) : prev + 3), onExit: () => setActiveViewId(null) }));
                            })(), updateInfo && _jsx(UpdateNotification, { message: updateInfo.message }), startupWarnings.length > 0 && (_jsx(Box, { borderStyle: "round", borderColor: Colors.AccentYellow, paddingX: 1, marginY: 1, flexDirection: "column", children: startupWarnings.map((warning, index) => (_jsx(Text, { color: Colors.AccentYellow, children: warning }, index))) })), showWelcomeBackDialog && welcomeBackInfo?.hasHistory && (_jsx(WelcomeBackDialog, { welcomeBackInfo: welcomeBackInfo, onSelect: handleWelcomeBackSelection, onClose: handleWelcomeBackClose })), showWorkspaceMigrationDialog ? (_jsx(WorkspaceMigrationDialog, { workspaceExtensions: workspaceExtensions, onOpen: onWorkspaceMigrationDialogOpen, onClose: onWorkspaceMigrationDialogClose })) : shouldShowIdePrompt && currentIDE ? (_jsx(IdeIntegrationNudge, { ide: currentIDE, onComplete: handleIdePromptComplete })) : isFolderTrustDialogOpen ? (_jsx(FolderTrustDialog, { onSelect: handleFolderTrustSelect, isRestarting: isRestarting })) : quitConfirmationRequest ? (_jsx(QuitConfirmationDialog, { onSelect: (choice) => {
                                const result = handleQuitConfirmationSelect(choice);
                                if (result?.shouldQuit) {
                                    quitConfirmationRequest.onConfirm(true, result.action);
                                }
                                else {
                                    quitConfirmationRequest.onConfirm(false);
                                }
                            } })) : shellConfirmationRequest ? (_jsx(ShellConfirmationDialog, { request: shellConfirmationRequest })) : confirmationRequest ? (_jsxs(Box, { flexDirection: "column", children: [confirmationRequest.prompt, _jsx(Box, { paddingY: 1, children: _jsx(RadioButtonSelect, { isFocused: !!confirmationRequest, items: [
                                            { label: "Yes", value: true },
                                            { label: "No", value: false },
                                        ], onSelect: (value) => {
                                            confirmationRequest.onConfirm(value);
                                        } }) })] })) : isThemeDialogOpen ? (_jsxs(Box, { flexDirection: "column", children: [themeError && (_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: Colors.AccentRed, children: themeError }) })), _jsx(ThemeDialog, { onSelect: handleThemeSelect, onHighlight: handleThemeHighlight, settings: settings, availableTerminalHeight: constrainHeight
                                        ? terminalHeight - staticExtraHeight
                                        : undefined, terminalWidth: mainAreaWidth })] })) : isSettingsDialogOpen ? (_jsx(Box, { flexDirection: "column", children: _jsx(SettingsDialog, { settings: settings, onSelect: () => closeSettingsDialog(), onRestartRequest: () => process.exit(0), onOpenCompressModelPicker: openCompressModelDialog }) })) : isAuthenticating ? (_jsxs(_Fragment, { children: [isQwenAuth && isQwenAuthenticating ? (_jsx(QwenOAuthProgress, { deviceAuth: deviceAuth || undefined, authStatus: authStatus, authMessage: authMessage, onTimeout: () => {
                                        setAuthError("Qwen OAuth authentication timed out. Please try again.");
                                        cancelQwenAuth();
                                        cancelAuthentication();
                                        openAuthDialog();
                                    }, onCancel: () => {
                                        setAuthError("Qwen OAuth authentication cancelled.");
                                        cancelQwenAuth();
                                        cancelAuthentication();
                                        openAuthDialog();
                                    } })) : (_jsx(AuthInProgress, { onTimeout: () => {
                                        setAuthError("Authentication timed out. Please try again.");
                                        cancelAuthentication();
                                        openAuthDialog();
                                    } })), showErrorDetails && (_jsx(OverflowProvider, { children: _jsxs(Box, { flexDirection: "column", children: [_jsx(DetailedMessagesDisplay, { messages: filteredConsoleMessages, maxHeight: constrainHeight ? debugConsoleMaxHeight : undefined, width: inputWidth }), _jsx(ShowMoreLines, { constrainHeight: constrainHeight })] }) }))] })) : isAuthDialogOpen ? (_jsx(Box, { flexDirection: "column", children: _jsx(AuthDialog, { onSelect: handleAuthSelect, settings: settings, initialErrorMessage: authError }) })) : isEditorDialogOpen ? (_jsxs(Box, { flexDirection: "column", children: [editorError && (_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: Colors.AccentRed, children: editorError }) })), _jsx(EditorSettingsDialog, { onSelect: handleEditorSelect, settings: settings, onExit: exitEditorDialog })] })) : isTaskTemplateDialogOpen ? (_jsx(TaskTemplateEditorDialog, { projectRoot: config.getProjectRoot() || process.cwd(), settings: settings, currentModel: currentModel, onExit: closeTaskTemplateDialog, onDeploy: handleTaskTemplateDeploy })) : isMailboxDialogOpen ? (_jsx(MailboxDialog, { baseDir: config.getTargetDir(), sessionId: config.getSessionId(), onExit: closeMailboxDialog, onUsePayload: handleMailboxPayloadUse })) : isModelSelectionDialogOpen ? (_jsx(ModelSelectionDialog, { availableModels: availableModelsForDialog, currentModel: currentModel, onSelect: handleModelSelect, onCancel: handleModelSelectionClose, onRefresh: () => handleModelSelectionOpen(true) })) : isCompressModelDialogOpen ? (_jsx(ModelSelectionDialog, { availableModels: compressModelsForDialog, currentModel: settings.merged.model?.chatCompression?.openRouterModel || "", onSelect: handleCompressModelSelect, onCancel: handleCompressModelClose })) : isResumeDialogOpen ? (_jsx(ResumeDialog, { checkpoints: resumeCheckpoints, onSelect: handleResumeCheckpointSelect, onClose: closeResumeDialog })) : isVisionSwitchDialogOpen ? (_jsx(ModelSwitchDialog, { onSelect: handleVisionSwitchSelect })) : isLlamaCppConfigDialogOpen ? (_jsx(LlamaCppModelConfigDialog, { modelPath: pendingLlamaCppModel ?? "", maxContextLength: pendingLlamaCppModel
                                ? allAvailableModels.find((m) => m.id === pendingLlamaCppModel)?.maxContextLength
                                : undefined, previousSettings: pendingLlamaCppPrevSettings, onSubmit: handleLlamaCppConfigSubmit, onCancel: handleLlamaCppConfigCancel })) : showPrivacyNotice ? (_jsx(PrivacyNotice, { onExit: () => setShowPrivacyNotice(false), config: config })) : (_jsxs(_Fragment, { children: [_jsx(LoadingIndicator, { thought: streamingState === StreamingState.WaitingForConfirmation ||
                                        config.getAccessibility()?.disableLoadingPhrases ||
                                        config.getScreenReader()
                                        ? undefined
                                        : thought, currentLoadingPhrase: config.getAccessibility()?.disableLoadingPhrases ||
                                        config.getScreenReader()
                                        ? undefined
                                        : currentLoadingPhrase, elapsedTime: elapsedTime }), messageQueue.length > 0 && (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [messageQueue
                                            .slice(0, MAX_DISPLAYED_QUEUED_MESSAGES)
                                            .map((message, index) => {
                                            // Ensure multi-line messages are collapsed for the preview.
                                            // Replace all whitespace (including newlines) with a single space.
                                            const preview = message.replace(/\s+/g, " ");
                                            return (
                                            // Ensure the Box takes full width so truncation calculates correctly
                                            _jsx(Box, { paddingLeft: 2, width: "100%", children: _jsx(Text, { dimColor: true, wrap: "truncate", children: preview }) }, index));
                                        }), messageQueue.length > MAX_DISPLAYED_QUEUED_MESSAGES && (_jsx(Box, { paddingLeft: 2, children: _jsxs(Text, { dimColor: true, children: ["... (+", messageQueue.length - MAX_DISPLAYED_QUEUED_MESSAGES, "more)"] }) }))] })), _jsxs(Box, { marginTop: 1, justifyContent: "space-between", width: "100%", flexDirection: isNarrow ? "column" : "row", alignItems: isNarrow ? "flex-start" : "center", children: [_jsxs(Box, { children: [process.env["GEMINI_SYSTEM_MD"] && (_jsx(Text, { color: Colors.AccentRed, children: "|\u2310\u25A0_\u25A0| " })), ctrlCPressedOnce ? (_jsx(Text, { color: Colors.AccentYellow, children: "Press Ctrl+C again to confirm exit." })) : ctrlDPressedOnce ? (_jsx(Text, { color: Colors.AccentYellow, children: "Press Ctrl+D again to exit." })) : showEscapePrompt ? (_jsx(Text, { color: Colors.Gray, children: "Press Esc again to clear." })) : (_jsx(ContextSummaryDisplay, { ideContext: ideContextState, geminiMdFileCount: geminiMdFileCount, contextFileNames: contextFileNames, mcpServers: config.getMcpServers(), blockedMcpServers: config.getBlockedMcpServers(), showToolDescriptions: showToolDescriptions }))] }), _jsxs(Box, { paddingTop: isNarrow ? 1 : 0, children: [showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
                                                    !shellModeActive && (_jsx(AutoAcceptIndicator, { approvalMode: showAutoAcceptIndicator })), shellModeActive && _jsx(ShellModeIndicator, {})] })] }), showErrorDetails && (_jsx(OverflowProvider, { children: _jsxs(Box, { flexDirection: "column", children: [_jsx(DetailedMessagesDisplay, { messages: filteredConsoleMessages, maxHeight: constrainHeight ? debugConsoleMaxHeight : undefined, width: inputWidth }), _jsx(ShowMoreLines, { constrainHeight: constrainHeight })] }) })), isInputActive && (_jsx(InputPrompt, { buffer: buffer, inputWidth: inputWidth, suggestionsWidth: suggestionsWidth, onSubmit: handleFinalSubmit, userMessages: userMessages, onClearScreen: handleClearScreen, config: config, slashCommands: slashCommands, commandContext: commandContext, shellModeActive: shellModeActive, setShellModeActive: setShellModeActive, onEscapePromptChange: handleEscapePromptChange, focus: isFocused, vimHandleInput: vimHandleInput, placeholder: placeholder }))] })), initError && streamingState !== StreamingState.Responding && (_jsx(Box, { borderStyle: "round", borderColor: Colors.AccentRed, paddingX: 1, marginBottom: 1, children: history.find((item) => item.type === "error" && item.text?.includes(initError))?.text ? (_jsx(Text, { color: Colors.AccentRed, children: history.find((item) => item.type === "error" && item.text?.includes(initError))?.text })) : (_jsxs(_Fragment, { children: [_jsxs(Text, { color: Colors.AccentRed, children: ["Initialization Error: ", initError] }), _jsxs(Text, { color: Colors.AccentRed, children: [" ", "Please check API key and configuration."] })] })) })), llamaCppLoadingProgress && (_jsx(LlamaCppLoadingBar, { phase: llamaCppLoadingProgress.phase, elapsedMs: llamaCppLoadingProgress.elapsedMs, message: llamaCppLoadingProgress.message })), !settings.merged.ui?.hideFooter && (_jsx(Footer, { model: currentModelLabel || currentModel, modelLimit: (() => {
                                const configWithContextLimit = config;
                                if (typeof configWithContextLimit.getEffectiveContextLimit ===
                                    "function") {
                                    return configWithContextLimit.getEffectiveContextLimit(currentModel);
                                }
                                if (typeof configWithContextLimit.getModelContextLimit ===
                                    "function") {
                                    return configWithContextLimit.getModelContextLimit(currentModel);
                                }
                                return undefined;
                            })(), targetDir: config.getTargetDir(), debugMode: config.getDebugMode(), branchName: branchName, debugMessage: debugMessage, corgiMode: corgiMode, errorCount: errorCount, showErrorDetails: showErrorDetails, showMemoryUsage: config.getDebugMode() ||
                                settings.merged.ui?.showMemoryUsage ||
                                false, promptTokenCount: sessionStats.lastPromptTokenCount, nightly: nightly, vimMode: vimModeEnabled ? vimMode : undefined, isTrustedFolder: isTrustedFolderState }))] })] }) }));
};
//# sourceMappingURL=App.js.map