/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind } from "./types.js";
import fs from "node:fs";
import path from "node:path";
export const exportCommand = {
    name: "export",
    description: "save the current conversation to a markdown file in ./conversations. Options: [compact] (user/assistant only), [report] (first user + final assistant responses), [filename.md]",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const history = context.ui.getHistory();
        if (history.length === 0) {
            context.ui.addItem({
                type: "info",
                text: "No conversation history to export.",
            }, Date.now());
            return;
        }
        // Parse args
        const argParts = (args || "").trim().split(/\s+/).filter(Boolean);
        let option = null;
        let providedFileName = null;
        if (argParts.length === 0) {
            option = null;
        }
        else if (["compact", "report"].includes(argParts[0].toLowerCase())) {
            option = argParts[0].toLowerCase();
            if (argParts.length > 1) {
                providedFileName = argParts.slice(1).join(" ");
            }
        }
        else {
            // If the first arg is not a recognized option, treat the entire args string as the filename.
            providedFileName = argParts.join(" ");
        }
        // Validate option
        if (option && !["compact", "report"].includes(option)) {
            context.ui.addItem({
                type: "error",
                text: `Invalid option '${option}'. Use 'compact' or 'report'.`,
            }, Date.now());
            return;
        }
        // Determine filename
        let fileName;
        if (providedFileName) {
            fileName = providedFileName.trim();
            // Sanitize filename
            fileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
            if (!fileName.endsWith(".md")) {
                fileName += ".md";
            }
        }
        else {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const prefix = option || "conversation";
            fileName = `${prefix}-${timestamp}.md`;
        }
        // Determine output directory based on option
        const exportDir = option === "report"
            ? path.join(process.cwd(), "reports")
            : path.join(process.cwd(), "conversations");
        fs.mkdirSync(exportDir, { recursive: true });
        const fullPath = path.join(exportDir, fileName);
        // Format markdown content
        let markdownContent = `# Qwen Code Conversation Export\n\n`;
        const now = new Date();
        markdownContent += `**Exported:** ${now.toLocaleString()}\n`;
        markdownContent += `**Session ID:** ${context.services.config?.getSessionId() || "unknown"}\n`;
        markdownContent += `**Mode:** ${option || "full"}\n\n`;
        let filteredHistory = [];
        if (option === "compact") {
            // Only user and assistant messages
            filteredHistory = history.filter((item) => (item.type === "user" ||
                item.type === "gemini" ||
                item.type === "gemini_content") &&
                item.text);
        }
        else if (option === "report") {
            // Report: first non-slash user message + all assistant messages after the last user message
            const firstUser = history.find((item) => item.type === "user" &&
                typeof item.text === "string" &&
                !item.text.trim().startsWith("/"));
            if (firstUser && firstUser.text) {
                filteredHistory.push(firstUser);
            }
            // Find the index of the last *non‑slash* user message in the conversation.
            // Slash commands (messages starting with '/') are not considered when determining
            // the trailing assistant responses for a report export. This ensures that the
            // final assistant reply before the command is captured.
            let lastUserIndex = -1;
            for (let i = history.length - 1; i >= 0; i--) {
                const item = history[i];
                if (item.type === "user" &&
                    typeof item.text === "string" &&
                    !item.text.trim().startsWith("/")) {
                    lastUserIndex = i;
                    break;
                }
            }
            // Add all assistant messages after the last user message
            const startIdx = lastUserIndex === -1 ? 0 : lastUserIndex + 1;
            const trailingAssistants = history
                .slice(startIdx)
                .filter((item) => (item.type === "gemini" || item.type === "gemini_content") &&
                item.text);
            filteredHistory = filteredHistory.concat(trailingAssistants);
        }
        else {
            // Full history
            filteredHistory = [...history];
        }
        // Process filtered history
        for (const item of filteredHistory) {
            switch (item.type) {
                case "user":
                    if (item.text) {
                        // Preserve original formatting of user messages
                        markdownContent += `## User Message\n\n${item.text}\n\n---\n\n`;
                    }
                    break;
                case "gemini":
                case "gemini_content":
                    if (item.text) {
                        // Preserve original formatting of assistant responses
                        markdownContent += `## Assistant Response\n\n${item.text}\n\n---\n\n`;
                    }
                    break;
                case "info":
                    if (item.text) {
                        markdownContent += `### Info\n\n> ${item.text.trim()}\n\n`;
                    }
                    break;
                case "error":
                    if (item.text) {
                        markdownContent += `### Error\n\n**Error:** ${item.text.trim()}\n\n`;
                    }
                    break;
                case "tool_group":
                case "tool":
                case "tool_call":
                case "tool_call_request":
                case "tool_stats":
                    // Normalize to an array of tool displays
                    markdownContent += `### Tool Execution\n\n`;
                    const toolsArray = [];
                    if (item.tools && Array.isArray(item.tools)) {
                        toolsArray.push(...item.tools);
                    }
                    else if (item.name) {
                        // Single-tool shape
                        toolsArray.push({
                            name: item.name,
                            resultDisplay: item.resultDisplay ||
                                item.result ||
                                undefined,
                        });
                    }
                    for (const tool of toolsArray) {
                        markdownContent += `**Tool:** ${tool.name}\n`;
                        if (tool.resultDisplay) {
                            markdownContent += `**Result:** ${typeof tool.resultDisplay === "string" ? tool.resultDisplay : JSON.stringify(tool.resultDisplay)}\n`;
                        }
                        markdownContent += `\n`;
                    }
                    markdownContent += `---\n\n`;
                    break;
                default:
                    if (item.text) {
                        markdownContent += `### ${String(item.type).toUpperCase()}\n\n${item.text.trim()}\n\n---\n\n`;
                    }
                    break;
            }
        }
        try {
            fs.writeFileSync(fullPath, markdownContent, "utf8");
            const dirName = option === "report" ? "./reports" : "./conversations";
            context.ui.addItem({
                type: "info",
                text: `✅ Conversation exported successfully to ${dirName}/\`${fileName}\``,
            }, Date.now());
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            context.ui.addItem({
                type: "error",
                text: `❌ Failed to export conversation: ${errorMsg}`,
            }, Date.now());
        }
    },
};
//# sourceMappingURL=exportCommand.js.map