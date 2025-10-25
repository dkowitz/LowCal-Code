/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ResearchTool, partToString, toolConfig, ToolNames, } from "@qwen-code/qwen-code-core";
import { parse } from "shell-quote";
import { CommandKind, } from "../commands/types.js";
const ALLOWED_MODES = [
    "speed",
    "balanced",
    "quality",
];
function parseResearchArgs(args) {
    const trimmed = args.trim();
    if (!trimmed) {
        return {
            error: "Research command requires a query. Usage: /research <mode> <query>\nAvailable modes: speed, balanced, quality (default is 'balanced')",
        };
    }
    let rawTokens;
    try {
        rawTokens = parse(trimmed);
    }
    catch (error) {
        return {
            error: `Failed to parse research arguments: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    const tokens = rawTokens
        .map((token) => {
        if (typeof token === "string") {
            return token;
        }
        if (typeof token === "number") {
            return String(token);
        }
        return "";
    })
        .filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return {
            error: "Research command requires a query. Usage: /research <mode> <query>\nAvailable modes: speed, balanced, quality (default is 'balanced')",
        };
    }
    const firstToken = tokens[0]?.toLowerCase();
    const isMode = (value) => ALLOWED_MODES.includes(value ?? "");
    let mode = "balanced";
    let queryTokens = tokens;
    if (isMode(firstToken)) {
        mode = firstToken;
        queryTokens = tokens.slice(1);
    }
    const query = queryTokens.join(" ").trim();
    if (!query) {
        return {
            error: "Research command requires a query. Usage: /research <mode> <query>\nAvailable modes: speed, balanced, quality (default is 'balanced')",
        };
    }
    return { mode, query };
}
function getActiveCollectionAllowlist() {
    const activeCollection = toolConfig?.activeCollection;
    if (!activeCollection) {
        return null;
    }
    if (activeCollection === "full") {
        return null;
    }
    const collections = toolConfig?.collections ?? {};
    const configured = collections[activeCollection];
    if (!Array.isArray(configured) || configured.length === 0) {
        return null;
    }
    const normalized = configured
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter((name) => name.length > 0);
    if (normalized.length === 0) {
        return null;
    }
    return new Set(normalized);
}
export const researchCommand = {
    name: "research",
    description: "Conduct deep internet research with citation support (speed, balanced, quality modes)",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const { ui } = context;
        let progressActive = false;
        const setProgress = (text) => {
            ui.setPendingItem({
                type: "info",
                text,
            });
            progressActive = true;
        };
        const clearProgress = () => {
            if (progressActive) {
                ui.setPendingItem(null);
                progressActive = false;
            }
        };
        const parsed = parseResearchArgs(args);
        if ("error" in parsed) {
            return {
                type: "message",
                messageType: "error",
                content: parsed.error,
            };
        }
        const { mode, query } = parsed;
        const config = context.services.config;
        if (!config) {
            return {
                type: "message",
                messageType: "error",
                content: "Research command requires an active configuration. Try restarting the CLI session.",
            };
        }
        const toolRegistry = config.getToolRegistry?.();
        if (!toolRegistry) {
            return {
                type: "message",
                messageType: "error",
                content: "The tool registry is unavailable, so research cannot proceed. Try running /toolset list or restarting LowCal.",
            };
        }
        const allowlist = getActiveCollectionAllowlist();
        const isAllowed = (toolName) => !allowlist || allowlist.has(toolName);
        if (!isAllowed(ToolNames.WEB_FETCH) || !toolRegistry.getTool(ToolNames.WEB_FETCH)) {
            return {
                type: "message",
                messageType: "error",
                content: "Research requires the web_fetch tool. Enable it with /toolset and try again.",
            };
        }
        const enabledSearchTools = [];
        if (isAllowed(ToolNames.WEB_SEARCH) && toolRegistry.getTool(ToolNames.WEB_SEARCH)) {
            enabledSearchTools.push(ToolNames.WEB_SEARCH);
        }
        if (isAllowed(ToolNames.SEARXNG_SEARCH) && toolRegistry.getTool(ToolNames.SEARXNG_SEARCH)) {
            enabledSearchTools.push(ToolNames.SEARXNG_SEARCH);
        }
        if (enabledSearchTools.length === 0) {
            return {
                type: "message",
                messageType: "error",
                content: "Research requires either the web_search or searxng_search tool. Enable one with /toolset and try again.",
            };
        }
        const formatToolLabel = (toolName) => toolName === ToolNames.WEB_SEARCH ? "Tavily" : "SearXNG";
        const toolLabel = enabledSearchTools
            .map((name) => formatToolLabel(name))
            .join(" + ");
        // Create the research tool with config from context
        const tool = new ResearchTool(config);
        const abortController = new AbortController();
        try {
            setProgress(`ℹ🔍 Preparing ${mode} research (${toolLabel}) – focusing on "${query}"`);
            // Execute the research tool
            const invocation = tool.build({
                mode,
                query,
                searchTools: enabledSearchTools,
            });
            const result = await invocation.execute(abortController.signal, (display) => {
                if (typeof display === "string" && display.trim().length > 0) {
                    setProgress(display);
                }
            });
            clearProgress();
            return {
                type: "message",
                messageType: "info",
                content: partToString(result.llmContent) || "No results returned from research tool.",
            };
        }
        catch (error) {
            clearProgress();
            return {
                type: "message",
                messageType: "error",
                content: `Research failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    },
};
//# sourceMappingURL=researchCommand.js.map