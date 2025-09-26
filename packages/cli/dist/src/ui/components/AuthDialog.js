import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { AuthType } from '@qwen-code/qwen-code-core';
import { Box, Text } from 'ink';
import { setOpenAIApiKey, setOpenAIBaseUrl, setOpenAIModel, validateAuthMethod, } from '../../config/auth.js';
import { SettingScope } from '../../config/settings.js';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';
import { ProviderKeyPrompt } from './ProviderKeyPrompt.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
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
    const [showProviderPrompt, setShowProviderPrompt] = useState(null);
    const items = [
        { label: 'Qwen OAuth', value: AuthType.QWEN_OAUTH },
        { label: 'OpenRouter (OpenAI-compatible)', value: 'openrouter' },
        { label: 'LM Studio (local)', value: 'lmstudio' },
        { label: 'OpenAI', value: AuthType.USE_OPENAI },
    ];
    const initialAuthIndex = Math.max(0, items.findIndex((item) => {
        if (settings.merged.security?.auth?.selectedType) {
            return item.value === settings.merged.security?.auth?.selectedType;
        }
        const defaultAuthType = parseDefaultAuthType(process.env['QWEN_DEFAULT_AUTH_TYPE']);
        if (defaultAuthType) {
            return item.value === defaultAuthType;
        }
        if (process.env['GEMINI_API_KEY']) {
            return item.value === AuthType.USE_GEMINI;
        }
        return item.value === AuthType.LOGIN_WITH_GOOGLE;
    }));
    const handleAuthSelect = (value) => {
        // Support both AuthType values and provider strings
        if (value === 'openrouter') {
            // Pre-populate OpenRouter base url and ask for API key
            setShowProviderPrompt({ provider: 'openrouter' });
            setErrorMessage(null);
            return;
        }
        if (value === 'lmstudio') {
            // Pre-populate LM Studio base url and a dummy API key
            setShowProviderPrompt({ provider: 'lmstudio' });
            setErrorMessage(null);
            return;
        }
        const authMethod = value;
        const error = validateAuthMethod(authMethod);
        if (error) {
            if (authMethod === AuthType.USE_OPENAI &&
                !process.env['OPENAI_API_KEY']) {
                setShowOpenAIKeyPrompt(true);
                setErrorMessage(null);
            }
            else {
                setErrorMessage(error);
            }
        }
        else {
            setErrorMessage(null);
            onSelect(authMethod, SettingScope.User);
        }
    };
    const handleOpenAIKeySubmit = (apiKey, baseUrl, model) => {
        setOpenAIApiKey(apiKey);
        setOpenAIBaseUrl(baseUrl);
        setOpenAIModel(model);
        setShowOpenAIKeyPrompt(false);
        onSelect(AuthType.USE_OPENAI, SettingScope.User);
    };
    const handleProviderSubmit = (apiKey, baseUrl) => {
        // Use the OpenAI env vars for OpenRouter/LM Studio since they are OpenAI-compatible
        setOpenAIApiKey(apiKey || '');
        setOpenAIBaseUrl(baseUrl);
        // Treat provider as OpenAI-compatible provider
        onSelect(AuthType.USE_OPENAI, SettingScope.User);
        setShowProviderPrompt(null);
    };
    const handleProviderCancel = () => {
        setShowProviderPrompt(null);
        setErrorMessage('Provider configuration canceled.');
    };
    const handleOpenAIKeyCancel = () => {
        setShowOpenAIKeyPrompt(false);
        setErrorMessage('OpenAI API key is required to use OpenAI authentication.');
    };
    useKeypress((key) => {
        if (showOpenAIKeyPrompt) {
            return;
        }
        if (key.name === 'escape') {
            // Prevent exit if there is an error message.
            // This means they user is not authenticated yet.
            if (errorMessage) {
                return;
            }
            if (settings.merged.security?.auth?.selectedType === undefined) {
                // Prevent exiting if no auth method is set
                setErrorMessage('You must select an auth method to proceed. Press Ctrl+C again to exit.');
                return;
            }
            onSelect(undefined, SettingScope.User);
        }
    }, { isActive: true });
    if (showOpenAIKeyPrompt) {
        return (_jsx(OpenAIKeyPrompt, { onSubmit: handleOpenAIKeySubmit, onCancel: handleOpenAIKeyCancel }));
    }
    if (showProviderPrompt) {
        const provider = showProviderPrompt.provider;
        const prepopulated = provider === 'openrouter'
            ? { baseUrl: 'https://openrouter.ai/api/v1', apiKey: '' }
            : { baseUrl: 'http://127.0.0.1:1234/v1', apiKey: 'lmstudio-dummy-key' };
        return (_jsx(ProviderKeyPrompt, { prepopulatedBaseUrl: prepopulated.baseUrl, prepopulatedApiKey: prepopulated.apiKey, onSubmit: handleProviderSubmit, onCancel: handleProviderCancel }));
    }
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.Gray, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, children: "Get started" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "How would you like to authenticate for this project?" }) }), _jsx(Box, { marginTop: 1, children: _jsx(RadioButtonSelect, { items: items, initialIndex: initialAuthIndex, onSelect: handleAuthSelect }) }), errorMessage && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.AccentRed, children: errorMessage }) })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.AccentPurple, children: "(Use Enter to Set Auth)" }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "Terms of Services and Privacy Notice for Qwen Code" }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.AccentBlue, children: 'https://github.com/QwenLM/Qwen3-Coder/blob/main/README.md' }) })] }));
}
//# sourceMappingURL=AuthDialog.js.map