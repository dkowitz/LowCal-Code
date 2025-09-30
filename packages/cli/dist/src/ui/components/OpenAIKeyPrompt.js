import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Colors } from "../colors.js";
export function OpenAIKeyPrompt({ onSubmit, onCancel, }) {
    const [apiKey, setApiKey] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [model, setModel] = useState("");
    const [currentField, setCurrentField] = useState("apiKey");
    useInput((input, key) => {
        // 过滤粘贴相关的控制序列
        let cleanInput = (input || "")
            // 过滤 ESC 开头的控制序列（如 \u001b[200~、\u001b[201~ 等）
            .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "") // eslint-disable-line no-control-regex
            // 过滤粘贴开始标记 [200~
            .replace(/\[200~/g, "")
            // 过滤粘贴结束标记 [201~
            .replace(/\[201~/g, "")
            // 过滤单独的 [ 和 ~ 字符（可能是粘贴标记的残留）
            .replace(/^\[|~$/g, "");
        // 再过滤所有不可见字符（ASCII < 32，除了回车换行）
        cleanInput = cleanInput
            .split("")
            .filter((ch) => ch.charCodeAt(0) >= 32)
            .join("");
        if (cleanInput.length > 0) {
            if (currentField === "apiKey") {
                setApiKey((prev) => prev + cleanInput);
            }
            else if (currentField === "baseUrl") {
                setBaseUrl((prev) => prev + cleanInput);
            }
            else if (currentField === "model") {
                setModel((prev) => prev + cleanInput);
            }
            return;
        }
        // 检查是否是 Enter 键（通过检查输入是否包含换行符）
        if (input.includes("\n") || input.includes("\r")) {
            if (currentField === "apiKey") {
                // 允许空 API key 跳转到下一个字段，让用户稍后可以返回修改
                setCurrentField("baseUrl");
                return;
            }
            else if (currentField === "baseUrl") {
                setCurrentField("model");
                return;
            }
            else if (currentField === "model") {
                // 只有在提交时才检查 API key 是否为空
                if (apiKey.trim()) {
                    onSubmit(apiKey.trim(), baseUrl.trim(), model.trim());
                }
                else {
                    // 如果 API key 为空，回到 API key 字段
                    setCurrentField("apiKey");
                }
            }
            return;
        }
        if (key.escape) {
            onCancel();
            return;
        }
        // Handle Tab key for field navigation
        if (key.tab) {
            if (currentField === "apiKey") {
                setCurrentField("baseUrl");
            }
            else if (currentField === "baseUrl") {
                setCurrentField("model");
            }
            else if (currentField === "model") {
                setCurrentField("apiKey");
            }
            return;
        }
        // Handle arrow keys for field navigation
        if (key.upArrow) {
            if (currentField === "baseUrl") {
                setCurrentField("apiKey");
            }
            else if (currentField === "model") {
                setCurrentField("baseUrl");
            }
            return;
        }
        if (key.downArrow) {
            if (currentField === "apiKey") {
                setCurrentField("baseUrl");
            }
            else if (currentField === "baseUrl") {
                setCurrentField("model");
            }
            return;
        }
        // Handle backspace - check both key.backspace and delete key
        if (key.backspace || key.delete) {
            if (currentField === "apiKey") {
                setApiKey((prev) => prev.slice(0, -1));
            }
            else if (currentField === "baseUrl") {
                setBaseUrl((prev) => prev.slice(0, -1));
            }
            else if (currentField === "model") {
                setModel((prev) => prev.slice(0, -1));
            }
            return;
        }
    });
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", padding: 1, width: "100%", children: [_jsx(Text, { bold: true, color: Colors.AccentBlue, children: "OpenAI Configuration Required" }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: ["Please enter your OpenAI configuration. You can get an API key from", " ", _jsx(Text, { color: Colors.AccentBlue, children: "https://bailian.console.aliyun.com/?tab=model#/api-key" })] }) }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 12, children: _jsx(Text, { color: currentField === "apiKey" ? Colors.AccentBlue : Colors.Gray, children: "API Key:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "apiKey" ? "> " : "  ", apiKey || " "] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 12, children: _jsx(Text, { color: currentField === "baseUrl" ? Colors.AccentBlue : Colors.Gray, children: "Base URL:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "baseUrl" ? "> " : "  ", baseUrl] }) })] }), _jsxs(Box, { marginTop: 1, flexDirection: "row", children: [_jsx(Box, { width: 12, children: _jsx(Text, { color: currentField === "model" ? Colors.AccentBlue : Colors.Gray, children: "Model:" }) }), _jsx(Box, { flexGrow: 1, children: _jsxs(Text, { children: [currentField === "model" ? "> " : "  ", model] }) })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: Colors.Gray, children: "Press Enter to continue, Tab/\u2191\u2193 to navigate, Esc to cancel" }) })] }));
}
//# sourceMappingURL=OpenAIKeyPrompt.js.map