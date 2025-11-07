/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseDeclarativeTool, BaseToolInvocation, Kind, ToolConfirmationOutcome, } from "./tools.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { ApprovalMode } from "../config/config.js";
import { getErrorMessage } from "../utils/errors.js";
import { ToolNames } from "./tool-names.js";
import { WebSearchTool } from "./web-search.js";
import { SearXNGSearchTool } from "./searxng-search.js";
import { WebFetchTool } from "./web-fetch.js";
import { partToString } from "../utils/partUtils.js";
class ResearchToolInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return `Conducting research on: "${this.params.query}" in ${this.params.mode} mode`;
    }
    async shouldConfirmExecute(_abortSignal) {
        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }
        const confirmationDetails = {
            type: "info",
            title: "Confirm Research Request",
            prompt: `Conduct research on: "${this.params.query}" in ${this.params.mode} mode`,
            onConfirm: async (outcome) => {
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
    async rephraseQuery(query, signal) {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return query;
        }
        const geminiClient = this.config.getGeminiClient?.();
        if (!geminiClient) {
            return trimmedQuery;
        }
        const prompt = `
Rewrite the following research intent as a precise web search query.
- Preserve the key nouns, entities, and constraints.
- Avoid conversational phrasing (no "what is", "please", "can you").
- Keep the query under 16 words.
- Return only the rewritten query, nothing else.

Original request:
"""${trimmedQuery}"""
`;
        try {
            const response = await geminiClient.generateContent([{ role: "user", parts: [{ text: prompt }] }], {}, signal);
            const candidates = (response.response
                ?.candidates ??
                response.candidates ??
                []);
            const fallbackParts = candidates.length > 0 ? candidates[0]?.content?.parts ?? [] : [];
            const fallbackText = Array.isArray(fallbackParts)
                ? fallbackParts
                    .map((part) => typeof part === "string"
                    ? part
                    : part && typeof part === "object" && "text" in part
                        ? part.text ?? ""
                        : "")
                    .join("")
                : "";
            const candidateText = (await getResponseText(response)) ?? fallbackText;
            const rephrased = candidateText
                .split(/\r?\n/)
                .map((line) => line.trim().replace(/^[-•\d.]+\s*/, ""))
                .find((line) => line.length > 0);
            if (rephrased && rephrased.length > 0) {
                return rephrased;
            }
        }
        catch (_error) { }
        return trimmedQuery;
    }
    /**
     * Gets the appropriate search parameters based on optimization mode
     */
    getSearchParameters(mode) {
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
    emitProgress(updateOutput, message, mode = "append") {
        if (!updateOutput) {
            return;
        }
        const payload = `__progress__${JSON.stringify({ mode, message })}`;
        updateOutput(payload);
    }
    truncate(value, maxLength = 140) {
        if (!value) {
            return "";
        }
        const trimmed = value.trim();
        if (trimmed.length <= maxLength) {
            return trimmed;
        }
        return `${trimmed.slice(0, maxLength - 1)}…`;
    }
    stripJsonFence(text) {
        return text
            .replace(/^\s*```(?:json)?/i, "")
            .replace(/```$/i, "")
            .trim();
    }
    sanitizePlan(plan) {
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
        };
        const maxQueries = maxByMode[this.params.mode];
        subQueries = subQueries.slice(0, maxQueries);
        return {
            primaryTopic,
            slug,
            subQueries,
        };
    }
    buildPlanFallback() {
        return {
            primaryTopic: this.params.query,
            subQueries: [{ query: this.params.query }],
        };
    }
    async buildQueryPlan(signal) {
        const geminiClient = this.config.getGeminiClient?.();
        if (!geminiClient) {
            return this.buildPlanFallback();
        }
        const modeInstructions = {
            speed: "Generate 2-4 precise search queries that cover the essential aspects of the user's request.",
            balanced: "Generate 4-6 targeted search queries covering all major facets of the user's request.",
            quality: "Generate 6-8 in-depth search queries that exhaustively address every dimension of the user's request.",
        };
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
            const response = await geminiClient.generateContent([{ role: "user", parts: [{ text: plannerPrompt }] }], {}, signal);
            const candidates = (response.response
                ?.candidates ??
                response.candidates ??
                []);
            const fallbackParts = candidates.length > 0 ? candidates[0]?.content?.parts ?? [] : [];
            const fallbackText = Array.isArray(fallbackParts)
                ? fallbackParts
                    .map((part) => typeof part === "string"
                    ? part
                    : part && typeof part === "object" && "text" in part
                        ? part.text ?? ""
                        : "")
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
        }
        catch (_error) {
            return this.buildPlanFallback();
        }
    }
    buildQueryVariants(baseQuery) {
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
    formatToolName(toolName) {
        return toolName === ToolNames.WEB_SEARCH ? "Tavily" : "SearXNG";
    }
    extractKeyPoints(texts, limit) {
        const points = [];
        const seen = new Set();
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
    buildSourceCatalogForPrompt(sources) {
        if (sources.length === 0) {
            return "No external sources were captured during search.";
        }
        const maxForPrompt = 40;
        return sources
            .slice(0, maxForPrompt)
            .map((source, index) => `[${index + 1}] ${this.truncate(source.title || source.url, 140)} — ${source.url}`)
            .join("\n");
    }
    stripGeneratedSourceSections(content) {
        let cleaned = content;
        const headings = [
            "sources",
            "references",
            "bibliography",
            "source catalog",
        ];
        for (const heading of headings) {
            const pattern = new RegExp(`\\n#{1,6}\\s+${heading}[\\s\\S]*$`, "i");
            cleaned = cleaned.replace(pattern, "\n");
        }
        return cleaned.trim();
    }
    /**
     * Uses LLM to assess which sources are relevant to the research topic and which should be filtered out.
     * @param topic The main research topic
     * @param sources Array of sources to assess
     * @param citedIndices Set of indices that are already cited in the report (these are always kept)
     * @returns Array of source indices that should be included
     */
    async assessSourceRelevance(topic, sources, citedIndices, signal) {
        // Always include cited sources
        const approvedIndices = new Set(citedIndices);
        // If no sources to assess, return early
        if (sources.length === 0) {
            return approvedIndices;
        }
        // Get sources that need assessment (not already cited)
        const sourcesToAssess = sources.map((source, index) => ({
            index,
            title: source.title,
            url: source.url,
            domain: new URL(source.url).hostname,
        })).filter(item => !citedIndices.has(item.index));
        if (sourcesToAssess.length === 0) {
            return approvedIndices;
        }
        try {
            const geminiClient = this.config.getGeminiClient?.();
            if (!geminiClient) {
                // If no LLM available, fall back to including all non-cited sources
                sourcesToAssess.forEach(item => approvedIndices.add(item.index));
                return approvedIndices;
            }
            const prompt = `
You are a research quality assessor. Analyze the following sources and determine which ones are RELEVANT and SUBSTANTIVE for the research topic "${topic}".

Filter OUT sources that are:
- Dictionary/thesaurus definitions ("what is X", "meaning of Y")
- Basic grammar or language learning content
- Simple Q&A sites with surface-level answers
- Tutorial/how-to content that's not research-focused
- Sites that only provide basic explanations without depth

KEEP sources that are:
- Authoritative publications on the topic
- In-depth analysis or research
- News articles with substantive content
- Academic or professional sources
- Government or institutional reports
- Industry analysis or white papers

For each source, respond with either "KEEP" or "FILTER" and a brief reason.

Sources to assess:
${sourcesToAssess.map((source, i) => `${i + 1}. [${source.domain}] ${source.title}`).join('\n')}

Respond in this format:
1. KEEP - [reason]
2. FILTER - [reason]
etc.

Be selective - only keep sources that truly add value to research on "${topic}".`;
            const response = await geminiClient.generateContent([{ role: "user", parts: [{ text: prompt }] }], {}, signal);
            const candidates = (response.response
                ?.candidates ??
                response.candidates ??
                []);
            if (candidates.length > 0) {
                const fallbackParts = candidates.length > 0 ? candidates[0]?.content?.parts ?? [] : [];
                const responseText = Array.isArray(fallbackParts)
                    ? fallbackParts
                        .map((part) => typeof part === "string"
                        ? part
                        : part && typeof part === "object" && "text" in part
                            ? part.text ?? ""
                            : "")
                        .join("")
                    : "";
                const lines = responseText.split('\n').filter(line => line.trim());
                lines.forEach((line, i) => {
                    const sourceIndex = sourcesToAssess[i]?.index;
                    if (sourceIndex !== undefined && line.toUpperCase().includes('KEEP')) {
                        approvedIndices.add(sourceIndex);
                    }
                });
            }
        }
        catch (error) {
            // If assessment fails, include all sources to be safe
            sourcesToAssess.forEach(item => approvedIndices.add(item.index));
        }
        return approvedIndices;
    }
    buildCitationMap(report, sources) {
        const citationPattern = /\[(\d+)\]/g;
        const citations = {};
        const seen = new Set();
        let match;
        while ((match = citationPattern.exec(report)) !== null) {
            const citationNumber = match[1];
            if (seen.has(citationNumber)) {
                continue;
            }
            const index = Number.parseInt(citationNumber, 10);
            if (!Number.isFinite(index) || index < 1 || index > sources.length) {
                continue;
            }
            const source = sources[index - 1];
            citations[citationNumber] = {
                content: source.title || source.url,
                sourceIndex: index - 1,
            };
            seen.add(citationNumber);
        }
        return citations;
    }
    buildFallbackReport(mode, queries, sources, searchHighlights, documentSnippets) {
        const keyFindings = this.extractKeyPoints([...documentSnippets, ...searchHighlights], 6);
        const dataHighlights = this.extractKeyPoints(searchHighlights.filter((snippet) => /\d/.test(snippet)), 4);
        const narrativeInsights = this.extractKeyPoints(documentSnippets, 5);
        const sourceLines = sources.length
            ? sources
                .slice(0, 12)
                .map((source, index) => `[${index + 1}] ${this.truncate(source.title || source.url, 120)} — ${source.url}`)
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
    async persistReport(content, plan) {
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
    resolveSearchTools() {
        const preferredOrder = this.params.searchTools && this.params.searchTools.length > 0
            ? this.params.searchTools
            : [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH];
        const uniqueOrdered = [];
        const seen = new Set();
        const toolRegistry = this.config.getToolRegistry?.();
        for (const toolName of preferredOrder) {
            if (toolName !== ToolNames.WEB_SEARCH &&
                toolName !== ToolNames.SEARXNG_SEARCH) {
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
    ensureWebFetchAvailable() {
        const toolRegistry = this.config.getToolRegistry?.();
        if (toolRegistry && !toolRegistry.getTool(ToolNames.WEB_FETCH)) {
            throw new Error("web_fetch tool is required for research but is not available. Enable it via /toolset.");
        }
    }
    async execute(signal, updateOutput) {
        try {
            this.ensureWebFetchAvailable();
            this.emitProgress(updateOutput, `ℹ⚙️ Running ${this.params.mode} research workflow…`, "append");
            const plan = await this.buildQueryPlan(signal);
            this.emitProgress(updateOutput, `ℹ🧭 Query plan established with ${plan.subQueries.length} focus area(s).\n   Primary topic: ${plan.primaryTopic}`, "append");
            const normalizedSubQueries = [];
            for (const sub of plan.subQueries) {
                const normalized = await this.rephraseQuery(sub.query, signal);
                normalizedSubQueries.push({ base: normalized, rationale: sub.rationale });
            }
            const { maxResults } = this.getSearchParameters(this.params.mode);
            const searchTools = this.resolveSearchTools();
            if (searchTools.length === 0) {
                throw new Error("No web search tools are available. Enable web_search or searxng_search via /toolset.");
            }
            const searchPlan = [];
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
            this.emitProgress(updateOutput, `ℹ🔄 Executing ${searchPlan.length} targeted search(es) across ${searchTools
                .map((tool) => this.formatToolName(tool))
                .join(" + ")}`, "append");
            const searchResults = [];
            const sources = [];
            const seenUrls = new Set();
            const toolUsageCounts = new Map();
            for (let i = 0; i < searchPlan.length; i++) {
                const { query, toolName, subIndex, rationale } = searchPlan[i];
                const label = this.formatToolName(toolName);
                const focusLabel = plan.subQueries[subIndex]?.query ?? query;
                this.emitProgress(updateOutput, `🔎 [${i + 1}/${searchPlan.length}] ${label} → ${this.truncate(query, 90)} (focus ${subIndex + 1}/${plan.subQueries.length}: ${this.truncate(focusLabel, 70)})${rationale ? `\n   ↳ ${this.truncate(rationale, 90)}` : ""}`, "replace");
                const tool = toolName === ToolNames.WEB_SEARCH
                    ? new WebSearchTool(this.config)
                    : new SearXNGSearchTool(this.config);
                const invocation = tool.build({ query });
                const result = await invocation.execute(signal);
                toolUsageCounts.set(toolName, (toolUsageCounts.get(toolName) ?? 0) + 1);
                const summaryText = partToString(result.llmContent);
                if (summaryText) {
                    searchResults.push(summaryText.replace(/\s+/g, " "));
                    this.emitProgress(updateOutput, `📌 ${label} highlight: ${this.truncate(summaryText.replace(/\s+/g, " "), 160)}`, "replace");
                }
                const newlyAdded = [];
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
                const summaryLine = newlyAdded.length > 0
                    ? `✔ ${label} completed – ${newlyAdded.length} new source(s) added.`
                    : `✔ ${label} completed – no new unique sources found.`;
                this.emitProgress(updateOutput, summaryLine, "append");
            }
            if (sources.length === 0) {
                this.emitProgress(updateOutput, "⚠️ No sources were discovered during web search.", "append");
            }
            else {
                this.emitProgress(updateOutput, `ℹ📁 Collected ${sources.length} unique source(s) for deeper review.`, "append");
            }
            // Step 3: Process relevant documents from URLs
            const fetchTool = new WebFetchTool(this.config);
            const processedDocuments = [];
            const documentSnippets = [];
            const sourcesForProcessing = sources.slice(0, Math.min(maxResults, sources.length));
            if (sourcesForProcessing.length > 0) {
                this.emitProgress(updateOutput, `ℹ📰 Summarizing top ${sourcesForProcessing.length} source(s) for detailed insights.`, "append");
            }
            for (let i = 0; i < sourcesForProcessing.length; i++) {
                const source = sourcesForProcessing[i];
                this.emitProgress(updateOutput, `📰 [${i + 1}/${sourcesForProcessing.length}] Summarizing ${this.truncate(source.title || source.url, 120)}`, "replace");
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
                        this.emitProgress(updateOutput, `✅ Captured insights from ${this.truncate(source.title || source.url, 100)}`, "replace");
                    }
                    else {
                        this.emitProgress(updateOutput, `ℹ No summarizable content returned from ${this.truncate(source.title || source.url, 100)}.`, "replace");
                    }
                }
                catch (error) {
                    const errorMessage = getErrorMessage(error);
                    this.emitProgress(updateOutput, `⚠️ Error fetching ${this.truncate(source.title || source.url, 90)}: ${this.truncate(errorMessage, 120)}`, "replace");
                }
                this.emitProgress(updateOutput, `✔ Summarized ${this.truncate(source.title || source.url, 100)}`, "append");
            }
            // Step 4: Combine all information and generate a final report
            const combinedContent = [
                ...searchResults,
                ...processedDocuments,
            ].join("\n\n---\n\n");
            const sourceCatalogForPrompt = this.buildSourceCatalogForPrompt(sources);
            // Create a prompt that follows Perplexica's structure for generating the final report
            const planSummary = plan.subQueries
                .map((sub, index) => `${index + 1}. ${sub.query}${sub.rationale ? ` — ${sub.rationale}` : ""}`)
                .join("\n");
            const narrativeGuidance = this.params.mode === "quality"
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

Available Source Catalog (use these numeric identifiers in citations):
${sourceCatalogForPrompt}

Writing Guidelines:
- ${narrativeGuidance}
- Write primarily in flowing paragraphs; reserve bullet or table structures only for dense data recaps.
- Open with an engaging overview, develop the story with clear transitions, and close with implications or recommended next steps.
- Integrate data points, historical context, and qualitative insights, explaining their significance.
- Cite every meaningful statement using inline citations in [number] format referencing the Source Catalog above.
- Do not invent citations or reuse a number for multiple distinct sources.
- Maintain a neutral, evidence-driven tone suitable for analysts and decision makers.
- Do not add a Sources/References section; one will be appended automatically.
`;
            this.emitProgress(updateOutput, "ℹ🧠 Synthesizing final report…", "append");
            // Use Gemini client directly to generate final report
            const geminiClient = this.config.getGeminiClient();
            const result = await geminiClient.generateContent([{ role: "user", parts: [{ text: finalPrompt }] }], {}, signal);
            const candidateParts = (result.response?.candidates ??
                result.candidates ?? [])?.[0]?.content?.parts ?? [];
            const candidateText = candidateParts
                .map((part) => {
                if (typeof part === "string") {
                    return part;
                }
                if (part &&
                    typeof part === "object" &&
                    "text" in part &&
                    typeof part.text === "string") {
                    return part.text ?? "";
                }
                return "";
            })
                .join("");
            const responseText = (await getResponseText(result)) ?? candidateText;
            const resultText = responseText && responseText.trim().length > 0
                ? responseText
                : candidateText;
            const fallbackSummary = this.buildFallbackReport(this.params.mode, searchPlan.map((run) => run.query), sources, searchResults, documentSnippets);
            const finalContent = resultText && resultText.trim().length > 0
                ? resultText
                : fallbackSummary;
            const cleanedReport = this.stripGeneratedSourceSections(finalContent.trim());
            const citations = this.buildCitationMap(cleanedReport, sources);
            // Get indices of sources that are actually cited in the report
            const citedIndices = new Set(Object.values(citations).map(c => c.sourceIndex));
            // Use LLM to assess which non-cited sources should be kept
            this.emitProgress(updateOutput, "ℹ🔍 Assessing source quality and relevance…", "append");
            const approvedSourceIndices = await this.assessSourceRelevance(this.params.query, sources, citedIndices, signal);
            // Filter sources to only include cited + approved ones
            const filteredSources = sources.filter((_, index) => approvedSourceIndices.has(index));
            this.emitProgress(updateOutput, `✅ Filtered to ${filteredSources.length} relevant sources (kept ${citedIndices.size} cited + ${filteredSources.length - citedIndices.size} approved).`, "append");
            this.emitProgress(updateOutput, resultText.trim().length > 0
                ? `✅ Research complete. Compiled ${filteredSources.length} relevant source(s).`
                : `✅ Research complete. Compiled ${filteredSources.length} relevant source(s) and generated a summary from collected material.`, "append");
            const sourcesSection = filteredSources.length
                ? [
                    "",
                    "## Sources",
                    ...filteredSources.map((source, index) => `[${index + 1}] ${source.title || source.url} — ${source.url}`),
                ].join("\n")
                : "";
            const toolUsageSection = toolUsageCounts.size
                ? [
                    "",
                    "## Tool Usage Summary",
                    ...Array.from(toolUsageCounts.entries()).map(([name, count]) => `- ${this.formatToolName(name)}: ${count} search${count === 1 ? "" : "es"}`),
                ].join("\n")
                : "";
            const finalReport = [
                cleanedReport,
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
                sources: filteredSources,
                citations
            };
        }
        catch (error) {
            const errorMessage = `Error during research for query "${this.params.query}": ${getErrorMessage(error)}`;
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
export class ResearchTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.RESEARCH;
    constructor(config) {
        super(ResearchTool.Name, "Research", "Conducts deep internet research using multiple sources with citation support. Supports speed, balanced, and quality modes.", Kind.Search, {
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
                    description: "Optional ordered list of search tools to run. Defaults to all available tools.",
                    items: {
                        type: "string",
                        enum: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
                    },
                },
            },
            required: ["query", "mode"],
        });
        this.config = config;
    }
    /**
     * Validates the parameters for the ResearchTool.
     * @param params The parameters to validate
     * @returns An error message string if validation fails, null if valid
     */
    validateToolParamValues(params) {
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
            const invalidEntry = params.searchTools.find((tool) => tool !== ToolNames.WEB_SEARCH && tool !== ToolNames.SEARXNG_SEARCH);
            if (invalidEntry) {
                return "The 'searchTools' parameter contains an invalid tool name.";
            }
        }
        return null;
    }
    createInvocation(params) {
        return new ResearchToolInvocation(this.config, params);
    }
}
/**
 * Helper function to extract response text from a Gemini content generation result
 */
async function getResponseText(result) {
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
//# sourceMappingURL=research.js.map