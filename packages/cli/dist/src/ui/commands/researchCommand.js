/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ResearchTool, partToString, toolConfig, ToolNames, } from "@qwen-code/qwen-code-core";
import React from "react";
import { Box, Text } from "ink";
import { parse } from "shell-quote";
import { CommandKind } from "../commands/types.js";
import { Colors } from "../colors.js";
const ALLOWED_MODES = [
    "speed",
    "balanced",
    "quality",
    "max",
];
function stripJsonFence(text) {
    return text
        .replace(/^\s*```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
}
function isComplexQuery(query) {
    const normalized = query.trim();
    if (!normalized) {
        return false;
    }
    const wordCount = normalized.split(/\s+/u).length;
    const sentenceCount = normalized.split(/[.!?]+/u).filter(Boolean).length;
    const conjunctions = /\b(and|or|versus|compare|vs\.?|along with|as well as)\b/iu;
    const hasConjunctions = conjunctions.test(normalized);
    const hasMultiClause = normalized.includes(";") || normalized.includes(":");
    return (wordCount >= 12 || sentenceCount >= 2 || hasConjunctions || hasMultiClause);
}
function parseResearchArgs(args) {
    const trimmed = args.trim();
    if (!trimmed) {
        return {
            error: "Research command requires a query. Usage: /research <mode> <query> [--clarify|--no-clarify]\nAvailable modes: speed, balanced, quality, max (default is 'balanced')",
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
            error: "Research command requires a query. Usage: /research <mode> <query> [--clarify|--no-clarify]\nAvailable modes: speed, balanced, quality, max (default is 'balanced')",
        };
    }
    let clarifyMode = "auto";
    const filteredTokens = tokens.filter((token) => {
        const normalized = token.toLowerCase();
        if (normalized === "--clarify") {
            clarifyMode = "force";
            return false;
        }
        if (normalized === "--no-clarify") {
            clarifyMode = "skip";
            return false;
        }
        return true;
    });
    if (filteredTokens.length === 0) {
        return {
            error: "Research command requires a query. Usage: /research <mode> <query> [--clarify|--no-clarify]\nAvailable modes: speed, balanced, quality, max (default is 'balanced')",
        };
    }
    const firstToken = filteredTokens[0]?.toLowerCase();
    const isMode = (value) => ALLOWED_MODES.includes(value ?? "");
    let mode = "balanced";
    let queryTokens = filteredTokens;
    if (isMode(firstToken)) {
        mode = firstToken;
        queryTokens = filteredTokens.slice(1);
    }
    const query = queryTokens.join(" ").trim();
    if (!query) {
        return {
            error: "Research command requires a query. Usage: /research <mode> <query> [--clarify|--no-clarify]\nAvailable modes: speed, balanced, quality, max (default is 'balanced')",
        };
    }
    return { mode, query, clarifyMode };
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
    description: "Conduct deep internet research with citation support (speed, balanced, quality, max modes)",
    kind: CommandKind.BUILT_IN,
    action: async (context, args) => {
        const { ui } = context;
        let progressActive = false;
        const progressLines = [];
        const startTime = Date.now();
        const setProgress = (text, persist = true) => {
            const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
            const elapsedLabel = `${elapsedSec}s`;
            const line = `[${elapsedLabel}] ${text}`;
            if (persist) {
                progressLines.push(line);
            }
            else if (progressLines.length > 0) {
                progressLines[progressLines.length - 1] = line;
            }
            else {
                progressLines.push(line);
            }
            ui.setPendingItem({
                type: "info",
                text: progressLines.join("\n"),
            });
            progressActive = true;
        };
        const clearProgress = () => {
            if (progressActive) {
                progressLines.length = 0;
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
        const { mode, query, clarifyMode } = parsed;
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
        if (!isAllowed(ToolNames.WEB_FETCH) ||
            !toolRegistry.getTool(ToolNames.WEB_FETCH)) {
            return {
                type: "message",
                messageType: "error",
                content: "Research requires the web_fetch tool. Enable it with /toolset and try again.",
            };
        }
        const enabledSearchTools = [];
        if (isAllowed(ToolNames.WEB_SEARCH) &&
            toolRegistry.getTool(ToolNames.WEB_SEARCH)) {
            enabledSearchTools.push(ToolNames.WEB_SEARCH);
        }
        if (isAllowed(ToolNames.SEARXNG_SEARCH) &&
            toolRegistry.getTool(ToolNames.SEARXNG_SEARCH)) {
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
        if (mode === "max" && clarifyMode !== "skip") {
            const geminiClient = config.getGeminiClient?.();
            if (geminiClient) {
                try {
                    const abortController = new AbortController();
                    const complexityHigh = isComplexQuery(query);
                    const forceQuestions = clarifyMode === "force" || complexityHigh;
                    const clarifyPrompt = forceQuestions
                        ? `
You are a research assistant preparing a deep-dive investigation. Generate clarifying questions that would materially improve scope, framing, or depth.

Return valid JSON only with this schema:
{
  "reason": "Short reason",
  "questions": ["Question 1", "Question 2"]
}

Guidelines:
- Provide 2-4 questions.
- Questions should narrow scope, define priorities, or uncover constraints.
- Avoid generic questions that don't change research direction.

User request:
${query}
`
                        : `
You are a research assistant. Decide if the user should clarify their request before a deep research run.

Return valid JSON only with this schema:
{
  "should_clarify": true,
  "reason": "Short reason",
  "questions": ["Question 1", "Question 2"]
}

Guidelines:
- Ask clarifying questions when it would materially change scope or outcomes.
- Keep to 1-4 questions.
- If no clarification is needed, set should_clarify to false and questions to [].

User request:
${query}
`;
                    const response = await geminiClient.generateContent([{ role: "user", parts: [{ text: clarifyPrompt }] }], {}, abortController.signal);
                    const candidates = response
                        .response?.candidates ??
                        response.candidates ??
                        [];
                    const parts = Array.isArray(candidates)
                        ? (candidates[0]?.content
                            ?.parts ?? [])
                        : [];
                    const raw = Array.isArray(parts)
                        ? parts
                            .map((part) => typeof part === "string"
                            ? part
                            : part && typeof part === "object" && "text" in part
                                ? String(part.text ?? "")
                                : "")
                            .join("")
                        : "";
                    const parsedResponse = raw ? JSON.parse(stripJsonFence(raw)) : null;
                    const shouldClarify = forceQuestions
                        ? true
                        : Boolean(parsedResponse?.should_clarify);
                    const questions = Array.isArray(parsedResponse?.questions)
                        ? parsedResponse.questions
                            .map((item) => String(item).trim())
                            .filter(Boolean)
                        : [];
                    const reason = typeof parsedResponse?.reason === "string"
                        ? parsedResponse.reason.trim()
                        : "";
                    let finalQuestions = questions;
                    let finalReason = reason;
                    if (forceQuestions && finalQuestions.length === 0) {
                        const retryPrompt = `
Generate 2-3 concrete clarifying questions that would materially improve the research scope.
Return valid JSON only:
{
  "reason": "Short reason",
  "questions": ["Question 1", "Question 2"]
}

User request:
${query}
`;
                        const retryResponse = await geminiClient.generateContent([{ role: "user", parts: [{ text: retryPrompt }] }], {}, abortController.signal);
                        const retryCandidates = retryResponse.response?.candidates ??
                            retryResponse
                                .candidates ??
                            [];
                        const retryParts = Array.isArray(retryCandidates)
                            ? (retryCandidates[0]
                                ?.content?.parts ?? [])
                            : [];
                        const retryRaw = Array.isArray(retryParts)
                            ? retryParts
                                .map((part) => typeof part === "string"
                                ? part
                                : part && typeof part === "object" && "text" in part
                                    ? String(part.text ?? "")
                                    : "")
                                .join("")
                            : "";
                        const retryParsed = retryRaw
                            ? JSON.parse(stripJsonFence(retryRaw))
                            : null;
                        finalQuestions = Array.isArray(retryParsed?.questions)
                            ? retryParsed.questions
                                .map((item) => String(item).trim())
                                .filter(Boolean)
                            : finalQuestions;
                        if (typeof retryParsed?.reason === "string" &&
                            retryParsed.reason.trim().length > 0) {
                            finalReason = retryParsed.reason.trim();
                        }
                    }
                    if (shouldClarify && finalQuestions.length > 0) {
                        const prompt = React.createElement(Box, { flexDirection: "column" }, React.createElement(Text, { color: Colors.AccentBlue }, "Clarifying questions for /research max"), finalReason
                            ? React.createElement(Text, { color: Colors.Gray }, `Reason: ${finalReason}`)
                            : null, React.createElement(Box, { flexDirection: "column", marginTop: 1 }, ...finalQuestions.map((item, index) => React.createElement(Text, { key: `${index}-${item}` }, `- ${item}`))));
                        return {
                            type: "input_request",
                            prompt,
                            placeholder: "Answer the questions above...",
                            command: {
                                name: "research",
                                mode,
                                query,
                                appendAnswerToQuery: true,
                                answerPreamble: "Clarifying answers",
                                extraArgs: ["--no-clarify"],
                            },
                        };
                    }
                }
                catch (_error) {
                    // If clarification fails, proceed with research.
                }
            }
        }
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
                if (typeof display !== "string") {
                    return;
                }
                const trimmed = display.trim();
                if (!trimmed) {
                    return;
                }
                const progressPrefix = "__progress__";
                if (trimmed.startsWith(progressPrefix)) {
                    try {
                        const payload = JSON.parse(trimmed.slice(progressPrefix.length));
                        const message = typeof payload.message === "string" ? payload.message : trimmed;
                        const persist = payload.mode !== "replace";
                        setProgress(message, persist);
                        return;
                    }
                    catch {
                        // fall through to default handling
                    }
                }
                setProgress(trimmed);
            });
            clearProgress();
            return {
                type: "message",
                messageType: "info",
                content: partToString(result.llmContent) ||
                    "No results returned from research tool.",
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