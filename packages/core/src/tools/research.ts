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
import * as fs from "node:fs";
import * as path from "node:path";

import type { Config } from "../config/config.js";
import { ApprovalMode } from "../config/config.js";
import { getErrorMessage } from "../utils/errors.js";
import { ToolNames } from "./tool-names.js";
import { WebSearchTool } from "./web-search.js";
import { SearXNGSearchTool } from "./searxng-search.js";
import { WebFetchTool } from "./web-fetch.js";
import { partToString } from "../utils/partUtils.js";

interface QuerySubtask {
  query: string;
  rationale?: string;
}

interface QueryPlan {
  primaryTopic: string;
  slug?: string;
  subQueries: QuerySubtask[];
}

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

  private stripJsonFence(text: string): string {
    return text
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  private sanitizePlan(plan: QueryPlan): QueryPlan {
    const primaryTopic = plan.primaryTopic?.trim() || this.params.query;
    const slug = plan.slug?.trim();
    let subQueries = Array.isArray(plan.subQueries)
      ? plan.subQueries
          .map((item) => ({
            query: (item?.query ?? "").trim(),
            rationale: item?.rationale?.trim() ?? "",
          }))
          .filter((item) => item.query.length > 0)
      : [];

    if (subQueries.length === 0) {
      subQueries = [{ query: this.params.query, rationale: "" }];
    }

    const maxByMode = {
      speed: 4,
      balanced: 6,
      quality: 8,
    } as const;
    const maxQueries = maxByMode[this.params.mode];
    subQueries = subQueries.slice(0, maxQueries);

    return {
      primaryTopic,
      slug,
      subQueries,
    };
  }

  private buildPlanFallback(): QueryPlan {
    return {
      primaryTopic: this.params.query,
      subQueries: [{ query: this.params.query }],
    };
  }

  private async buildQueryPlan(signal: AbortSignal): Promise<QueryPlan> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return this.buildPlanFallback();
    }

    const modeInstructions = {
      speed:
        "Generate 2-4 precise search queries that cover the essential aspects of the user's request.",
      balanced:
        "Generate 4-6 targeted search queries covering all major facets of the user's request.",
      quality:
        "Generate 6-8 in-depth search queries that exhaustively address every dimension of the user's request.",
    } as const;

    const plannerPrompt = `
You are a research planning assistant. Analyze the user's request, assess its complexity, and produce a structured JSON plan that breaks the request into focused search queries.

Mode: ${this.params.mode.toUpperCase()}

Guidelines:
- Consider whether the request is simple or multi-part; adapt the number of sub-queries accordingly.
- Merge overlapping intents, but do not miss distinct objectives.
- Each sub-query must be actionable and targeted.
- Provide a concise rationale for each sub-query.
- Suggest a 1-3 word descriptive slug suitable for file naming (lowercase words preferred).

Respond with valid JSON only, matching this schema:
{
  "primary_topic": "Concise summary of what the user ultimately wants",
  "slug": "short slug (1-3 words)",
  "sub_queries": [
    {
      "query": "Actionable search query",
      "rationale": "Why this query is needed"
    }
  ]
}

${modeInstructions[this.params.mode]}

User request:
${this.params.query}
`;

    try {
      const response = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: plannerPrompt }] }],
        {},
        signal,
      );

      const candidates = (
        (response as unknown as { response?: { candidates?: unknown } }).response
          ?.candidates ??
        (response as unknown as { candidates?: unknown }).candidates ??
        []
      ) as Array<{ content?: { parts?: unknown[] } }>;
      const fallbackParts =
        candidates.length > 0 ? candidates[0]?.content?.parts ?? [] : [];

      const fallbackText = Array.isArray(fallbackParts)
        ? fallbackParts
            .map((part) =>
              typeof part === "string"
                ? part
                : part && typeof part === "object" && "text" in part
                  ? (part as { text?: string }).text ?? ""
                  : "",
            )
            .join("")
        : "";

      const rawPlanText = (await getResponseText(response)) ?? fallbackText;
      const planText = this.stripJsonFence(rawPlanText || "");
      const parsed = JSON.parse(planText);
      const plan = this.sanitizePlan({
        primaryTopic: parsed?.primary_topic,
        slug: parsed?.slug,
        subQueries: parsed?.sub_queries ?? [],
      });
      return plan;
    } catch (error) {
      console.warn(
        "[ResearchTool] Falling back to simple query plan:",
        getErrorMessage(error),
      );
      return this.buildPlanFallback();
    }
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

  private extractKeyPoints(texts: string[], limit: number): string[] {
    const points: string[] = [];
    const seen = new Set<string>();

    for (const text of texts) {
      const normalizedText = text.replace(/\s+/g, " ").trim();
      if (!normalizedText) {
        continue;
      }

      const sentences = normalizedText.split(/(?<=[.!?])\s+/u);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length < 40) {
          continue;
        }

        const fingerprint = trimmed.toLowerCase();
        if (seen.has(fingerprint)) {
          continue;
        }

        seen.add(fingerprint);
        points.push(this.truncate(trimmed, 240));
        if (points.length >= limit) {
          return points;
        }
      }
    }

    return points.slice(0, limit);
  }

  private buildFallbackReport(
    mode: ResearchToolParams["mode"],
    queries: string[],
    sources: Array<{ title: string; url: string }>,
    searchHighlights: string[],
    documentSnippets: string[],
  ): string {
    const keyFindings = this.extractKeyPoints(
      [...documentSnippets, ...searchHighlights],
      6,
    );
    const dataHighlights = this.extractKeyPoints(
      searchHighlights.filter((snippet) => /\d/.test(snippet)),
      4,
    );
    const narrativeInsights = this.extractKeyPoints(documentSnippets, 5);

    const sourceLines = sources.length
      ? sources
          .slice(0, 12)
          .map(
            (source, index) =>
              `[${index + 1}] ${this.truncate(source.title || source.url, 120)} — ${source.url}`,
          )
          .join("\n")
      : "No web sources were collected.";

    return [
      `# Research Report: ${this.params.query}`,
      "",
      `Mode: ${mode} | Query variants: ${queries
        .map((query) => `"${this.truncate(query, 80)}"`)
        .join(", ")}`,
      "",
      "## Key Takeaways",
      keyFindings.length
        ? keyFindings.map((point) => `- ${point}`).join("\n")
        : "- Searches completed, but no detailed findings could be synthesized.",
      "",
      "## Historical & Narrative Highlights",
      narrativeInsights.length
        ? narrativeInsights.map((point) => `- ${point}`).join("\n")
        : "- No narrative summaries were available from the fetched documents.",
      "",
      "## Data & Trend Notes",
      dataHighlights.length
        ? dataHighlights.map((point) => `- ${point}`).join("\n")
        : "- No quantitative data surfaced in the gathered material.",
      "",
      "## Source Catalog",
      sourceLines,
    ].join("\n");
  }

  private async persistReport(
    content: string,
    plan: QueryPlan,
  ): Promise<string> {
    const reportsDir = path.resolve("reports");
    await fs.promises.mkdir(reportsDir, { recursive: true });

    const baseSlugSource = plan.slug && plan.slug.trim().length > 0
      ? plan.slug
      : plan.primaryTopic || this.params.query;

    const safeSlug = baseSlugSource
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "research-report";

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${safeSlug}-${timestamp}.md`;
    const filepath = path.join(reportsDir, filename);

    const header = `# Research Report\n\n- Query: ${this.params.query}\n- Primary topic: ${plan.primaryTopic}\n- Generated: ${new Date().toISOString()}\n\n---\n\n`;
    await fs.promises.writeFile(filepath, `${header}${content}`, "utf8");
    return path.relative(process.cwd(), filepath);
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

      const plan = await this.buildQueryPlan(signal);
      this.emitProgress(
        updateOutput,
        `ℹ🧭 Query plan established with ${plan.subQueries.length} focus area(s).\n   Primary topic: ${plan.primaryTopic}`,
      );

      const normalizedSubQueries: Array<{
        base: string;
        rationale?: string;
      }> = [];
      for (const sub of plan.subQueries) {
        const normalized = await this.rephraseQuery(sub.query);
        normalizedSubQueries.push({ base: normalized, rationale: sub.rationale });
      }

      const { maxResults } = this.getSearchParameters(this.params.mode);
      const searchTools = this.resolveSearchTools();
      if (searchTools.length === 0) {
        throw new Error(
          "No web search tools are available. Enable web_search or searxng_search via /toolset.",
        );
      }

      const searchPlan: Array<{
        query: string;
        toolName: typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH;
        subIndex: number;
        rationale?: string;
      }> = [];

      normalizedSubQueries.forEach((sub, subIndex) => {
        const variants = this.buildQueryVariants(sub.base);
        variants.forEach((variant) => {
          const toolName = searchTools[searchPlan.length % searchTools.length];
          searchPlan.push({
            query: variant,
            toolName,
            subIndex,
            rationale: sub.rationale,
          });
        });
      });

      this.emitProgress(
        updateOutput,
        `ℹ🔄 Executing ${searchPlan.length} targeted search(es) across ${searchTools
          .map((tool) => this.formatToolName(tool))
          .join(" + ")}`,
      );

      const searchResults: string[] = [];
      const sources: Array<{ title: string; url: string }> = [];
      const seenUrls = new Set<string>();
      const toolUsageCounts = new Map<
        typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH,
        number
      >();

      for (let i = 0; i < searchPlan.length; i++) {
        const { query, toolName, subIndex, rationale } = searchPlan[i];
        const label = this.formatToolName(toolName);
        const focusLabel = plan.subQueries[subIndex]?.query ?? query;
        this.emitProgress(
          updateOutput,
          `🔎 [${i + 1}/${searchPlan.length}] ${label} → ${this.truncate(query, 90)} (focus ${subIndex + 1}/${plan.subQueries.length}: ${this.truncate(focusLabel, 70)})${rationale ? `\n   ↳ Rationale: ${this.truncate(rationale, 90)}` : ""}`,
        );

        const tool =
          toolName === ToolNames.WEB_SEARCH
            ? new WebSearchTool(this.config)
            : new SearXNGSearchTool(this.config);
        const invocation = tool.build({ query });
        const result = await invocation.execute(signal);
        toolUsageCounts.set(
          toolName,
          (toolUsageCounts.get(toolName) ?? 0) + 1,
        );

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
      const planSummary = plan.subQueries
        .map(
          (sub, index) =>
            `${index + 1}. ${sub.query}${
              sub.rationale ? ` — ${sub.rationale}` : ""
            }`,
        )
        .join("\n");

      const narrativeGuidance =
        this.params.mode === "quality"
          ? "Produce a long-form feature article (8+ robust paragraphs) that reads like a magazine investigation."
          : this.params.mode === "balanced"
            ? "Produce a cohesive narrative article (6-8 paragraphs) that balances depth with readability."
            : "Produce a concise narrative briefing (4-6 paragraphs) that still delivers context and insight.";

      const finalPrompt = `
You are an investigative research writer. Use the supplied plan and evidence to craft a cohesive narrative report.

Primary Topic: ${plan.primaryTopic}

Research Objectives:
${planSummary}

Synthesized Evidence (search highlights, document summaries, quantitative snippets):
${combinedContent}

Writing Guidelines:
- ${narrativeGuidance}
- Write primarily in flowing paragraphs; reserve bullet or table structures only for dense data recaps.
- Open with an engaging overview, develop the story with clear transitions, and close with implications or recommended next steps.
- Integrate data points, historical context, and qualitative insights, explaining their significance.
- Cite every meaningful statement using inline citations in [number] format that map back to the source list.
- Maintain a neutral, evidence-driven tone suitable for analysts and decision makers.
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

      const candidateParts =
        ((result as unknown as {
          response?: {
            candidates?: Array<{ content?: { parts?: unknown[] } }>;
          };
          candidates?: Array<{ content?: { parts?: unknown[] } }>;
        }).response?.candidates ??
          (result as unknown as {
            candidates?: Array<{ content?: { parts?: unknown[] } }>;
          }).candidates ?? [])?.[0]?.content?.parts ?? [];

      const candidateText = candidateParts
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (
            part &&
            typeof part === "object" &&
            "text" in (part as Record<string, unknown>) &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            return (part as { text?: string }).text ?? "";
          }
          return "";
        })
        .join("");

      const responseText = (await getResponseText(result)) ?? null;
      const resultText = responseText && responseText.trim().length > 0
        ? responseText
        : candidateText;
      const fallbackSummary = this.buildFallbackReport(
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
        resultText.trim().length > 0
          ? `✅ Research complete. Compiled ${sources.length} source(s).`
          : `✅ Research complete. Compiled ${sources.length} source(s) and generated a summary from collected material.`,
      );

      const sourcesSection = sources.length
        ? [
            "",
            "## Sources",
            ...sources.map(
              (source, index) =>
                `[${index + 1}] ${source.title || source.url} — ${source.url}`,
            ),
          ].join("\n")
        : "";

      const toolUsageSection = toolUsageCounts.size
        ? [
            "",
            "## Tool Usage Summary",
            ...Array.from(toolUsageCounts.entries()).map(
              ([name, count]) =>
                `- ${this.formatToolName(name)}: ${count} search${count === 1 ? "" : "es"}`,
            ),
          ].join("\n")
        : "";

      const reportHeading = this.params.mode === "quality"
        ? "# Comprehensive Research Report"
        : this.params.mode === "balanced"
          ? "# Research Briefing"
          : "# Research Summary";

      const finalReport = [
        reportHeading,
        "",
        finalContent.trim(),
        toolUsageSection,
        sourcesSection,
      ]
        .filter(Boolean)
        .join("\n");

      const savedReportPath = await this.persistReport(finalReport, plan);
      const finalOutput = `${finalReport}\n\n_Report archived at: ${savedReportPath}_`;

      return {
        llmContent: finalOutput,
        returnDisplay: `Research complete for "${this.params.query}" (saved to ${savedReportPath})`,
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
