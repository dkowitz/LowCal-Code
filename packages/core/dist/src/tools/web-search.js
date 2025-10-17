/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolConfirmationOutcome, } from "./tools.js";
import { ApprovalMode } from "../config/config.js";
import { getErrorMessage } from "../utils/errors.js";
import { ToolNames } from "./tool-names.js";
class WebSearchToolInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return `Searching the web for: "${this.params.query}"`;
    }
    async shouldConfirmExecute(_abortSignal) {
        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }
        const confirmationDetails = {
            type: "info",
            title: "Confirm Web Search",
            prompt: `Search the web for: "${this.params.query}"`,
            onConfirm: async (outcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
                }
            },
        };
        return confirmationDetails;
    }
    async execute(signal) {
        const apiKey = this.config.getTavilyApiKey() || process.env["TAVILY_API_KEY"];
        if (!apiKey) {
            return {
                llmContent: "Web search is disabled because TAVILY_API_KEY is not configured. Please set it in your settings.json, .env file, or via --tavily-api-key command line argument to enable web search.",
                returnDisplay: "Web search disabled. Configure TAVILY_API_KEY to enable Tavily search.",
            };
        }
        try {
            const response = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    api_key: apiKey,
                    query: this.params.query,
                    search_depth: "advanced",
                    max_results: 5,
                    include_answer: true,
                }),
                signal,
            });
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(`Tavily API error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
            }
            const data = (await response.json());
            const sources = (data.results || []).map((r) => ({
                title: r.title,
                url: r.url,
            }));
            const sourceListFormatted = sources.map((s, i) => `[${i + 1}] ${s.title || "Untitled"} (${s.url})`);
            let content = data.answer?.trim() || "";
            if (!content) {
                // Fallback: build a concise summary from top results
                content = sources
                    .slice(0, 3)
                    .map((s, i) => `${i + 1}. ${s.title} - ${s.url}`)
                    .join("\n");
            }
            if (sourceListFormatted.length > 0) {
                content += `\n\nSources:\n${sourceListFormatted.join("\n")}`;
            }
            if (!content.trim()) {
                return {
                    llmContent: `No search results or information found for query: "${this.params.query}"`,
                    returnDisplay: "No information found.",
                };
            }
            return {
                llmContent: `Web search results for "${this.params.query}":\n\n${content}`,
                returnDisplay: `Search results for "${this.params.query}" returned.`,
                sources,
            };
        }
        catch (error) {
            const errorMessage = `Error during web search for query "${this.params.query}": ${getErrorMessage(error)}`;
            console.error(errorMessage, error);
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: `Error performing web search.`,
            };
        }
    }
}
/**
 * A tool to perform web searches using Google Search via the Gemini API.
 */
export class WebSearchTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.WEB_SEARCH;
    constructor(config) {
        super(WebSearchTool.Name, "WebSearch", "Performs a web search using the Tavily API and returns a concise answer with sources. Requires the TAVILY_API_KEY environment variable.", Kind.Search, {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query to find information on the web.",
                },
            },
            required: ["query"],
        });
        this.config = config;
    }
    /**
     * Validates the parameters for the WebSearchTool.
     * @param params The parameters to validate
     * @returns An error message string if validation fails, null if valid
     */
    validateToolParamValues(params) {
        if (!params.query || params.query.trim() === "") {
            return "The 'query' parameter cannot be empty.";
        }
        return null;
    }
    createInvocation(params) {
        return new WebSearchToolInvocation(this.config, params);
    }
}
//# sourceMappingURL=web-search.js.map