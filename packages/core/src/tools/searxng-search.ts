/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolInvocation,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolInfoConfirmationDetails,
  ToolConfirmationOutcome,
} from "./tools.js";

import type { Config } from "../config/config.js";
import { ApprovalMode } from "../config/config.js";
import { getErrorMessage } from "../utils/errors.js";
import { ToolNames } from "./tool-names.js";
import { spawn, execSync } from "node:child_process";

interface SearXNGResultItem {
  url: string;
  title: string;
  content: string;
  engine: string;
  template: string;
  parsed_url: string[];
  img_src: string;
  thumbnail: string;
  priority: string;
  engines: string[];
  positions: number[];
  score: number;
  category: string;
  publishedDate?: string;
  pubdate?: string;
}

interface SearXNGSearchResponse {
  query: string;
  number_of_results: number;
  results: SearXNGResultItem[];
  answers?: Array<{
    query: string;
    answer: string;
    engine: string;
  }>;
  corrections?: Array<{
    query: string;
    corrected_query: string;
  }>;
  infoboxes?: Array<{
    infobox: string;
    id: string;
    content: unknown;
  }>;
  suggestions?: string[];
  unresponsive_engines?: string[];
}

/**
 * Parameters for the SearXNGSearchTool.
 */
export interface SearXNGSearchToolParams {
  /**
   * The search query.
   */
  query: string;
}

/**
 * Extends ToolResult to include sources for web search.
 */
export interface SearXNGSearchToolResult extends ToolResult {
  sources?: Array<{ title: string; url: string }>;
}

class SearXNGSearchToolInvocation extends BaseToolInvocation<
  SearXNGSearchToolParams,
  SearXNGSearchToolResult
> {
  constructor(
    private readonly config: Config,
    params: SearXNGSearchToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    return `Searching the web with SearXNG for: "${this.params.query}"`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const confirmationDetails: ToolInfoConfirmationDetails = {
      type: "info",
      title: "Confirm SearXNG Search",
      prompt: `Search the web with SearXNG for: "${this.params.query}"`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
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
  private async isDockerAvailable(): Promise<boolean> {
    try {
      execSync("docker --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if the SearXNG container is running
   */
  private async isSearXNGRunning(): Promise<boolean> {
    try {
      const output = execSync("docker ps --format '{{.Names}}'", {
        stdio: "pipe",
        encoding: "utf8",
      });

      // Check if searxng container is in the list
      return output.includes("searxng");
    } catch {
      return false;
    }
  }

  /**
   * Starts the SearXNG Docker container
   */
  private async startSearXNG(): Promise<void> {
    try {
      // Check if docker is available first
      const dockerAvailable = await this.isDockerAvailable();
      if (!dockerAvailable) {
        throw new Error(
          "Docker is not installed or not in PATH. Please install Docker to use SearXNG search.",
        );
      }

      // Start the container using our compose file
      spawn(
        "docker",
        ["compose", "-f", "docker-compose.searxng.yml", "up", "-d"],
        {
          stdio: "ignore",
          detached: true,
        },
      );

      console.log("Starting SearXNG container...");
    } catch (error) {
      throw new Error(
        `Failed to start SearXNG container: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Waits for the SearXNG service to be ready
   */
  private async waitForSearXNGReady(): Promise<void> {
    const maxRetries = 30; // Wait up to 30 seconds (30 * 1 second)
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await fetch("http://localhost:8085", {
          method: "GET",
        });

        if (response.ok) {
          return; // Service is ready
        }
      } catch {
        // Ignore errors and continue waiting
      }

      retries++;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }

    throw new Error(
      "SearXNG service did not become available within the expected time",
    );
  }

  async execute(signal: AbortSignal): Promise<SearXNGSearchToolResult> {
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
      searchUrl.searchParams.append("locale", "en-US"); // Fixed: use dash instead of underscore
      searchUrl.searchParams.append("safesearch", "1");
      searchUrl.searchParams.append("categories", "general");
      searchUrl.searchParams.append("max_results", "20");
      // Removed engines parameter - using default configuration now

      const response = await fetch(searchUrl.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "LowCal-SearXNG-Client/1.0",
        },
        signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `SearXNG API error: ${response.status} ${response.statusText}${text ? ` - ${text}` : ""}`,
        );
      }

      const data = (await response.json()) as SearXNGSearchResponse;

      const isLikelyEnglish = (text: string): boolean => {
        const sample = text.slice(0, 200);
        if (!sample) return true;
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

      const sourceListFormatted = sources.map(
        (s, i) => `[${i + 1}] ${s.title} (${s.url})`,
      );

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
            const snippet = result?.content
              ? ` - ${result.content.substring(0, 150)}...`
              : "";
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
        returnDisplay: `Search results for "${this.params.query}" returned ${filteredResults.length} results.`,
        sources,
      };
    } catch (error: unknown) {
      const errorMessage = `Error during SearXNG web search for query "${this.params.query}": ${getErrorMessage(
        error,
      )}`;
      console.error(errorMessage, error);

      // If Docker isn't available or container can't be started, provide helpful message
      if (
        error instanceof Error &&
        (error.message.includes("Docker is not installed") ||
          error.message.includes("command not found"))
      ) {
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
export class SearXNGSearchTool extends BaseDeclarativeTool<
  SearXNGSearchToolParams,
  SearXNGSearchToolResult
> {
  static readonly Name: string = ToolNames.SEARXNG_SEARCH;

  constructor(private readonly config: Config) {
    super(
      SearXNGSearchTool.Name,
      "SearXNGSearch",
      "Performs a web search using the local SearXNG instance and returns results with sources. Requires Docker to be installed.",
      Kind.Search,
      {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to find information on the web.",
          },
        },
        required: ["query"],
      },
    );
  }

  /**
   * Validates the parameters for the SearXNGSearchTool.
   * @param params The parameters to validate
   * @returns An error message string if validation fails, null if valid
   */
  protected override validateToolParamValues(
    params: SearXNGSearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === "") {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  protected createInvocation(
    params: SearXNGSearchToolParams,
  ): ToolInvocation<SearXNGSearchToolParams, SearXNGSearchToolResult> {
    return new SearXNGSearchToolInvocation(this.config, params);
  }
}
