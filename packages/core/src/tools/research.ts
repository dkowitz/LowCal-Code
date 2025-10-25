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
  type ToolResultDisplay,
  ToolConfirmationOutcome,
} from "./tools.js";

import type { Config } from "../config/config.js";
import { ApprovalMode } from "../config/config.js";
import { getErrorMessage } from "../utils/errors.js";
import { ToolNames } from "./tool-names.js";
import { WebSearchTool } from "./web-search.js";
import { SearXNGSearchTool } from "./searxng-search.js";
import { WebFetchTool } from "./web-fetch.js";
import { partToString } from "../utils/partUtils.js";

/**
 * Parameters for the ResearchTool.
 */
export interface ResearchToolParams {
  /**
   * The research query
   */
  query: string;

  /**
   * Optimization mode - speed, balanced, or quality
   */
  mode: 'speed' | 'balanced' | 'quality';

  /**
   * Optional ordered list of search tools to use. Defaults to all available.
   */
  searchTools?: Array<typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH>;
}

/**
 * Extends ToolResult to include sources and citations for research.
 */
export interface ResearchToolResult extends ToolResult {
  sources?: Array<{ title: string; url: string }>;
  citations?: Record<string, { content: string; sourceIndex: number }>;
}

class ResearchToolInvocation extends BaseToolInvocation<
  ResearchToolParams,
  ResearchToolResult
> {
  constructor(
    private readonly config: Config,
    params: ResearchToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    return `Conducting research on: "${this.params.query}" in ${this.params.mode} mode`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const confirmationDetails: ToolInfoConfirmationDetails = {
      type: "info",
      title: "Confirm Research Request",
      prompt: `Conduct research on: "${this.params.query}" in ${this.params.mode} mode`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  /**
   * Rephrases the user query into a search-ready format
   */
  private async rephraseQuery(query: string): Promise<string> {
    // For simplicity, we'll use a basic approach similar to Perplexica's
    // In a real implementation, this would be more sophisticated
    
    if (query.trim().length === 0) {
      return query;
    }
    
    // If the query is already in question format, keep it as-is
    const trimmedQuery = query.trim();
    if (trimmedQuery.endsWith('?') || 
        trimmedQuery.toLowerCase().startsWith('what') ||
        trimmedQuery.toLowerCase().startsWith('how') ||
        trimmedQuery.toLowerCase().startsWith('why') ||
        trimmedQuery.toLowerCase().startsWith('when') ||
        trimmedQuery.toLowerCase().startsWith('where') ||
        trimmedQuery.toLowerCase().startsWith('who') ||
        trimmedQuery.toLowerCase().startsWith('which')) {
      return query;
    }
    
    // Otherwise, rephrase to a question format
    if (trimmedQuery.startsWith('Can you tell me what is ') || 
        trimmedQuery.startsWith('What is ')) {
      return trimmedQuery;
    }
    
    // For other cases, convert to question form
    return `What is ${trimmedQuery}?`;
  }

  /**
   * Gets the appropriate search parameters based on optimization mode
   */
  private getSearchParameters(mode: 'speed' | 'balanced' | 'quality'): {
    maxResults: number;
  } {
    switch (mode) {
      case 'speed':
        return { 
          maxResults: 3,
        };
      case 'balanced':
        return { 
          maxResults: 7,
        };
      case 'quality':
        return { 
          maxResults: 12,
        };
    }
  }

  private emitProgress(
    updateOutput: ((output: ToolResultDisplay) => void) | undefined,
    message: string,
  ): void {
    if (!updateOutput) {
      return;
    }
    updateOutput(message);
  }

  private truncate(value: string | undefined, maxLength = 140): string {
    if (!value) {
      return "";
    }
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) {
      return trimmed;
    }
    return `${trimmed.slice(0, maxLength - 1)}…`;
  }

  private buildQueryVariants(baseQuery: string): string[] {
    switch (this.params.mode) {
      case "speed":
        return [baseQuery, `${baseQuery} quick facts`];
      case "balanced":
        return [
          baseQuery,
          `${baseQuery} latest developments`,
          `${baseQuery} key statistics`,
        ];
      case "quality":
        return [
          baseQuery,
          `${baseQuery} recent developments`,
          `${baseQuery} statistics and data`,
          `${baseQuery} expert analysis`,
          `${baseQuery} historical context`,
        ];
    }
  }

  private formatToolName(
    toolName: typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH,
  ): string {
    return toolName === ToolNames.WEB_SEARCH ? "Tavily" : "SearXNG";
  }

  private buildFallbackSummary(
    mode: ResearchToolParams["mode"],
    queries: string[],
    sources: Array<{ title: string; url: string }>,
    searchHighlights: string[],
    documentSnippets: string[],
  ): string {
    const sourceLines = sources.length
      ? sources
          .slice(0, 20)
          .map(
            (source, index) =>
              `[${index + 1}] ${source.title || source.url} — ${source.url}`,
          )
          .join("\n")
      : "No web sources were collected.";

    const highlightLines = searchHighlights.length
      ? searchHighlights
          .slice(0, 5)
          .map(
            (highlight, index) =>
              `- Search ${index + 1}: ${this.truncate(highlight, 200)}`,
          )
          .join("\n")
      : "- No narrative search summaries were available.";

    const snippetLines = documentSnippets.length
      ? documentSnippets
          .slice(0, 5)
          .map(
            (snippet, index) =>
              `- Source ${index + 1}: ${this.truncate(snippet, 200)}`,
          )
          .join("\n")
      : "- Detailed document summaries were not generated.";

    return [
      "# Research Summary",
      `- Mode: ${mode}`,
      `- Query variants: ${queries
        .map((query) => `"${this.truncate(query, 80)}"`)
        .join(", ")}`,
      "",
      "## Search Highlights",
      highlightLines,
      "",
      "## Source List",
      sourceLines,
      "",
      "## Document Insights",
      snippetLines,
    ].join("\n");
  }

  private resolveSearchTools(): Array<typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH> {
    const preferredOrder =
      this.params.searchTools && this.params.searchTools.length > 0
        ? this.params.searchTools
        : [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH];

    const uniqueOrdered: Array<typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH> =
      [];
    const seen = new Set<string>();
    const toolRegistry = this.config.getToolRegistry?.();

    for (const toolName of preferredOrder) {
      if (
        toolName !== ToolNames.WEB_SEARCH &&
        toolName !== ToolNames.SEARXNG_SEARCH
      ) {
        continue;
      }
      if (seen.has(toolName)) {
        continue;
      }
      if (toolRegistry && !toolRegistry.getTool(toolName)) {
        continue;
      }
      seen.add(toolName);
      uniqueOrdered.push(toolName);
    }

    return uniqueOrdered;
  }

  private ensureWebFetchAvailable(): void {
    const toolRegistry = this.config.getToolRegistry?.();
    if (toolRegistry && !toolRegistry.getTool(ToolNames.WEB_FETCH)) {
      throw new Error(
        "web_fetch tool is required for research but is not available. Enable it via /toolset.",
      );
    }
  }

  async execute(
    signal: AbortSignal,
    updateOutput?: (output: ToolResultDisplay) => void,
  ): Promise<ResearchToolResult> {
    try {
      this.ensureWebFetchAvailable();
      this.emitProgress(
        updateOutput,
        `ℹ⚙️ Running ${this.params.mode} research workflow…`,
      );

      // Step 1: Rephrase the query
      const rephrasedQuery = await this.rephraseQuery(this.params.query);
      this.emitProgress(
        updateOutput,
      `ℹ📝 Base query prepared: "${this.truncate(rephrasedQuery, 90)}"`,
      );

      // Step 2: Build search plan
      const { maxResults } = this.getSearchParameters(this.params.mode);
      const searchTools = this.resolveSearchTools();
      if (searchTools.length === 0) {
        throw new Error(
          "No web search tools are available. Enable web_search or searxng_search via /toolset.",
        );
      }

      const queryVariants = this.buildQueryVariants(rephrasedQuery);
      const searchPlan = queryVariants.map((query, index) => ({
        query,
        toolName: searchTools[index % searchTools.length],
      }));

      this.emitProgress(
        updateOutput,
        `ℹ🔄 Executing ${searchPlan.length} search variant(s) across ${searchTools
          .map((tool) => this.formatToolName(tool))
          .join(" + ")}`,
      );

      const searchResults: string[] = [];
      const sources: Array<{ title: string; url: string }> = [];
      const seenUrls = new Set<string>();

      for (let i = 0; i < searchPlan.length; i++) {
        const { query, toolName } = searchPlan[i];
        const label = this.formatToolName(toolName);
        this.emitProgress(
          updateOutput,
      `🔎 [${i + 1}/${searchPlan.length}] ${label} search: "${this.truncate(query, 90)}"`,
        );

        const tool =
          toolName === ToolNames.WEB_SEARCH
            ? new WebSearchTool(this.config)
            : new SearXNGSearchTool(this.config);
        const invocation = tool.build({ query });
        const result = await invocation.execute(signal);

        const summaryText = partToString(result.llmContent);
        if (summaryText) {
          searchResults.push(summaryText.replace(/\s+/g, " "));
          this.emitProgress(
            updateOutput,
            `📌 ${label} highlight: ${this.truncate(
              summaryText.replace(/\s+/g, " "),
              160,
            )}`,
          );
        }

        const newlyAdded: Array<{ title: string; url: string }> = [];
        for (const source of result.sources || []) {
          if (!source.url) {
            continue;
          }
          if (seenUrls.has(source.url)) {
            continue;
          }
          seenUrls.add(source.url);
          const normalized = {
            title: source.title ?? "",
            url: source.url,
          };
          sources.push(normalized);
          newlyAdded.push(normalized);
        }

        if (newlyAdded.length > 0) {
          const sample = newlyAdded[0];
          this.emitProgress(
            updateOutput,
            `📚 ${label} added ${newlyAdded.length} source(s). Example: ${this.truncate(
              sample.title || sample.url,
              120,
            )} (${sample.url})`,
          );
        } else {
          this.emitProgress(
            updateOutput,
            `ℹ ${label} did not yield new unique sources for this query.`,
          );
        }
      }

      if (sources.length === 0) {
        this.emitProgress(
          updateOutput,
          "⚠️ No sources were discovered during web search.",
        );
      } else {
        this.emitProgress(
          updateOutput,
          `ℹ📁 Collected ${sources.length} unique source(s) for deeper review.`,
        );
      }

      // Step 3: Process relevant documents from URLs
      const fetchTool = new WebFetchTool(this.config);
      const processedDocuments: string[] = [];
      const documentSnippets: string[] = [];
      const sourcesForProcessing = sources.slice(
        0,
        Math.min(maxResults, sources.length),
      );

      if (sourcesForProcessing.length > 0) {
        this.emitProgress(
          updateOutput,
          `ℹ📰 Summarizing top ${sourcesForProcessing.length} source(s) for detailed insights.`,
        );
      }

      for (let i = 0; i < sourcesForProcessing.length; i++) {
        const source = sourcesForProcessing[i];
        this.emitProgress(
          updateOutput,
          `📰 [${i + 1}/${sourcesForProcessing.length}] Summarizing ${this.truncate(
            source.title || source.url,
            120,
          )}`,
        );

        try {
          const fetchInvocation = fetchTool.build({
            url: source.url,
            prompt: `Summarize the key information from this page relevant to the research question: "${this.params.query}"`,
          });
          const fetchResult = await fetchInvocation.execute(signal);

          const fetchText = partToString(fetchResult.llmContent || "");
          if (fetchText.trim()) {
            processedDocuments.push(fetchText);
            documentSnippets.push(fetchText.replace(/\s+/g, " "));
            this.emitProgress(
              updateOutput,
              `✅ Captured insights from ${this.truncate(
                source.title || source.url,
                100,
              )}`,
            );
          } else {
            this.emitProgress(
              updateOutput,
              `ℹ No summarizable content returned from ${this.truncate(
                source.title || source.url,
                100,
              )}.`,
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          console.error(`Error fetching document ${source.url}:`, error);
          this.emitProgress(
            updateOutput,
            `⚠️ Error fetching ${this.truncate(
              source.title || source.url,
              90,
            )}: ${this.truncate(errorMessage, 120)}`,
          );
        }
      }

      // Step 4: Combine all information and generate a final report
      const combinedContent = [
        ...searchResults,
        ...processedDocuments
      ].join('\n\n---\n\n');
      
      // Create a prompt that follows Perplexica's structure for generating the final report
      const finalPrompt = `
You are an AI research assistant. You will be given a query and multiple search results from different sources.
Your task is to create a comprehensive, well-structured research report in Markdown format.

Query: "${this.params.query}"

Search Results:
${combinedContent}

Instructions:
1. Create a professional, detailed report with clear headings
2. Use neutral, journalistic tone
3. Include inline citations using [number] notation for each fact or detail
4. Prioritize credibility by linking all statements to their source context
5. Structure the response like a professional blog post
6. Provide comprehensive coverage of the topic without superficiality

Format your response with proper Markdown headings and subheadings.
`;
      
      this.emitProgress(
        updateOutput,
        "ℹ🧠 Synthesizing final report…",
      );

      // Use Gemini client directly to generate final report
      const geminiClient = this.config.getGeminiClient();
      const result = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: finalPrompt }] }],
        {},
        signal,
      );

      const resultText = (await getResponseText(result)) || "";
      const fallbackSummary = this.buildFallbackSummary(
        this.params.mode,
        searchPlan.map((run) => run.query),
        sources,
        searchResults,
        documentSnippets,
      );
      const finalContent =
        resultText && resultText.trim().length > 0
          ? resultText
          : fallbackSummary;

      // Extract citations from the response
      // In a real implementation, we'd parse [number] references and map them to sources
      const citations: Record<string, { content: string; sourceIndex: number }> = {};
      
      this.emitProgress(
        updateOutput,
        `✅ Research complete. Compiled ${sources.length} source(s).`,
      );

      return {
        llmContent: finalContent,
        returnDisplay: `Research complete for "${this.params.query}"`,
        sources,
        citations
      };
    } catch (error: unknown) {
      const errorMessage = `Error during research for query "${this.params.query}": ${getErrorMessage(
        error,
      )}`;
      console.error(errorMessage, error);
      
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: "Error performing research.",
      };
    }
  }
}

/**
 * A tool to conduct deep internet research with multiple sources and citations.
 */
export class ResearchTool extends BaseDeclarativeTool<
  ResearchToolParams,
  ResearchToolResult
> {
  static readonly Name: string = ToolNames.RESEARCH;

  constructor(private readonly config: Config) {
    super(
      ResearchTool.Name,
      "Research",
      "Conducts deep internet research using multiple sources with citation support. Supports speed, balanced, and quality modes.",
      Kind.Search,
      {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The research query to search for on the web.",
          },
          mode: {
            type: "string",
            enum: ["speed", "balanced", "quality"],
            description: "Optimization mode - speed, balanced, or quality.",
          },
          searchTools: {
            type: "array",
            description:
              "Optional ordered list of search tools to run. Defaults to all available tools.",
            items: {
              type: "string",
              enum: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
            },
          },
        },
        required: ["query", "mode"],
      },
    );
  }

  /**
   * Validates the parameters for the ResearchTool.
   * @param params The parameters to validate
   * @returns An error message string if validation fails, null if valid
   */
  protected override validateToolParamValues(
    params: ResearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === "") {
      return "The 'query' parameter cannot be empty.";
    }
    
    if (params.mode !== "speed" && params.mode !== "balanced" && params.mode !== "quality") {
      return "The 'mode' parameter must be one of: speed, balanced, quality";
    }

    if (params.searchTools) {
      if (!Array.isArray(params.searchTools) || params.searchTools.length === 0) {
        return "The 'searchTools' parameter must be a non-empty array when provided.";
      }

      const invalidEntry = params.searchTools.find(
        (tool) =>
          tool !== ToolNames.WEB_SEARCH && tool !== ToolNames.SEARXNG_SEARCH,
      );
      if (invalidEntry) {
        return "The 'searchTools' parameter contains an invalid tool name.";
      }
    }

    return null;
  }

  protected createInvocation(
    params: ResearchToolParams,
  ): ToolInvocation<ResearchToolParams, ResearchToolResult> {
    return new ResearchToolInvocation(this.config, params);
  }
}

/**
 * Helper function to extract response text from a Gemini content generation result
 */
async function getResponseText(result: any): Promise<string | null> {
  if (!result || !result.response) {
    return null;
  }
  
  const parts = result.response.candidates?.[0]?.content?.parts;
  if (!parts || !Array.isArray(parts)) {
    return null;
  }
  
  for (const part of parts) {
    if (part.text) {
      return part.text;
    }
  }
  
  return null;
}
