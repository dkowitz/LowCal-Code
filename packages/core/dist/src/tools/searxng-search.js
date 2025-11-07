/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolConfirmationOutcome, } from "./tools.js";
import { ApprovalMode } from "../config/config.js";
import { getErrorMessage } from "../utils/errors.js";
import { ToolNames } from "./tool-names.js";
import { spawn, execSync } from "node:child_process";
class SearXNGSearchToolInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return `Searching the web with SearXNG for: "${this.params.query}"`;
    }
    async shouldConfirmExecute(_abortSignal) {
        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }
        const confirmationDetails = {
            type: "info",
            title: "Confirm SearXNG Search",
            prompt: `Search the web with SearXNG for: "${this.params.query}"`,
            onConfirm: async (outcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
                }
            },
        };
        return confirmationDetails;
    }
    /**
     * Checks if Docker is installed and available
     */
    async isDockerAvailable() {
        try {
            execSync("docker --version", { stdio: "ignore" });
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Checks if the SearXNG container is running
     */
    async isSearXNGRunning() {
        try {
            const output = execSync("docker ps --format '{{.Names}}'", {
                stdio: "pipe",
                encoding: "utf8"
            });
            // Check if searxng container is in the list
            return output.includes("searxng");
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Starts the SearXNG Docker container
     */
    async startSearXNG() {
        try {
            // Check if docker is available first
            const dockerAvailable = await this.isDockerAvailable();
            if (!dockerAvailable) {
                throw new Error("Docker is not installed or not in PATH. Please install Docker to use SearXNG search.");
            }
            // Start the container using our compose file
            spawn("docker", ["compose", "-f", "docker-compose.searxng.yml", "up", "-d"], {
                stdio: "ignore",
                detached: true,
            });
            console.log("Starting SearXNG container...");
        }
        catch (error) {
            throw new Error(`Failed to start SearXNG container: ${getErrorMessage(error)}`);
        }
    }
    /**
     * Waits for the SearXNG service to be ready
     */
    async waitForSearXNGReady() {
        const maxRetries = 30; // Wait up to 30 seconds (30 * 1 second)
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const response = await fetch("http://localhost:8085", {
                    method: "GET"
                });
                if (response.ok) {
                    return; // Service is ready
                }
            }
            catch (error) {
                // Ignore errors and continue waiting
            }
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
        throw new Error("SearXNG service did not become available within the expected time");
    }
    async execute(signal) {
        try {
            // Check if SearXNG container is running, start it if needed
            const isRunning = await this.isSearXNGRunning();
            if (!isRunning) {
                console.log("SearXNG container not found. Starting it now...");
                await this.startSearXNG();
                // Wait for the service to be ready
                await this.waitForSearXNGReady();
            }
            // Make request to local SearXNG instance
            // Use GET request with query parameters as per SearXNG API documentation
            const searchUrl = new URL("http://localhost:8085/search");
            searchUrl.searchParams.append("q", this.params.query);
            searchUrl.searchParams.append("format", "json");
            searchUrl.searchParams.append("lang", "en");
            searchUrl.searchParams.append("language", "en-US");
            searchUrl.searchParams.append("locale", "en_US");
            searchUrl.searchParams.append("safesearch", "1");
            searchUrl.searchParams.append("categories", "general");
            searchUrl.searchParams.append("max_results", "20");
            searchUrl.searchParams.append("engines", "google,bing,duckduckgo,brave,startpage,yahoo,mullvadleta,mullvadleta brave"); // Use all available engines
            const response = await fetch(searchUrl.toString(), {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "User-Agent": "LowCal-SearXNG-Client/1.0"
                },
                signal,
            });
            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(`SearXNG API error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`);
            }
            const data = (await response.json());
            const isLikelyEnglish = (text) => {
                const sample = text.slice(0, 200);
                if (!sample)
                    return true;
                const asciiMatches = sample.match(/[A-Za-z0-9\s.,'"-]/g)?.length ?? 0;
                return asciiMatches / sample.length >= 0.7;
            };
            const filteredResults = (data.results || [])
                .filter((r) => isLikelyEnglish(`${r.title ?? ""} ${r.content ?? ""}`))
                .slice(0, 20);
            const sources = filteredResults.map((r) => ({
                title: r.title || "Untitled",
                url: r.url || "",
            }));
            const sourceListFormatted = sources.map((s, i) => `[${i + 1}] ${s.title} (${s.url})`);
            // Build content from answers first, then fallback to results
            let content = "";
            // Add answers if available
            if (data.answers && data.answers.length > 0) {
                content = data.answers
                    .map((answer) => `${answer.answer} (from ${answer.engine})`)
                    .join("\n\n");
            }
            // If no answers, build summary from top results with content snippets
            if (!content.trim()) {
                const topSources = sources.slice(0, 8);
                content = topSources
                    .slice(0, 3)
                    .map((s, i) => {
                    const result = filteredResults[i];
                    const snippet = result?.content ? ` - ${result.content.substring(0, 150)}...` : "";
                    return `${i + 1}. ${s.title}${snippet}`;
                })
                    .join("\n");
            }
            // Add suggestions if available
            if (data.suggestions && data.suggestions.length > 0) {
                content += `\n\nSuggestions: ${data.suggestions.join(", ")}`;
            }
            // Add sources
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
                llmContent: `SearXNG search results for "${this.params.query}":\n\n${content}`,
                returnDisplay: `Search results for "${this.params.query}" returned ${data.number_of_results || 0} results.`,
                sources,
            };
        }
        catch (error) {
            const errorMessage = `Error during SearXNG web search for query "${this.params.query}": ${getErrorMessage(error)}`;
            console.error(errorMessage, error);
            // If Docker isn't available or container can't be started, provide helpful message
            if (error instanceof Error &&
                (error.message.includes("Docker is not installed") ||
                    error.message.includes("command not found"))) {
                return {
                    llmContent: `Error: ${errorMessage}\n\nPlease install Docker to use SearXNG search functionality.`,
                    returnDisplay: "SearXNG search requires Docker installation.",
                };
            }
            return {
                llmContent: `Error: ${errorMessage}`,
                returnDisplay: "Error performing SearXNG web search.",
            };
        }
    }
}
/**
 * A tool to perform web searches using the local SearXNG instance.
 */
export class SearXNGSearchTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.SEARXNG_SEARCH;
    constructor(config) {
        super(SearXNGSearchTool.Name, "SearXNGSearch", "Performs a web search using the local SearXNG instance and returns results with sources. Requires Docker to be installed.", Kind.Search, {
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
     * Validates the parameters for the SearXNGSearchTool.
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
        return new SearXNGSearchToolInvocation(this.config, params);
    }
}
//# sourceMappingURL=searxng-search.js.map