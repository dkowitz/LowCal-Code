import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
export function ProviderKeyPrompt({ prepopulatedBaseUrl, prepopulatedApiKey, onSubmit, onCancel, }) {
    const [apiKey, setApiKey] = useState(prepopulatedApiKey || '');
    const [baseUrl, setBaseUrl] = useState(prepopulatedBaseUrl || '');
    const [currentField, setCurrentField] = useState(prepopulatedApiKey ? 'baseUrl' : 'apiKey');
    useInput((input, key) => {
        let cleanInput = (input || '')
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\[200~/g, '')
            .replace(/\[201~/g, '')
            .replace(/^\[|~$/g, '');
        cleanInput = cleanInput
            .split('')
            .filter((ch) => ch.charCodeAt(0) >= 32)
            .join('');
        if (cleanInput.length > 0) {
            if (currentField === 'apiKey')
                setApiKey((p) => p + cleanInput);
            else
                setBaseUrl((p) => p + cleanInput);
            return;
        }
        if (input.includes('\n') || input.includes('\r')) {
            if (currentField === 'apiKey')
                setCurrentField('baseUrl');
            else
                onSubmit(apiKey.trim(), baseUrl.trim());
            return;
        }
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.tab) {
            setCurrentField((c) => (c === 'apiKey' ? 'baseUrl' : 'apiKey'));
            return;
        }
        if (key.upArrow || key.downArrow) {
            setCurrentField((c) => (c === 'apiKey' ? 'baseUrl' : 'apiKey'));
            return;
        }
        if (key.backspace || key.delete) {
            if (currentField === 'apiKey')
                setApiKey((p) => p.slice(0, -1));
            else
                setBaseUrl((p) => p.slice(0, -1));
            return;
        }
    });
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentBlue, children: "Provider Configuration" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "Enter the provider base URL and API key (if required). For LM Studio the API key is optional and a dummy key is prefilled." }) }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 12, children: _jsx(Text, { color: currentField === 'apiKey' ? Colors.AccentBlue : Colors.Gray, children: "API Key:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === 'apiKey' ? '> ' : '  ', apiKey || ' '] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 12, children: _jsx(Text, { color: currentField === 'baseUrl' ? Colors.AccentBlue : Colors.Gray, children: "Base URL:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === 'baseUrl' ? '> ' : '  ', baseUrl] }) })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to continue, Tab/\u2191\u2193 to navigate, Esc to cancel" }) })] }));
}
export default ProviderKeyPrompt;
//# sourceMappingURL=ProviderKeyPrompt.js.map