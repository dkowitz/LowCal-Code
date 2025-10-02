import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Box, measureElement, Static, Text, useStdin, useStdout, } from 'ink';
import { StreamingState, MessageType, ToolCallStatus, } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './hooks/useAuthCommand.js';
import { useQwenAuth } from './hooks/useQwenAuth.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useQuitConfirmation } from './hooks/useQuitConfirmation.js';
import { useWelcomeBack } from './hooks/useWelcomeBack.js';
import { useDialogClose } from './hooks/useDialogClose.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useSessionLoggingController } from './hooks/useSessionLoggingController.js';
import { useSubagentCreateDialog } from './hooks/useSubagentCreateDialog.js';
import { useAgentsManagerDialog } from './hooks/useAgentsManagerDialog.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { AutoAcceptIndicator } from './components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from './components/ShellModeIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { AuthDialog } from './components/AuthDialog.js';
import { AuthInProgress } from './components/AuthInProgress.js';
import { QwenOAuthProgress } from './components/QwenOAuthProgress.js';
import { EditorSettingsDialog } from './components/EditorSettingsDialog.js';
import { FolderTrustDialog } from './components/FolderTrustDialog.js';
import { ShellConfirmationDialog } from './components/ShellConfirmationDialog.js';
import { QuitConfirmationDialog } from './components/QuitConfirmationDialog.js';
import { RadioButtonSelect } from './components/shared/RadioButtonSelect.js';
import { ModelSelectionDialog } from './components/ModelSelectionDialog.js';
import { ModelSwitchDialog, } from './components/ModelSwitchDialog.js';
import { getOpenAIAvailableModelFromEnv, getFilteredQwenModels, fetchOpenAICompatibleModels, getLMStudioLoadedModel, } from './models/availableModels.js';
import { processVisionSwitchOutcome } from './hooks/useVisionAutoSwitch.js';
import { AgentCreationWizard, AgentsManagerDialog, } from './components/subagents/index.js';
import { Colors } from './colors.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import { setOpenAIModel } from '../config/auth.js';
import { SettingScope } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup } from '../utils/cleanup.js';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { ContextSummaryDisplay } from './components/ContextSummaryDisplay.js';
import { useHistory } from './hooks/useHistoryManager.js';
import process from 'node:process';
import { ApprovalMode, getAllGeminiMdFilenames, isEditorAvailable, getErrorMessage, AuthType, logFlashFallback, FlashFallbackEvent, ideContext, isProQuotaExceededError, isGenericQuotaExceededError, UserTierId, } from '@qwen-code/qwen-code-core';
import { IdeIntegrationNudge } from './IdeIntegrationNudge.js';
import { validateAuthMethod } from '../config/auth.js';
import { useLogger } from './hooks/useLogger.js';
import { StreamingContext } from './contexts/StreamingContext.js';
import { SessionStatsProvider, useSessionStats, } from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useVimMode, VimModeProvider } from './contexts/VimModeContext.js';
import { useVim } from './hooks/vim.js';
import { useKeypress } from './hooks/useKeypress.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { useKittyKeyboardProtocol } from './hooks/useKittyKeyboardProtocol.js';
import { keyMatchers, Command } from './keyMatchers.js';
import * as fs from 'node:fs';
import { UpdateNotification } from './components/UpdateNotification.js';
import ansiEscapes from 'ansi-escapes';
import { OverflowProvider } from './contexts/OverflowContext.js';
import { ShowMoreLines } from './components/ShowMoreLines.js';
import { PrivacyNotice } from './privacy/PrivacyNotice.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { setUpdateHandler } from '../utils/handleAutoUpdate.js';
import { appEvents, AppEvent } from '../utils/events.js';
import { isNarrowWidth } from './utils/isNarrowWidth.js';
import { useWorkspaceMigration } from './hooks/useWorkspaceMigration.js';
import { WorkspaceMigrationDialog } from './components/WorkspaceMigrationDialog.js';
import { WelcomeBackDialog } from './components/WelcomeBackDialog.js';
// Maximum number of queued messages to display in UI to prevent performance issues
const MAX_DISPLAYED_QUEUED_MESSAGES = 3;
function isToolExecuting(pendingHistoryItems) {
    return pendingHistoryItems.some((item) => {
        if (item && item.type === 'tool_group') {
            return item.tools.some((tool) => ToolCallStatus.Executing === tool.status);
        }
        return false;
    });
}
export const AppWrapper = (props) => {
    const kittyProtocolStatus = useKittyKeyboardProtocol();
    const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
    return (_jsx(KeypressProvider, { kittyProtocolEnabled: kittyProtocolStatus.enabled, pasteWorkaround: process.platform === 'win32' || nodeMajorVersion < 20, config: props.config, debugKeystrokeLogging: props.settings.merged.general?.debugKeystrokeLogging, children: _jsx(SessionStatsProvider, { children: _jsx(VimModeProvider, { settings: props.settings, children: _jsx(App, { ...props }) }) }) }));
};
const App = ({ config, settings, startupWarnings = [], version }) => {
    const isFocused = useFocus();
    useBracketedPaste();
    const [updateInfo, setUpdateInfo] = useState(null);
    const { stdout } = useStdout();
    const nightly = version.includes('nightly');
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
    const [debugMessage, setDebugMessage] = useState('');
    const [themeError, setThemeError] = useState(null);
    const [authError, setAuthError] = useState(null);
    const [editorError, setEditorError] = useState(null);
    const [footerHeight, setFooterHeight] = useState(0);
    const [corgiMode, setCorgiMode] = useState(false);
    const [isTrustedFolderState, setIsTrustedFolder] = useState(config.isTrustedFolder());
    const [currentModel, setCurrentModel] = useState(config.getModel());
    const [lmStudioModel, setLmStudioModel] = useState(null);
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
                    if (settings.merged.security?.auth?.providerId === 'openrouter') {
                        try {
                            setOpenAIModel(savedModel);
                        }
                        catch (err) {
                            console.warn('Failed to persist OpenRouter model to .env:', err);
                        }
                    }
                }
                catch (e) {
                    console.warn('Failed to restore saved model from settings:', e);
                }
            })();
        }
    }, [
        config,
        settings.merged.model?.name,
        settings.merged.security?.auth?.providerId,
    ]);
    useEffect(() => {
        const authType = settings.merged.security?.auth?.selectedType;
        const baseUrl = process.env['OPENAI_BASE_URL'];
        let interval = undefined;
        if (authType === AuthType.USE_OPENAI &&
            baseUrl?.includes('127.0.0.1')) {
            const fetchLmStudioModel = async () => {
                if (baseUrl) {
                    const loadedModel = await getLMStudioLoadedModel(baseUrl);
                    setLmStudioModel(loadedModel);
                }
            };
            fetchLmStudioModel(); // Initial fetch
            interval = setInterval(fetchLmStudioModel, 5000); // Poll every 5 seconds
        }
        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [settings.merged.security?.auth?.selectedType, JSON.stringify(process.env)]);
    useEffect(() => {
        const providerId = settings.merged.security?.auth?.providerId;
        if (providerId !== 'lmstudio') {
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
    const [isVisionSwitchDialogOpen, setIsVisionSwitchDialogOpen] = useState(false);
    const [visionSwitchResolver, setVisionSwitchResolver] = useState(null);
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
                type: 'error',
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
    const handleEscapePromptChange = useCallback((showPrompt) => {
        setShowEscapePrompt(showPrompt);
    }, []);
    const initialPromptSubmitted = useRef(false);
    const errorCount = useMemo(() => consoleMessages
        .filter((msg) => msg.type === 'error')
        .reduce((total, msg) => total + msg.count, 0), [consoleMessages]);
    const { isThemeDialogOpen, openThemeDialog, handleThemeSelect, handleThemeHighlight, } = useThemeCommand(settings, setThemeError, addItem);
    const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } = useSettingsCommand();
    const { isSubagentCreateDialogOpen, openSubagentCreateDialog, closeSubagentCreateDialog, } = useSubagentCreateDialog();
    const { isAgentsManagerDialogOpen, openAgentsManagerDialog, closeAgentsManagerDialog, } = useAgentsManagerDialog();
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
        if (isQwenAuth && authStatus === 'timeout') {
            setAuthError(authMessage ||
                'Qwen OAuth authentication timed out. Please try again or select a different authentication method.');
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
            text: 'Refreshing hierarchical memory (QWEN.md or other context files)...',
        }, Date.now());
        try {
            const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(process.cwd(), settings.merged.context?.loadMemoryFromIncludeDirectories
                ? config.getWorkspaceContext().getDirectories()
                : [], config.getDebugMode(), config.getFileService(), settings.merged, config.getExtensionContextFilePaths(), settings.merged.context?.importFormat || 'tree', // Use setting or default to 'tree'
            config.getFileFilteringOptions());
            config.setUserMemory(memoryContent);
            config.setGeminiMdFileCount(fileCount);
            setGeminiMdFileCount(fileCount);
            addItem({
                type: MessageType.INFO,
                text: `Memory refreshed successfully. ${memoryContent.length > 0 ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).` : 'No memory content found.'}`,
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
            console.error('Error refreshing memory:', error);
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
                console.error('Failed to switch to fallback model:', error);
            });
            config.setFallbackMode(true);
            logFlashFallback(config, new FlashFallbackEvent(config.getContentGeneratorConfig().authType));
            return false; // Don't continue with current prompt
        };
        config.setFlashFallbackHandler(flashFallbackHandler);
    }, [config, addItem, userTier]);
    // Terminal and UI setup
    const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
    const isNarrow = isNarrowWidth(terminalWidth);
    const { stdin, setRawMode } = useStdin();
    const isInitialMount = useRef(true);
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
        setAuthError('reauth required');
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
    const handleModelSelectionOpen = useCallback(() => {
        (async () => {
            if (allAvailableModels.length > 0) {
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
                    const baseUrl = contentGeneratorConfig.baseUrl || process.env['OPENAI_BASE_URL'] || '';
                    const apiKey = contentGeneratorConfig.apiKey || process.env['OPENAI_API_KEY'];
                    if (baseUrl) {
                        models = await fetchOpenAICompatibleModels(baseUrl, apiKey);
                    }
                    const openAIModel = getOpenAIAvailableModelFromEnv();
                    if (openAIModel) {
                        if (!models.find(m => m.id === openAIModel.id)) {
                            models.push(openAIModel);
                        }
                    }
                }
                else {
                    models = getFilteredQwenModels(settings.merged.experimental?.visionModelPreview ?? true);
                }
                setAllAvailableModels(models);
                setAvailableModelsForDialog(models);
                setIsModelSelectionDialogOpen(true);
            }
            finally {
                setIsFetchingModels(false);
            }
        })();
    }, [allAvailableModels, config, settings.merged.experimental?.visionModelPreview, isFetchingModels]);
    const handleModelSelectionClose = useCallback(() => {
        setIsModelSelectionDialogOpen(false);
    }, []);
    const handleModelSelect = useCallback(async (modelId) => {
        try {
            // Unload previous model by setting new model (config.setModel will reinitialize client)
            await config.setModel(modelId);
            setCurrentModel(modelId);
            if (settings.merged.security?.auth?.providerId === 'openrouter') {
                try {
                    setOpenAIModel(modelId);
                }
                catch (err) {
                    console.warn('Failed to persist OpenRouter model to .env:', err);
                }
            }
            // Persist selected model to user settings so it is restored on next startup.
            try {
                settings.setValue(SettingScope.User, 'model.name', modelId);
            }
            catch (e) {
                console.warn('Failed to persist selected model to settings:', e);
            }
            setIsModelSelectionDialogOpen(false);
            addItem({
                type: MessageType.INFO,
                text: `Switched model to \`${modelId}\` for this session.`,
            }, Date.now());
            // Send a small warm-up query to prime the model (non-blocking)
            try {
                const gemini = config.getGeminiClient();
                if (gemini) {
                    void gemini.generateContent([{ role: 'user', parts: [{ text: 'Say hello.' }] }], {}, new AbortController().signal, modelId).catch(() => { });
                }
            }
            catch (e) {
                // ignore warm-up errors
            }
        }
        catch (error) {
            console.error('Failed to switch model:', error);
            addItem({
                type: MessageType.ERROR,
                text: `Failed to switch to model \`${modelId}\`. Please try again.`,
            }, Date.now());
        }
    }, [config, setCurrentModel, addItem]);
    // available models for dialog are populated via handleModelSelectionOpen
    // Core hooks and processors
    const { vimEnabled: vimModeEnabled, vimMode, toggleVimEnabled, } = useVimMode();
    const { handleSlashCommand, slashCommands, pendingHistoryItems: pendingSlashCommandHistoryItems, commandContext, shellConfirmationRequest, confirmationRequest, quitConfirmationRequest, } = useSlashCommandProcessor(config, settings, addItem, clearItems, loadHistory, history, refreshStatic, setDebugMessage, openThemeDialog, openAuthDialog, openEditorDialog, toggleCorgiMode, setQuittingMessages, openPrivacyNotice, openSettingsDialog, handleModelSelectionOpen, openSubagentCreateDialog, openAgentsManagerDialog, toggleVimEnabled, setIsProcessing, setGeminiMdFileCount, showQuitConfirmation, sessionLoggingController);
    const buffer = useTextBuffer({
        initialText: '',
        viewport: { height: 10, width: inputWidth },
        stdin,
        setRawMode,
        isValidPath,
        shellModeActive,
    });
    const [userMessages, setUserMessages] = useState([]);
    // Stable reference for cancel handler to avoid circular dependency
    const cancelHandlerRef = useRef(() => { });
    const { streamingState, submitQuery, initError, pendingHistoryItems: pendingGeminiHistoryItems, thought, cancelOngoingRequest, } = useGeminiStream(config.getGeminiClient(), history, addItem, config, setDebugMessage, handleSlashCommand, shellModeActive, getPreferredEditor, onAuthError, performMemoryRefresh, modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError, refreshStatic, () => cancelHandlerRef.current(), settings.merged.experimental?.visionModelPreview ?? true, handleVisionSwitchRequired);
    const pendingHistoryItems = useMemo(() => [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems].map((item, index) => ({
        ...item,
        id: index,
    })), [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems]);
    // Welcome back functionality
    const { welcomeBackInfo, showWelcomeBackDialog, welcomeBackChoice, handleWelcomeBackSelection, handleWelcomeBackClose, } = useWelcomeBack(config, submitQuery, buffer, settings.merged);
    // Dialog close functionality
    const { closeAnyOpenDialog } = useDialogClose({
        isThemeDialogOpen,
        handleThemeSelect,
        isAuthDialogOpen,
        handleAuthSelect,
        selectedAuthType: settings.merged.security?.auth?.selectedType,
        isEditorDialogOpen,
        exitEditorDialog,
        isSettingsDialogOpen,
        closeSettingsDialog,
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
            buffer.setText(''); // Just clear the prompt
            return;
        }
        const lastUserMessage = userMessages.at(-1);
        let textToSet = lastUserMessage || '';
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
        if (result.userSelection === 'yes') {
            if (result.isExtensionPreInstalled) {
                handleSlashCommand('/ide enable');
            }
            else {
                handleSlashCommand('/ide install');
            }
            settings.setValue(SettingScope.User, 'hasSeenIdeIntegrationNudge', true);
        }
        else if (result.userSelection === 'dismiss') {
            settings.setValue(SettingScope.User, 'hasSeenIdeIntegrationNudge', true);
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
            handleSlashCommand('/quit');
            return;
        }
        // First press: Prioritize cleanup tasks
        // Special case: If quit-confirm dialog is open, Ctrl+C means "quit immediately"
        if (quitConfirmationRequest) {
            handleSlashCommand('/quit');
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
            buffer.setText('');
            return; // Input cleared, end processing
        }
        // All cleanup tasks completed, show quit confirmation dialog
        handleSlashCommand('/quit-confirm');
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
            console.log('[DEBUG] Keystroke:', JSON.stringify(key));
        }
        let enteringConstrainHeightMode = false;
        if (!constrainHeight) {
            enteringConstrainHeightMode = true;
            setConstrainHeight(true);
        }
        if (keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
            setShowErrorDetails((prev) => !prev);
        }
        else if (keyMatchers[Command.TOGGLE_TOOL_DESCRIPTIONS](key)) {
            const newValue = !showToolDescriptions;
            setShowToolDescriptions(newValue);
            const mcpServers = config.getMcpServers();
            if (Object.keys(mcpServers || {}).length > 0) {
                handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
            }
        }
        else if (keyMatchers[Command.TOGGLE_IDE_CONTEXT_DETAIL](key) &&
            config.getIdeMode() &&
            ideContextState) {
            // Show IDE status when in IDE mode and context is available.
            handleSlashCommand('/ide status');
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
            const currentSessionUserMessages = history
                .filter((item) => item.type === 'user' &&
                typeof item.text === 'string' &&
                item.text.trim() !== '')
                .map((item) => item.text)
                .reverse(); // Newest first, to match pastMessagesRaw sorting
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
        !showWelcomeBackDialog;
    const handleClearScreen = useCallback(() => {
        clearItems();
        clearConsoleMessagesState();
        console.clear();
        refreshStatic();
    }, [clearItems, clearConsoleMessagesState, refreshStatic]);
    const mainControlsRef = useRef(null);
    const pendingHistoryItemRef = useRef(null);
    useEffect(() => {
        if (mainControlsRef.current) {
            const fullFooterMeasurement = measureElement(mainControlsRef.current);
            setFooterHeight(fullFooterMeasurement.height);
        }
    }, [terminalHeight, consoleMessages, showErrorDetails]);
    const staticExtraHeight = /* margins and padding */ 3;
    const availableTerminalHeight = useMemo(() => terminalHeight - footerHeight - staticExtraHeight, [terminalHeight, footerHeight]);
    useEffect(() => {
        // skip refreshing Static during first mount
        if (isInitialMount.current) {
            isInitialMount.current = false;
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
    }, [terminalWidth, terminalHeight, refreshStatic]);
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
        return consoleMessages.filter((msg) => msg.type !== 'debug');
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
        if (initialPrompt &&
            !initialPromptSubmitted.current &&
            !isAuthenticating &&
            !isAuthDialogOpen &&
            !isThemeDialogOpen &&
            !isEditorDialogOpen &&
            !isModelSelectionDialogOpen &&
            !isVisionSwitchDialogOpen &&
            !isSubagentCreateDialogOpen &&
            !showPrivacyNotice &&
            !showWelcomeBackDialog &&
            welcomeBackChoice !== 'restart' &&
            geminiClient?.isInitialized?.()) {
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
        isSubagentCreateDialogOpen,
        showPrivacyNotice,
        showWelcomeBackDialog,
        welcomeBackChoice,
        geminiClient,
        isModelSelectionDialogOpen,
        isVisionSwitchDialogOpen,
    ]);
    if (quittingMessages) {
        return (_jsx(Box, { flexDirection: "column", marginBottom: 1, children: quittingMessages.map((item) => (_jsx(HistoryItemDisplay, { availableTerminalHeight: constrainHeight ? availableTerminalHeight : undefined, terminalWidth: terminalWidth, item: item, isPending: false, config: config }, item.id))) }));
    }
    const mainAreaWidth = Math.floor(terminalWidth * 0.9);
    const debugConsoleMaxHeight = Math.floor(Math.max(terminalHeight * 0.2, 5));
    // Arbitrary threshold to ensure that items in the static area are large
    // enough but not too large to make the terminal hard to use.
    const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);
    const placeholder = vimModeEnabled
        ? "  Press 'i' for INSERT mode and 'Esc' for NORMAL mode."
        : '  Type your message or @path/to/file';
    return (_jsx(StreamingContext.Provider, { value: streamingState, children: _jsxs(Box, { flexDirection: "column", width: "90%", children: [_jsx(Static, { items: [
                        _jsxs(Box, { flexDirection: "column", children: [!(settings.merged.ui?.hideBanner || config.getScreenReader()) && _jsx(Header, { version: version, nightly: nightly }), !(settings.merged.ui?.hideTips || config.getScreenReader()) && (_jsx(Tips, { config: config }))] }, "header"),
                        ...history.map((h) => (_jsx(HistoryItemDisplay, { terminalWidth: mainAreaWidth, availableTerminalHeight: staticAreaMaxItemHeight, item: h, isPending: false, config: config, commands: slashCommands }, h.id))),
                    ], children: (item) => item }, staticKey), _jsx(OverflowProvider, { children: _jsxs(Box, { ref: pendingHistoryItemRef, flexDirection: "column", children: [pendingHistoryItems.map((item) => (_jsx(HistoryItemDisplay, { availableTerminalHeight: constrainHeight ? availableTerminalHeight : undefined, terminalWidth: mainAreaWidth, item: item, isPending: true, config: config, isFocused: !isEditorDialogOpen }, item.id))), _jsx(ShowMoreLines, { constrainHeight: constrainHeight })] }) }), _jsxs(Box, { flexDirection: "column", ref: mainControlsRef, children: [updateInfo && _jsx(UpdateNotification, { message: updateInfo.message }), startupWarnings.length > 0 && (_jsx(Box, { borderStyle: "round", borderColor: Colors.AccentYellow, paddingX: 1, marginY: 1, flexDirection: "column", children: startupWarnings.map((warning, index) => (_jsx(Text, { color: Colors.AccentYellow, children: warning }, index))) })), showWelcomeBackDialog && welcomeBackInfo?.hasHistory && (_jsx(WelcomeBackDialog, { welcomeBackInfo: welcomeBackInfo, onSelect: handleWelcomeBackSelection, onClose: handleWelcomeBackClose })), showWorkspaceMigrationDialog ? (_jsx(WorkspaceMigrationDialog, { workspaceExtensions: workspaceExtensions, onOpen: onWorkspaceMigrationDialogOpen, onClose: onWorkspaceMigrationDialogClose })) : shouldShowIdePrompt && currentIDE ? (_jsx(IdeIntegrationNudge, { ide: currentIDE, onComplete: handleIdePromptComplete })) : isFolderTrustDialogOpen ? (_jsx(FolderTrustDialog, { onSelect: handleFolderTrustSelect, isRestarting: isRestarting })) : quitConfirmationRequest ? (_jsx(QuitConfirmationDialog, { onSelect: (choice) => {
                                const result = handleQuitConfirmationSelect(choice);
                                if (result?.shouldQuit) {
                                    quitConfirmationRequest.onConfirm(true, result.action);
                                }
                                else {
                                    quitConfirmationRequest.onConfirm(false);
                                }
                            } })) : shellConfirmationRequest ? (_jsx(ShellConfirmationDialog, { request: shellConfirmationRequest })) : confirmationRequest ? (_jsxs(Box, { flexDirection: "column", children: [confirmationRequest.prompt, _jsx(Box, { paddingY: 1, children: _jsx(RadioButtonSelect, { isFocused: !!confirmationRequest, items: [
                                            { label: 'Yes', value: true },
                                            { label: 'No', value: false },
                                        ], onSelect: (value) => {
                                            confirmationRequest.onConfirm(value);
                                        } }) })] })) : isThemeDialogOpen ? (_jsxs(Box, { flexDirection: "column", children: [themeError && (_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: Colors.AccentRed, children: themeError }) })), _jsx(ThemeDialog, { onSelect: handleThemeSelect, onHighlight: handleThemeHighlight, settings: settings, availableTerminalHeight: constrainHeight
                                        ? terminalHeight - staticExtraHeight
                                        : undefined, terminalWidth: mainAreaWidth })] })) : isSettingsDialogOpen ? (_jsx(Box, { flexDirection: "column", children: _jsx(SettingsDialog, { settings: settings, onSelect: () => closeSettingsDialog(), onRestartRequest: () => process.exit(0) }) })) : isSubagentCreateDialogOpen ? (_jsx(Box, { flexDirection: "column", children: _jsx(AgentCreationWizard, { onClose: closeSubagentCreateDialog, config: config }) })) : isAgentsManagerDialogOpen ? (_jsx(Box, { flexDirection: "column", children: _jsx(AgentsManagerDialog, { onClose: closeAgentsManagerDialog, config: config }) })) : isAuthenticating ? (_jsxs(_Fragment, { children: [isQwenAuth && isQwenAuthenticating ? (_jsx(QwenOAuthProgress, { deviceAuth: deviceAuth || undefined, authStatus: authStatus, authMessage: authMessage, onTimeout: () => {
                                        setAuthError('Qwen OAuth authentication timed out. Please try again.');
                                        cancelQwenAuth();
                                        cancelAuthentication();
                                        openAuthDialog();
                                    }, onCancel: () => {
                                        setAuthError('Qwen OAuth authentication cancelled.');
                                        cancelQwenAuth();
                                        cancelAuthentication();
                                        openAuthDialog();
                                    } })) : (_jsx(AuthInProgress, { onTimeout: () => {
                                        setAuthError('Authentication timed out. Please try again.');
                                        cancelAuthentication();
                                        openAuthDialog();
                                    } })), showErrorDetails && (_jsx(OverflowProvider, { children: _jsxs(Box, { flexDirection: "column", children: [_jsx(DetailedMessagesDisplay, { messages: filteredConsoleMessages, maxHeight: constrainHeight ? debugConsoleMaxHeight : undefined, width: inputWidth }), _jsx(ShowMoreLines, { constrainHeight: constrainHeight })] }) }))] })) : isAuthDialogOpen ? (_jsx(Box, { flexDirection: "column", children: _jsx(AuthDialog, { onSelect: handleAuthSelect, settings: settings, initialErrorMessage: authError }) })) : isEditorDialogOpen ? (_jsxs(Box, { flexDirection: "column", children: [editorError && (_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: Colors.AccentRed, children: editorError }) })), _jsx(EditorSettingsDialog, { onSelect: handleEditorSelect, settings: settings, onExit: exitEditorDialog })] })) : isModelSelectionDialogOpen ? (_jsx(ModelSelectionDialog, { availableModels: availableModelsForDialog, currentModel: currentModel, onSelect: handleModelSelect, onCancel: handleModelSelectionClose })) : isVisionSwitchDialogOpen ? (_jsx(ModelSwitchDialog, { onSelect: handleVisionSwitchSelect })) : showPrivacyNotice ? (_jsx(PrivacyNotice, { onExit: () => setShowPrivacyNotice(false), config: config })) : (_jsxs(_Fragment, { children: [_jsx(LoadingIndicator, { thought: streamingState === StreamingState.WaitingForConfirmation ||
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
                                            const preview = message.replace(/\s+/g, ' ');
                                            return (
                                            // Ensure the Box takes full width so truncation calculates correctly
                                            _jsx(Box, { paddingLeft: 2, width: "100%", children: _jsx(Text, { dimColor: true, wrap: "truncate", children: preview }) }, index));
                                        }), messageQueue.length > MAX_DISPLAYED_QUEUED_MESSAGES && (_jsx(Box, { paddingLeft: 2, children: _jsxs(Text, { dimColor: true, children: ["... (+", messageQueue.length - MAX_DISPLAYED_QUEUED_MESSAGES, "more)"] }) }))] })), _jsxs(Box, { marginTop: 1, justifyContent: "space-between", width: "100%", flexDirection: isNarrow ? 'column' : 'row', alignItems: isNarrow ? 'flex-start' : 'center', children: [_jsxs(Box, { children: [process.env['GEMINI_SYSTEM_MD'] && (_jsx(Text, { color: Colors.AccentRed, children: "|\u2310\u25A0_\u25A0| " })), ctrlCPressedOnce ? (_jsx(Text, { color: Colors.AccentYellow, children: "Press Ctrl+C again to confirm exit." })) : ctrlDPressedOnce ? (_jsx(Text, { color: Colors.AccentYellow, children: "Press Ctrl+D again to exit." })) : showEscapePrompt ? (_jsx(Text, { color: Colors.Gray, children: "Press Esc again to clear." })) : (_jsx(ContextSummaryDisplay, { ideContext: ideContextState, geminiMdFileCount: geminiMdFileCount, contextFileNames: contextFileNames, mcpServers: config.getMcpServers(), blockedMcpServers: config.getBlockedMcpServers(), showToolDescriptions: showToolDescriptions }))] }), _jsxs(Box, { paddingTop: isNarrow ? 1 : 0, children: [showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
                                                    !shellModeActive && (_jsx(AutoAcceptIndicator, { approvalMode: showAutoAcceptIndicator })), shellModeActive && _jsx(ShellModeIndicator, {})] })] }), showErrorDetails && (_jsx(OverflowProvider, { children: _jsxs(Box, { flexDirection: "column", children: [_jsx(DetailedMessagesDisplay, { messages: filteredConsoleMessages, maxHeight: constrainHeight ? debugConsoleMaxHeight : undefined, width: inputWidth }), _jsx(ShowMoreLines, { constrainHeight: constrainHeight })] }) })), isInputActive && (_jsx(InputPrompt, { buffer: buffer, inputWidth: inputWidth, suggestionsWidth: suggestionsWidth, onSubmit: handleFinalSubmit, userMessages: userMessages, onClearScreen: handleClearScreen, config: config, slashCommands: slashCommands, commandContext: commandContext, shellModeActive: shellModeActive, setShellModeActive: setShellModeActive, onEscapePromptChange: handleEscapePromptChange, focus: isFocused, vimHandleInput: vimHandleInput, placeholder: placeholder }))] })), initError && streamingState !== StreamingState.Responding && (_jsx(Box, { borderStyle: "round", borderColor: Colors.AccentRed, paddingX: 1, marginBottom: 1, children: history.find((item) => item.type === 'error' && item.text?.includes(initError))?.text ? (_jsx(Text, { color: Colors.AccentRed, children: history.find((item) => item.type === 'error' && item.text?.includes(initError))?.text })) : (_jsxs(_Fragment, { children: [_jsxs(Text, { color: Colors.AccentRed, children: ["Initialization Error: ", initError] }), _jsxs(Text, { color: Colors.AccentRed, children: [' ', "Please check API key and configuration."] })] })) })), !settings.merged.ui?.hideFooter && (_jsx(Footer, { model: lmStudioModel || currentModel, targetDir: config.getTargetDir(), debugMode: config.getDebugMode(), branchName: branchName, debugMessage: debugMessage, corgiMode: corgiMode, errorCount: errorCount, showErrorDetails: showErrorDetails, showMemoryUsage: config.getDebugMode() ||
                                settings.merged.ui?.showMemoryUsage ||
                                false, promptTokenCount: sessionStats.lastPromptTokenCount, nightly: nightly, vimMode: vimModeEnabled ? vimMode : undefined, isTrustedFolder: isTrustedFolderState }))] })] }) }));
};
//# sourceMappingURL=App.js.map