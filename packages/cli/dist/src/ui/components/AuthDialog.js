import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { AuthType } from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { setGeminiApiKey, setOpenAIApiKey, setOpenAIBaseUrl, setOpenAIModel, validateAuthMethod, } from "../../config/auth.js";
import { appEvents, AppEvent } from "../../utils/events.js";
import { SettingScope } from "../../config/settings.js";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { OpenAIKeyPrompt } from "./OpenAIKeyPrompt.js";
import { ProviderKeyPrompt } from "./ProviderKeyPrompt.js";
import { RadioButtonSelect } from "./shared/RadioButtonSelect.js";
import { GeminiKeyPrompt } from "./GeminiKeyPrompt.js";
const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const LM_STUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const LM_STUDIO_DUMMY_KEY = "lmstudio-local-key";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
function parseDefaultAuthType(defaultAuthType) {
    if (defaultAuthType &&
        Object.values(AuthType).includes(defaultAuthType)) {
        return defaultAuthType;
    }
    return null;
}
export function AuthDialog({ onSelect, settings, initialErrorMessage, }) {
    const [errorMessage, setErrorMessage] = useState(initialErrorMessage || null);
    const [showOpenAIKeyPrompt, setShowOpenAIKeyPrompt] = useState(false);
    const [showGeminiKeyPrompt, setShowGeminiKeyPrompt] = useState(false);
    const [showProviderPrompt, setShowProviderPrompt] = useState(null);
    const storedProviderId = settings.merged.security?.auth?.providerId;
    const providerSettings = settings.merged.security?.auth?.providers || {};
    const openaiProviderSettings = providerSettings["openai"] || {};
    const persistSelectedAuthType = (authType) => {
        try {
            settings.setValue(SettingScope.User, "security.auth.selectedType", authType);
        }
        catch {
            // ignore persistence failures; continue flow
        }
    };
    const persistProviderId = (providerId) => {
        try {
            settings.setValue(SettingScope.User, "security.auth.providerId", providerId);
        }
        catch {
            // ignore persistence failures; continue flow
        }
    };
    const persistProviderSetting = (provider, key, value) => {
        if (typeof value === "undefined") {
            return;
        }
        try {
            settings.setValue(SettingScope.User, `security.auth.providers.${provider}.${key}`, value);
        }
        catch {
            // ignore persistence failures; continue flow
        }
    };
    const snapshotOpenRouterCredentials = () => {
        const currentBaseUrl = process.env["OPENAI_BASE_URL"];
        const currentApiKey = process.env["OPENAI_API_KEY"];
        if (currentBaseUrl &&
            (storedProviderId === "openrouter" ||
                currentBaseUrl.includes("openrouter"))) {
            persistProviderSetting("openrouter", "baseUrl", currentBaseUrl);
        }
        if (currentApiKey && currentApiKey !== LM_STUDIO_DUMMY_KEY) {
            persistProviderSetting("openrouter", "apiKey", currentApiKey);
        }
    };
    const items = [
        { label: "OpenRouter (OpenAI-compatible)", value: "openrouter" },
        { label: "LM Studio (local)", value: "lmstudio" },
        { label: "OpenAI (direct)", value: AuthType.USE_OPENAI },
        { label: "Google Gemini (API key)", value: AuthType.USE_GEMINI },
    ];
    // Try to detect OpenAI-compatible provider from environment first so the
    // auth dialog can default to the provider the user last configured.
    const openaiBaseUrl = process.env["OPENAI_BASE_URL"] || "";
    let detectedProvider;
    if (openaiBaseUrl.includes("openrouter")) {
        detectedProvider = "openrouter";
    }
    else if (openaiBaseUrl.includes("127.0.0.1") ||
        openaiBaseUrl.includes("localhost") ||
        openaiBaseUrl.includes("lmstudio")) {
        detectedProvider = "lmstudio";
    }
    const storedAuthType = settings.merged.security?.auth?.selectedType;
    let preferredValue = null;
    if (storedAuthType) {
        if (storedAuthType === AuthType.USE_OPENAI) {
            if (storedProviderId) {
                preferredValue =
                    storedProviderId === "openai"
                        ? AuthType.USE_OPENAI
                        : storedProviderId;
            }
            else if (detectedProvider) {
                preferredValue = detectedProvider;
            }
            else {
                preferredValue = AuthType.USE_OPENAI;
            }
        }
        else {
            preferredValue = storedAuthType;
        }
    }
    if (!preferredValue && storedProviderId) {
        preferredValue =
            storedProviderId === "openai" ? AuthType.USE_OPENAI : storedProviderId;
    }
    if (!preferredValue && detectedProvider) {
        preferredValue = detectedProvider;
    }
    if (!preferredValue) {
        const defaultAuthType = parseDefaultAuthType(process.env["QWEN_DEFAULT_AUTH_TYPE"]);
        if (defaultAuthType) {
            preferredValue = defaultAuthType;
        }
    }
    if (!preferredValue && process.env["GEMINI_API_KEY"]) {
        preferredValue = AuthType.USE_GEMINI;
    }
    if (!preferredValue) {
        preferredValue = AuthType.LOGIN_WITH_GOOGLE;
    }
    const initialAuthIndex = Math.max(0, items.findIndex((item) => item.value === preferredValue));
    const handleAuthSelect = (value) => {
        // Support both AuthType values and provider strings
        if (value === "openrouter") {
            const openrouterConfig = providerSettings["openrouter"] || {};
            const baseUrl = openrouterConfig.baseUrl ||
                (process.env["OPENAI_BASE_URL"]?.includes("openrouter")
                    ? process.env["OPENAI_BASE_URL"]
                    : OPENROUTER_DEFAULT_BASE_URL);
            const apiKey = openrouterConfig.apiKey ||
                (storedProviderId === "openrouter"
                    ? process.env["OPENAI_API_KEY"] || ""
                    : "");
            setShowProviderPrompt({
                provider: "openrouter",
                baseUrl,
                apiKey,
            });
            setErrorMessage(null);
            return;
        }
        if (value === "lmstudio") {
            snapshotOpenRouterCredentials();
            const lmStudioConfig = providerSettings["lmstudio"] ||
                {};
            const baseUrl = lmStudioConfig.baseUrl ||
                (process.env["OPENAI_BASE_URL"]?.includes("127.0.0.1") ||
                    process.env["OPENAI_BASE_URL"]?.includes("localhost")
                    ? process.env["OPENAI_BASE_URL"]
                    : LM_STUDIO_DEFAULT_BASE_URL);
            setShowProviderPrompt({
                provider: "lmstudio",
                baseUrl,
                apiKey: LM_STUDIO_DUMMY_KEY,
                hideApiKeyInput: true,
            });
            setErrorMessage(null);
            return;
        }
        if (value === AuthType.USE_OPENAI) {
            setShowOpenAIKeyPrompt(true);
            setErrorMessage(null);
            return;
        }
        if (value === AuthType.USE_GEMINI) {
            setShowGeminiKeyPrompt(true);
            setErrorMessage(null);
            return;
        }
        const authMethod = value;
        const error = validateAuthMethod(authMethod);
        if (error) {
            setErrorMessage(error);
        }
        else {
            setErrorMessage(null);
            persistSelectedAuthType(authMethod);
            if (authMethod === AuthType.USE_OPENAI) {
                persistProviderId("openai");
                if (process.env["OPENAI_BASE_URL"]) {
                    persistProviderSetting("openai", "baseUrl", process.env["OPENAI_BASE_URL"]);
                }
                if (process.env["OPENAI_API_KEY"]) {
                    persistProviderSetting("openai", "apiKey", process.env["OPENAI_API_KEY"]);
                }
            }
            else {
                persistProviderId(undefined);
            }
            onSelect(authMethod, SettingScope.User);
        }
    };
    const handleOpenAIKeySubmit = (apiKey, baseUrl) => {
        const apiKeyPath = setOpenAIApiKey(apiKey);
        const normalizedBaseUrl = baseUrl.trim() || OPENAI_DEFAULT_BASE_URL;
        const baseUrlPath = setOpenAIBaseUrl(normalizedBaseUrl);
        const modelPath = setOpenAIModel("");
        persistSelectedAuthType(AuthType.USE_OPENAI);
        persistProviderId("openai");
        persistProviderSetting("openai", "apiKey", apiKey);
        persistProviderSetting("openai", "baseUrl", normalizedBaseUrl);
        try {
            appEvents.emit(AppEvent.ShowInfo, `Saved OpenAI credentials to: ${apiKeyPath}`);
            // Also show base url and model file locations (often same file)
            if (baseUrlPath !== apiKeyPath) {
                appEvents.emit(AppEvent.ShowInfo, `Saved OPENAI_BASE_URL to: ${baseUrlPath}`);
            }
            if (modelPath !== apiKeyPath && modelPath !== baseUrlPath) {
                appEvents.emit(AppEvent.ShowInfo, `Cleared OPENAI_MODEL in: ${modelPath}`);
            }
        }
        catch {
            // ignore emission errors
        }
        setShowOpenAIKeyPrompt(false);
        onSelect(AuthType.USE_OPENAI, SettingScope.User);
    };
    const handleGeminiKeySubmit = (apiKey) => {
        const apiKeyPath = setGeminiApiKey(apiKey);
        persistSelectedAuthType(AuthType.USE_GEMINI);
        persistProviderId(undefined);
        persistProviderSetting("gemini", "apiKey", apiKey);
        try {
            appEvents.emit(AppEvent.ShowInfo, `Saved GEMINI_API_KEY to: ${apiKeyPath}`);
        }
        catch {
            // ignore emissions
        }
        setShowGeminiKeyPrompt(false);
        onSelect(AuthType.USE_GEMINI, SettingScope.User);
    };
    const handleProviderSubmit = (apiKey, baseUrl) => {
        if (!showProviderPrompt) {
            setShowProviderPrompt(null);
            return;
        }
        const provider = showProviderPrompt.provider;
        const trimmedBaseUrl = baseUrl.trim();
        if (provider === "openrouter") {
            const normalizedBaseUrl = trimmedBaseUrl ||
                showProviderPrompt.baseUrl ||
                OPENROUTER_DEFAULT_BASE_URL;
            const safeApiKey = apiKey.trim();
            const apiKeyPath = setOpenAIApiKey(safeApiKey);
            const baseUrlPath = setOpenAIBaseUrl(normalizedBaseUrl);
            persistSelectedAuthType(AuthType.USE_OPENAI);
            persistProviderId("openrouter");
            persistProviderSetting("openrouter", "apiKey", safeApiKey);
            persistProviderSetting("openrouter", "baseUrl", normalizedBaseUrl);
            try {
                appEvents.emit(AppEvent.ShowInfo, `Saved provider credentials to: ${apiKeyPath}`);
                if (baseUrlPath !== apiKeyPath) {
                    appEvents.emit(AppEvent.ShowInfo, `Saved OPENAI_BASE_URL to: ${baseUrlPath}`);
                }
            }
            catch {
                // ignore emissions
            }
            onSelect(AuthType.USE_OPENAI, SettingScope.User);
        }
        else {
            // LM Studio branch
            const normalizedBaseUrl = trimmedBaseUrl ||
                showProviderPrompt.baseUrl ||
                LM_STUDIO_DEFAULT_BASE_URL;
            const dummyKey = LM_STUDIO_DUMMY_KEY;
            const apiKeyPath = setOpenAIApiKey(dummyKey);
            const baseUrlPath = setOpenAIBaseUrl(normalizedBaseUrl);
            persistSelectedAuthType(AuthType.USE_OPENAI);
            persistProviderId("lmstudio");
            persistProviderSetting("lmstudio", "baseUrl", normalizedBaseUrl);
            try {
                appEvents.emit(AppEvent.ShowInfo, `Configured LM Studio credentials in: ${apiKeyPath}`);
                if (baseUrlPath !== apiKeyPath) {
                    appEvents.emit(AppEvent.ShowInfo, `Saved OPENAI_BASE_URL to: ${baseUrlPath}`);
                }
            }
            catch {
                // ignore emissions
            }
            onSelect(AuthType.USE_OPENAI, SettingScope.User);
        }
        setShowProviderPrompt(null);
    };
    const handleProviderCancel = () => {
        setShowProviderPrompt(null);
        setErrorMessage("Provider configuration canceled.");
    };
    const handleOpenAIKeyCancel = () => {
        setShowOpenAIKeyPrompt(false);
        setErrorMessage("OpenAI API key is required to use OpenAI authentication.");
    };
    const handleGeminiKeyCancel = () => {
        setShowGeminiKeyPrompt(false);
        setErrorMessage("GEMINI_API_KEY is required to use Google Gemini authentication.");
    };
    useKeypress((key) => {
        if (showOpenAIKeyPrompt) {
            return;
        }
        if (key.name === "escape") {
            // Prevent exit if there is an error message.
            // This means they user is not authenticated yet.
            if (errorMessage) {
                return;
            }
            if (settings.merged.security?.auth?.selectedType === undefined) {
                // Prevent exiting if no auth method is set
                setErrorMessage("You must select an auth method to proceed. Press Ctrl+C again to exit.");
                return;
            }
            onSelect(undefined, SettingScope.User);
        }
    }, { isActive: true });
    if (showOpenAIKeyPrompt) {
        const storedBaseUrl = openaiProviderSettings.baseUrl || "";
        const isStoredOpenAI = storedBaseUrl === OPENAI_DEFAULT_BASE_URL ||
            storedBaseUrl.startsWith("https://api.openai.com");
        const defaultBaseUrl = isStoredOpenAI
            ? storedBaseUrl
            : OPENAI_DEFAULT_BASE_URL;
        const defaultApiKey = isStoredOpenAI
            ? openaiProviderSettings.apiKey || ""
            : "";
        return (_jsx(OpenAIKeyPrompt, { onSubmit: handleOpenAIKeySubmit, onCancel: handleOpenAIKeyCancel, prepopulatedApiKey: defaultApiKey, prepopulatedBaseUrl: defaultBaseUrl }));
    }
    if (showGeminiKeyPrompt) {
        const geminiProviderSettings = providerSettings["gemini"] || {};
        return (_jsx(GeminiKeyPrompt, { onSubmit: handleGeminiKeySubmit, onCancel: handleGeminiKeyCancel, prepopulatedApiKey: geminiProviderSettings.apiKey || "" }));
    }
    if (showProviderPrompt) {
        const provider = showProviderPrompt.provider;
        const baseUrl = showProviderPrompt.baseUrl ||
            (provider === "openrouter"
                ? OPENROUTER_DEFAULT_BASE_URL
                : LM_STUDIO_DEFAULT_BASE_URL);
        const apiKey = provider === "openrouter"
            ? showProviderPrompt.apiKey
            : showProviderPrompt.apiKey || LM_STUDIO_DUMMY_KEY;
        return (_jsx(ProviderKeyPrompt, { prepopulatedBaseUrl: baseUrl, prepopulatedApiKey: apiKey, hideApiKeyInput: showProviderPrompt.hideApiKeyInput, onSubmit: handleProviderSubmit, onCancel: handleProviderCancel }));
    }
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.Gray, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, children: "Get started" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "How would you like to authenticate for this project?" }) }), _jsx(Box, { marginTop: 1, children: _jsx(RadioButtonSelect, { items: items, initialIndex: initialAuthIndex, onSelect: handleAuthSelect }) }), errorMessage && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.AccentRed, children: errorMessage }) })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.AccentPurple, children: "(Use Enter to Set Auth)" }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "Terms of Services and Privacy Notice for Qwen Code" }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.AccentBlue, children: "https://github.com/QwenLM/Qwen3-Coder/blob/main/README.md" }) })] }));
}
//# sourceMappingURL=AuthDialog.js.map