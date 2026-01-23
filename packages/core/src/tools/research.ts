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

type ResearchMode = "speed" | "balanced" | "quality" | "max";

interface IntentProfile {
  intent: string;
  constraints: string[];
  assumptions: string[];
  clarifyingQuestions: string[];
  ambiguity: "low" | "medium" | "high";
}

interface ReportSectionSpec {
  title: string;
  focus: string;
}

interface ReportSpec {
  summary: string;
  targetWordCount: number;
  sections: ReportSectionSpec[];
}

interface MaxResearchProfile {
  maxSubQueries: number;
  maxResults: number;
  variantsPerQuery: number;
  emergentSlots: number;
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
   * Optimization mode - speed, balanced, quality, or max
   */
  mode: ResearchMode;

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
  private async rephraseQuery(
    query: string,
    signal: AbortSignal,
  ): Promise<string> {
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
      const response = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: prompt }] }],
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

      const candidateText =
        (await getResponseText(response)) ?? fallbackText;
      const rephrased = candidateText
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^[-•\d.]+\s*/, ""))
        .find((line) => line.length > 0);

      if (rephrased && rephrased.length > 0) {
        return rephrased;
      }
    } catch (_error) {}

    return trimmedQuery;
  }

  /**
   * Gets the appropriate search parameters based on optimization mode
   */
  private getSearchParameters(mode: ResearchMode): {
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
      case "max":
        return {
          maxResults: 120,
        };
    }
  }

  private emitProgress(
    updateOutput: ((output: ToolResultDisplay) => void) | undefined,
    message: string,
    mode: "append" | "replace" = "append",
  ): void {
    if (!updateOutput) {
      return;
    }
    const payload = `__progress__${JSON.stringify({ mode, message })}`;
    updateOutput(payload);
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
      max: 12,
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

  private async buildIntentProfile(
    signal: AbortSignal,
  ): Promise<IntentProfile> {
    const fallback: IntentProfile = {
      intent: this.params.query,
      constraints: [],
      assumptions: [],
      clarifyingQuestions: [],
      ambiguity: "low",
    };

    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return fallback;
    }

    const prompt = `
Analyze the user's research request and summarize intent, constraints, and uncertainties.

Return valid JSON only with this schema:
{
  "intent": "Concise statement of what the user ultimately wants",
  "constraints": ["Any explicit constraints or scope limits"],
  "assumptions": ["Reasonable assumptions needed to proceed"],
  "clarifying_questions": ["Questions that would materially change the research scope"],
  "ambiguity": "low|medium|high"
}

Keep answers short and specific. If no clarifying questions are needed, return an empty list.

User request:
${this.params.query}
`;

    try {
      const response = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: prompt }] }],
        {},
        signal,
      );
      const raw = (await getResponseText(response)) ?? "";
      const parsed = JSON.parse(this.stripJsonFence(raw || ""));
      return {
        intent: (parsed?.intent ?? this.params.query).trim() || this.params.query,
        constraints: Array.isArray(parsed?.constraints)
          ? parsed.constraints.map((item: string) => String(item).trim()).filter(Boolean)
          : [],
        assumptions: Array.isArray(parsed?.assumptions)
          ? parsed.assumptions.map((item: string) => String(item).trim()).filter(Boolean)
          : [],
        clarifyingQuestions: Array.isArray(parsed?.clarifying_questions)
          ? parsed.clarifying_questions.map((item: string) => String(item).trim()).filter(Boolean)
          : [],
        ambiguity:
          parsed?.ambiguity === "high"
            ? "high"
            : parsed?.ambiguity === "medium"
              ? "medium"
              : "low",
      };
    } catch (_error) {
      return fallback;
    }
  }

  private async buildQueryPlan(
    signal: AbortSignal,
    intentProfile?: IntentProfile,
  ): Promise<QueryPlan> {
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
      max:
        "Generate 10-12 deep, investigative search queries that cover primary, secondary, and emerging dimensions of the user's request.",
    } as const;

    const intentSummary = intentProfile
      ? [
          `Intent: ${intentProfile.intent}`,
          intentProfile.constraints.length
            ? `Constraints: ${intentProfile.constraints.join("; ")}`
            : "Constraints: none specified",
          intentProfile.assumptions.length
            ? `Assumptions: ${intentProfile.assumptions.join("; ")}`
            : "Assumptions: none needed",
          intentProfile.clarifyingQuestions.length
            ? `Clarifying questions: ${intentProfile.clarifyingQuestions.join("; ")}`
            : "Clarifying questions: none",
        ].join("\n")
      : "";

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

${intentSummary ? `Intent profile:\n${intentSummary}\n` : ""}

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
    } catch (_error) {
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
      case "max":
        return [
          baseQuery,
          `${baseQuery} recent developments`,
          `${baseQuery} statistics and data`,
          `${baseQuery} expert analysis`,
          `${baseQuery} historical context`,
          `${baseQuery} risks and opportunities`,
        ];
    }
  }

  private buildQueryVariantsForMode(
    baseQuery: string,
    variantLimit?: number,
  ): string[] {
    const variants = this.buildQueryVariants(baseQuery);
    if (variantLimit && variantLimit > 0) {
      return variants.slice(0, variantLimit);
    }
    return variants;
  }

  private buildEmergentQueryVariants(
    baseQuery: string,
    variantLimit?: number,
  ): string[] {
    const variants = this.buildQueryVariantsForMode(baseQuery, variantLimit);
    if (this.params.mode === "max") {
      return variants.slice(0, 3);
    }
    return variants;
  }

  private buildMaxResearchProfile(
    plan: QueryPlan,
    intentProfile: IntentProfile | null,
  ): MaxResearchProfile {
    const hasClarifyingAnswers = this.params.query.includes(
      "Clarifying answers:",
    );
    const wordCount = this.params.query.trim().split(/\s+/u).length;
    const ambiguity = intentProfile?.ambiguity ?? "medium";
    const complexityScore =
      (wordCount >= 24 ? 2 : wordCount >= 14 ? 1 : 0) +
      (ambiguity === "high" ? 2 : ambiguity === "medium" ? 1 : 0) +
      (hasClarifyingAnswers ? 1 : 0);

    const maxSubQueries =
      complexityScore >= 4
        ? 14
        : complexityScore >= 2
          ? 12
          : 10;
    const maxResults =
      complexityScore >= 4 ? 80 : complexityScore >= 2 ? 60 : 45;
    const variantsPerQuery =
      complexityScore >= 4 ? 5 : complexityScore >= 2 ? 4 : 3;
    const emergentSlots = complexityScore >= 4 ? 4 : 3;

    return {
      maxSubQueries,
      maxResults,
      variantsPerQuery,
      emergentSlots,
    };
  }

  private buildReportHeader(plan: QueryPlan): string {
    return [
      "# Research Report",
      "",
      `- Query: ${this.params.query}`,
      `- Primary topic: ${plan.primaryTopic}`,
      `- Generated: ${new Date().toISOString()}`,
      "",
      "---",
      "",
    ].join("\n");
  }

  private isPdfUrl(url: string): boolean {
    const lowered = url.toLowerCase();
    if (lowered.includes(".pdf")) {
      return true;
    }
    try {
      const parsed = new URL(url);
      return parsed.pathname.toLowerCase().endsWith(".pdf");
    } catch {
      return lowered.split("?")[0].endsWith(".pdf");
    }
  }

  private extractCandidateText(result: unknown): string {
    const candidateParts =
      ((result as {
        response?: {
          candidates?: Array<{ content?: { parts?: unknown[] } }>;
        };
        candidates?: Array<{ content?: { parts?: unknown[] } }>;
      })?.response?.candidates ??
        (result as {
          candidates?: Array<{ content?: { parts?: unknown[] } }>;
        })?.candidates ??
        [])?.[0]?.content?.parts ?? [];

    return candidateParts
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
  }

  private dedupeSubQueries(subQueries: QuerySubtask[]): QuerySubtask[] {
    const seen = new Set<string>();
    const deduped: QuerySubtask[] = [];
    for (const item of subQueries) {
      const normalized = item.query.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      deduped.push(item);
    }
    return deduped;
  }

  private normalizeReportSpec(raw: unknown): ReportSpec {
    const defaultSpec: ReportSpec = {
      summary: "Comprehensive research report.",
      targetWordCount: 2000,
      sections: [
        { title: "Executive Summary", focus: "Key findings and context." },
        { title: "Market Dynamics", focus: "Core mechanisms and structure." },
        { title: "Emergent Issues", focus: "New risks, opportunities, and shifts." },
        { title: "Counterpoints and Uncertainties", focus: "Competing views and limitations." },
        { title: "Open Questions", focus: "Key unknowns and next steps." },
      ],
    };

    if (!raw || typeof raw !== "object") {
      return defaultSpec;
    }

    const candidate = raw as {
      summary?: unknown;
      target_word_count?: unknown;
      sections?: unknown;
    };

    const summary =
      typeof candidate.summary === "string" && candidate.summary.trim().length > 0
        ? candidate.summary.trim()
        : defaultSpec.summary;

    const targetWordCount = Number(candidate.target_word_count);
    const safeTarget =
      Number.isFinite(targetWordCount) && targetWordCount > 0
        ? Math.round(targetWordCount)
        : defaultSpec.targetWordCount;

    const sections = Array.isArray(candidate.sections)
      ? candidate.sections
          .map((section) => {
            const typed = section as { title?: unknown; focus?: unknown };
            return {
              title:
                typeof typed.title === "string"
                  ? typed.title.trim()
                  : "",
              focus:
                typeof typed.focus === "string"
                  ? typed.focus.trim()
                  : "",
            };
          })
          .filter((section) => section.title && section.focus)
      : [];

    return {
      summary,
      targetWordCount: safeTarget,
      sections: sections.length > 0 ? sections : defaultSpec.sections,
    };
  }

  private async buildReportSpec(
    plan: QueryPlan,
    intentProfile: IntentProfile | null,
    evidenceHighlights: string[],
    signal: AbortSignal,
  ): Promise<ReportSpec> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return this.normalizeReportSpec(null);
    }

    const intentBlock = intentProfile
      ? [
          `Intent: ${intentProfile.intent}`,
          intentProfile.constraints.length
            ? `Constraints: ${intentProfile.constraints.join("; ")}`
            : "Constraints: none specified",
          intentProfile.assumptions.length
            ? `Assumptions: ${intentProfile.assumptions.join("; ")}`
            : "Assumptions: none needed",
          intentProfile.clarifyingQuestions.length
            ? `Clarifying questions: ${intentProfile.clarifyingQuestions.join("; ")}`
            : "Clarifying questions: none",
        ].join("\n")
      : "Intent: not available";

    const prompt = `
You are an investigative editor. Draft a report blueprint based on the query complexity and evidence breadth.

Return valid JSON only with this schema:
{
  "summary": "One-line summary of report focus",
  "target_word_count": 1800,
  "sections": [
    { "title": "Section title", "focus": "What this section should cover" }
  ]
}

Guidelines:
- Choose report length based on complexity and evidence density.
- Include 5-9 sections max; include Executive Summary and Open Questions.
- Ensure sections reflect emergent issues, counterpoints, and implications when relevant.

Primary topic: ${plan.primaryTopic}
Research objectives:
${plan.subQueries.map((item, index) => `${index + 1}. ${item.query}`).join("\n")}

${intentBlock}

Evidence highlights:
${evidenceHighlights.slice(0, 30).map((item) => `- ${item}`).join("\n")}
`;

    try {
      const response = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: prompt }] }],
        {},
        signal,
      );
      const raw =
        (await getResponseText(response)) ?? this.extractCandidateText(response);
      const parsed = JSON.parse(this.stripJsonFence(raw || ""));
      return this.normalizeReportSpec(parsed);
    } catch (_error) {
      return this.normalizeReportSpec(null);
    }
  }

  private async generateReportSection(
    section: ReportSectionSpec,
    reportSpec: ReportSpec,
    plan: QueryPlan,
    intentProfile: IntentProfile | null,
    evidenceHighlights: string[],
    subtopicBriefs: string,
    sourceCatalogForPrompt: string,
    signal: AbortSignal,
    avoidPoints?: string[],
  ): Promise<string> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return `## ${section.title}\n\n(LLM unavailable for report generation.)`;
    }

    const intentBlock = intentProfile
      ? [
          `Intent: ${intentProfile.intent}`,
          intentProfile.constraints.length
            ? `Constraints: ${intentProfile.constraints.join("; ")}`
            : "Constraints: none specified",
          intentProfile.assumptions.length
            ? `Assumptions: ${intentProfile.assumptions.join("; ")}`
            : "Assumptions: none needed",
          intentProfile.clarifyingQuestions.length
            ? `Clarifying questions: ${intentProfile.clarifyingQuestions.join("; ")}`
            : "Clarifying questions: none",
        ].join("\n")
      : "";

    const perSectionTarget = Math.max(
      1,
      Math.round(reportSpec.targetWordCount / reportSpec.sections.length),
    );

    const avoidBlock =
      avoidPoints && avoidPoints.length > 0
        ? avoidPoints.map((item) => `- ${item}`).join("\n")
        : "";

    const prompt = `
You are a senior investigative analyst. Write the section below as part of a larger report.

Section title: ${section.title}
Section focus: ${section.focus}
Target length: ~${perSectionTarget} words (adjust as needed based on importance).

Primary topic: ${plan.primaryTopic}
${intentBlock ? `Intent and constraints:\n${intentBlock}\n` : ""}

Subtopic briefs:
${subtopicBriefs || "No subtopic briefs available."}

Evidence highlights:
${evidenceHighlights.slice(0, 40).map((item) => `- ${item}`).join("\n")}

${avoidBlock ? `Already covered (avoid repeating):\n${avoidBlock}\n` : ""}

Available Source Catalog (use these numeric identifiers in citations):
${sourceCatalogForPrompt}

Writing guidelines:
- Use clear paragraphs with an H2 markdown header (## ${section.title}).
- Cite every meaningful claim with inline [number] citations.
- Do not add a Sources/References section.
- Maintain an analytical, neutral tone.
- If evidence supports additional depth, exceed the target length rather than truncating.
- Incorporate a broad spread of sources; avoid over-relying on a single source.
- Do not return an outline or bullet-only response; write full sentences and paragraphs.
- Do not restate points listed in the "Already covered" section; focus on new material.
- Favor a narrative flow that reads like a magazine feature, not a bullet list.
`;

    const result = await geminiClient.generateContent(
      [{ role: "user", parts: [{ text: prompt }] }],
      {},
      signal,
    );
    const responseText =
      (await getResponseText(result)) ?? this.extractCandidateText(result);
    return responseText.trim();
  }

  private async polishMaxReport(
    draft: string,
    plan: QueryPlan,
    intentProfile: IntentProfile | null,
    sourceCatalogForPrompt: string,
    signal: AbortSignal,
  ): Promise<string> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return draft;
    }

    const intentBlock = intentProfile
      ? [
          `Intent: ${intentProfile.intent}`,
          intentProfile.constraints.length
            ? `Constraints: ${intentProfile.constraints.join("; ")}`
            : "Constraints: none specified",
        ].join("\n")
      : "";

    const prompt = `
You are an investigative editor. Rewrite the draft into a cohesive, non-repetitive narrative report with an engaging, reader-forward voice.

Primary topic: ${plan.primaryTopic}
${intentBlock ? `Intent and constraints:\n${intentBlock}\n` : ""}

Draft report:
${draft}

Available Source Catalog (use these numeric identifiers in citations):
${sourceCatalogForPrompt}

Editing rules:
- Preserve all valid citations; do not drop or invent citations.
- Remove repetition and consolidate overlapping points.
- Ensure smooth transitions and a clear narrative arc.
- Keep section headers, but merge sections that repeat each other.
- Do not add a Sources/References section.
- Favor a magazine-feature tone: confident, clear, and subtly conversational without being informal.
`;

    const result = await geminiClient.generateContent(
      [{ role: "user", parts: [{ text: prompt }] }],
      {},
      signal,
    );
    const responseText =
      (await getResponseText(result)) ?? this.extractCandidateText(result);
    return responseText.trim() || draft;
  }

  private async dedupeMaxReport(
    polished: string,
    plan: QueryPlan,
    sourceCatalogForPrompt: string,
    signal: AbortSignal,
    minRetentionRatio = 0.85,
  ): Promise<string> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return polished;
    }

    const wordCount = (text: string) =>
      text.trim().split(/\s+/u).filter(Boolean).length;
    const beforeCount = wordCount(polished);

    const prompt = `
You are a meticulous editor. Remove near-duplicate sentences or paragraphs while preserving meaning and citations.

Primary topic: ${plan.primaryTopic}

Draft report:
${polished}

Available Source Catalog (use these numeric identifiers in citations):
${sourceCatalogForPrompt}

Rules:
- Preserve citations; do not invent or drop citations.
- Remove redundant sentences and repeated facts.
- Keep section headers intact.
- Do not add a Sources/References section.
`;

    const result = await geminiClient.generateContent(
      [{ role: "user", parts: [{ text: prompt }] }],
      {},
      signal,
    );
    const responseText =
      (await getResponseText(result)) ?? this.extractCandidateText(result);
    const candidate = responseText.trim();
    if (!candidate) {
      return polished;
    }
    const afterCount = wordCount(candidate);
    if (beforeCount > 0 && afterCount / beforeCount < minRetentionRatio) {
      return polished;
    }
    return candidate;
  }

  private async addSectionBridges(
    draft: string,
    plan: QueryPlan,
    signal: AbortSignal,
  ): Promise<string> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return draft;
    }

    const sections = draft.split(/\n(?=##\s+)/g);
    if (sections.length < 3) {
      return draft;
    }

    const intro = sections[0]?.trim() ?? "";
    const bodySections = sections.slice(1);
    const bridged: string[] = [intro];

    for (let i = 0; i < bodySections.length; i++) {
      const current = bodySections[i]?.trim() ?? "";
      if (!current) {
        continue;
      }
      bridged.push(current);
      if (i < bodySections.length - 1) {
        const next = bodySections[i + 1]?.trim() ?? "";
        if (!next) {
          continue;
        }
        const prompt = `
Write a 1-2 sentence transition that bridges the end of the current section into the next section.
Keep it analytical, reader-forward, and avoid repeating facts.

Primary topic: ${plan.primaryTopic}

Current section:
${current}

Next section:
${next}
`;
        const result = await geminiClient.generateContent(
          [{ role: "user", parts: [{ text: prompt }] }],
          {},
          signal,
        );
        const responseText =
          (await getResponseText(result)) ?? this.extractCandidateText(result);
        const bridge = responseText.trim();
        if (bridge) {
          bridged.push(bridge);
        }
      }
    }

    return bridged.filter(Boolean).join("\n\n");
  }

  private buildMaxFallbackReport(
    plan: QueryPlan,
    intentProfile: IntentProfile | null,
    evidenceHighlights: string[],
    subtopicBriefs: string,
  ): string {
    const intro = intentProfile?.intent
      ? `This report synthesizes the available evidence to address the intent: ${intentProfile.intent}.`
      : "This report synthesizes the available evidence to address the research request.";
    const highlights = evidenceHighlights.slice(0, 18);
    const highlightParagraphs = highlights.length
      ? highlights.map((item) => `- ${item}`).join("\n")
      : "- Evidence summaries were collected but could not be fully synthesized.";

    return [
      "## Executive Summary",
      "",
      intro,
      "",
      "## Evidence Highlights",
      highlightParagraphs,
      "",
      subtopicBriefs ? "## Subtopic Briefs\n\n" + subtopicBriefs : "",
      "",
      "## Open Questions",
      "- Where additional primary sources would materially improve confidence.",
      "- Which subtopics should be expanded or narrowed based on user priorities.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async discoverEmergentQueries(
    plan: QueryPlan,
    evidence: string,
    signal: AbortSignal,
  ): Promise<QuerySubtask[]> {
    const geminiClient = this.config.getGeminiClient?.();
    if (!geminiClient) {
      return [];
    }

    const prompt = `
You are a research strategist. Based on the evidence collected so far, propose additional focused web search queries that would deepen the investigation.

Guidelines:
- Propose up to 4 new queries.
- Focus on emergent issues, risks, second-order effects, and missing perspectives.
- Avoid duplicating existing queries.
- Provide a short rationale for each.

Primary topic: ${plan.primaryTopic}
Existing queries:
${plan.subQueries.map((item, index) => `${index + 1}. ${item.query}`).join("\n")}

Collected evidence (summaries and highlights):
${evidence}

Respond with valid JSON only:
{
  "sub_queries": [
    { "query": "...", "rationale": "..." }
  ]
}
`;

    try {
      const response = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: prompt }] }],
        {},
        signal,
      );
      const raw = (await getResponseText(response)) ?? "";
      const parsed = JSON.parse(this.stripJsonFence(raw || ""));
      const subQueries = Array.isArray(parsed?.sub_queries)
        ? parsed.sub_queries
            .map((item: { query?: string; rationale?: string }) => ({
              query: (item?.query ?? "").trim(),
              rationale: (item?.rationale ?? "").trim(),
            }))
            .filter((item: QuerySubtask) => item.query.length > 0)
        : [];
      return this.dedupeSubQueries(subQueries);
    } catch (_error) {
      return [];
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

  private buildSourceCatalogForPrompt(
    sources: Array<{ title: string; url: string }>,
  ): string {
    if (sources.length === 0) {
      return "No external sources were captured during search.";
    }

    const maxForPrompt = this.params.mode === "max" ? 160 : 40;
    return sources
      .slice(0, maxForPrompt)
      .map(
        (source, index) =>
          `[${index + 1}] ${this.truncate(source.title || source.url, 140)} — ${source.url}`,
      )
      .join("\n");
  }

  private stripGeneratedSourceSections(content: string): string {
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
  private async assessSourceRelevance(
    topic: string,
    sources: Array<{ title: string; url: string }>,
    citedIndices: Set<number>,
    signal: AbortSignal,
  ): Promise<Set<number>> {
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

      const response = await geminiClient.generateContent(
        [{ role: "user", parts: [{ text: prompt }] }],
        {},
        signal,
      );
      
      const candidates = (
        (response as unknown as { response?: { candidates?: unknown } }).response
          ?.candidates ??
        (response as unknown as { candidates?: unknown }).candidates ??
        []
      ) as Array<{ content?: { parts?: unknown[] } }>;
      
      if (candidates.length > 0) {
        const fallbackParts =
          candidates.length > 0 ? candidates[0]?.content?.parts ?? [] : [];

        const responseText = Array.isArray(fallbackParts)
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
        
        const lines = responseText.split('\n').filter(line => line.trim());
        
        lines.forEach((line, i) => {
          const sourceIndex = sourcesToAssess[i]?.index;
          if (sourceIndex !== undefined && line.toUpperCase().includes('KEEP')) {
            approvedIndices.add(sourceIndex);
          }
        });
      }
      
    } catch (error) {
      // If assessment fails, include all sources to be safe
      sourcesToAssess.forEach(item => approvedIndices.add(item.index));
    }
    
    return approvedIndices;
  }

  private buildCitationMap(
    report: string,
    sources: Array<{ title: string; url: string }>,
  ): Record<string, { content: string; sourceIndex: number }> {
    const citationPattern = /\[(\d+)\]/g;
    const citations: Record<string, { content: string; sourceIndex: number }> =
      {};
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

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

  private async persistReport(content: string, plan: QueryPlan): Promise<string> {
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

    await fs.promises.writeFile(filepath, content, "utf8");
    return path.relative(process.cwd(), filepath);
  }

  private resolveSearchTools(
    toolRegistryOverride?: ReturnType<NonNullable<Config["getToolRegistry"]>>,
  ): Array<typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH> {
    const preferredOrder =
      this.params.searchTools && this.params.searchTools.length > 0
        ? this.params.searchTools
        : [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH];

    const uniqueOrdered: Array<typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH> =
      [];
    const seen = new Set<string>();
    const toolRegistry =
      toolRegistryOverride ?? this.config.getToolRegistry?.();

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
      const diagnostics: string[] = [];
      const toolRegistry = this.config.getToolRegistry?.();
      const hasWebSearch = Boolean(
        toolRegistry?.getTool(ToolNames.WEB_SEARCH),
      );
      const hasSearxngSearch = Boolean(
        toolRegistry?.getTool(ToolNames.SEARXNG_SEARCH),
      );
      const hasWebFetch = Boolean(toolRegistry?.getTool(ToolNames.WEB_FETCH));
      diagnostics.push(
        `Tool availability: web_search=${hasWebSearch ? "yes" : "no"}, searxng_search=${hasSearxngSearch ? "yes" : "no"}, web_fetch=${hasWebFetch ? "yes" : "no"}`,
      );
      this.emitProgress(
        updateOutput,
        `ℹ⚙️ Running ${this.params.mode} research workflow…`,
        "append",
      );

      const intentProfile =
        this.params.mode === "max"
          ? await this.buildIntentProfile(signal)
          : null;
      const plan = await this.buildQueryPlan(
        signal,
        intentProfile ?? undefined,
      );
      const maxProfile =
        this.params.mode === "max"
          ? this.buildMaxResearchProfile(plan, intentProfile)
          : null;
      if (maxProfile) {
        plan.subQueries = plan.subQueries.slice(0, maxProfile.maxSubQueries);
      }
      this.emitProgress(
        updateOutput,
        `ℹ🧭 Query plan established with ${plan.subQueries.length} focus area(s).\n   Primary topic: ${plan.primaryTopic}`,
        "append",
      );

      const normalizedSubQueries: Array<{
        base: string;
        rationale?: string;
      }> = [];
      for (const sub of plan.subQueries) {
        const normalized = await this.rephraseQuery(sub.query, signal);
        normalizedSubQueries.push({ base: normalized, rationale: sub.rationale });
      }

      const { maxResults: defaultMaxResults } = this.getSearchParameters(
        this.params.mode,
      );
      const maxResults = maxProfile?.maxResults ?? defaultMaxResults;
      diagnostics.push(
        `Search tools requested: ${
          this.params.searchTools && this.params.searchTools.length > 0
            ? this.params.searchTools.join(", ")
            : "default"
        }`,
      );
      if (maxProfile) {
        diagnostics.push(
          `Max profile: sub_queries=${maxProfile.maxSubQueries}, max_results=${maxProfile.maxResults}, variants=${maxProfile.variantsPerQuery}, emergent_slots=${maxProfile.emergentSlots}`,
        );
      }
      const resolvedSearchTools = this.resolveSearchTools(toolRegistry);
      if (resolvedSearchTools.length === 0) {
        throw new Error(
          "No web search tools are available. Enable web_search or searxng_search via /toolset.",
        );
      }
      const searchTools = resolvedSearchTools;
      diagnostics.push(
        `Search tool order: ${searchTools
          .map((tool) => this.formatToolName(tool))
          .join(" -> ")}`,
      );

      const searchPlan: Array<{
        query: string;
        toolName: typeof ToolNames.WEB_SEARCH | typeof ToolNames.SEARXNG_SEARCH;
        subIndex: number;
        rationale?: string;
      }> = [];

      normalizedSubQueries.forEach((sub, subIndex) => {
        const variants = this.buildQueryVariantsForMode(
          sub.base,
          maxProfile?.variantsPerQuery,
        );
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
      diagnostics.push(`Initial search plan size: ${searchPlan.length}`);

      this.emitProgress(
        updateOutput,
        `ℹ🔄 Executing ${searchPlan.length} targeted search(es) across ${searchTools
          .map((tool) => this.formatToolName(tool))
          .join(" + ")}`,
        "append",
      );

      const searchResults: string[] = [];
      const searchResultsBySubIndex: Array<string[]> = [];
      const sources: Array<{ title: string; url: string }> = [];
      const seenUrls = new Set<string>();
      const sourceSubtopics = new Map<string, Set<number>>();
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
          `🔎 [${i + 1}/${searchPlan.length}] ${label} → ${this.truncate(query, 90)} (focus ${subIndex + 1}/${plan.subQueries.length}: ${this.truncate(focusLabel, 70)})${rationale ? `\n   ↳ ${this.truncate(rationale, 90)}` : ""}`,
          "replace",
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
          const normalizedSummary = summaryText.replace(/\s+/g, " ");
          searchResults.push(normalizedSummary);
          if (!searchResultsBySubIndex[subIndex]) {
            searchResultsBySubIndex[subIndex] = [];
          }
          searchResultsBySubIndex[subIndex]!.push(normalizedSummary);
          this.emitProgress(
            updateOutput,
            `📌 ${label} highlight: ${this.truncate(
              normalizedSummary,
              160,
            )}`,
            "replace",
          );
        }

        const newlyAdded: Array<{ title: string; url: string }> = [];
        for (const source of result.sources || []) {
          if (!source.url) {
            continue;
          }
          const bucket = sourceSubtopics.get(source.url) ?? new Set<number>();
          bucket.add(subIndex);
          sourceSubtopics.set(source.url, bucket);
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

        const summaryLine =
          newlyAdded.length > 0
            ? `✔ ${label} completed – ${newlyAdded.length} new source(s) added.`
            : `✔ ${label} completed – no new unique sources found.`;
        this.emitProgress(updateOutput, summaryLine, "append");
      }

      let emergentSearchCount = 0;
      if (this.params.mode === "max") {
        const maxTotalSubQueries = maxProfile?.maxSubQueries ?? 16;
        const emergentSlots = maxProfile?.emergentSlots ?? 4;
        const remainingSlots = Math.max(
          0,
          Math.min(emergentSlots, maxTotalSubQueries - plan.subQueries.length),
        );
        const evidenceForEmergent = searchResults
          .slice(0, 30)
          .map((item) => this.truncate(item, 240))
          .join("\n");

        if (remainingSlots > 0 && evidenceForEmergent.trim().length > 0) {
          this.emitProgress(
            updateOutput,
            "ℹ🧩 Scanning for emergent subtopics to deepen the investigation…",
            "append",
          );

          const emergentCandidates = await this.discoverEmergentQueries(
            plan,
            evidenceForEmergent,
            signal,
          );
          diagnostics.push(
            `Emergent queries suggested: ${emergentCandidates.length}`,
          );
          const emergentSubQueries = emergentCandidates.slice(0, remainingSlots);

          if (emergentSubQueries.length > 0) {
            const merged = this.dedupeSubQueries([
              ...plan.subQueries,
              ...emergentSubQueries,
            ]).slice(0, maxTotalSubQueries);
            const initialCount = plan.subQueries.length;
            plan.subQueries = merged;
            const subQueryIndexByQuery = new Map<string, number>();
            plan.subQueries.forEach((sub, index) => {
              subQueryIndexByQuery.set(sub.query.trim().toLowerCase(), index);
            });

            this.emitProgress(
              updateOutput,
              `ℹ🔍 Added ${plan.subQueries.length - initialCount} emergent focus area(s) for deeper coverage.`,
              "append",
            );

            const normalizedEmergent: Array<{
              base: string;
              rationale?: string;
              originalQuery: string;
            }> = [];

            for (const sub of emergentSubQueries) {
              const normalized = await this.rephraseQuery(sub.query, signal);
              normalizedEmergent.push({
                base: normalized,
                rationale: sub.rationale,
                originalQuery: sub.query,
              });
            }

            const emergentSearchPlan: Array<{
              query: string;
              toolName:
                | typeof ToolNames.WEB_SEARCH
                | typeof ToolNames.SEARXNG_SEARCH;
              subIndex: number;
              rationale?: string;
            }> = [];

            normalizedEmergent.forEach((sub, subIndex) => {
              const variants = this.buildEmergentQueryVariants(
                sub.base,
                maxProfile?.variantsPerQuery,
              );
              const planIndex =
                subQueryIndexByQuery.get(sub.originalQuery.trim().toLowerCase()) ??
                initialCount + subIndex;
              variants.forEach((variant) => {
                const toolName =
                  searchTools[
                    emergentSearchPlan.length % searchTools.length
                  ];
                emergentSearchPlan.push({
                  query: variant,
                  toolName,
                  subIndex: planIndex,
                  rationale: sub.rationale,
                });
              });
            });

            if (emergentSearchPlan.length > 0) {
              this.emitProgress(
                updateOutput,
                `ℹ🔄 Executing ${emergentSearchPlan.length} emergent search(es) to fill coverage gaps.`,
                "append",
              );
              emergentSearchCount = emergentSearchPlan.length;
            }

            for (let i = 0; i < emergentSearchPlan.length; i++) {
              const { query, toolName, subIndex, rationale } =
                emergentSearchPlan[i];
              const label = this.formatToolName(toolName);
              const focusLabel = plan.subQueries[subIndex]?.query ?? query;
              this.emitProgress(
                updateOutput,
                `🔎 [${i + 1}/${emergentSearchPlan.length}] ${label} → ${this.truncate(
                  query,
                  90,
                )} (emergent focus ${subIndex + 1}/${plan.subQueries.length}: ${this.truncate(
                  focusLabel,
                  70,
                )})${rationale ? `\n   ↳ ${this.truncate(rationale, 90)}` : ""}`,
                "replace",
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
                const normalizedSummary = summaryText.replace(/\s+/g, " ");
                searchResults.push(normalizedSummary);
                if (!searchResultsBySubIndex[subIndex]) {
                  searchResultsBySubIndex[subIndex] = [];
                }
                searchResultsBySubIndex[subIndex]!.push(normalizedSummary);
                this.emitProgress(
                  updateOutput,
                  `📌 ${label} highlight: ${this.truncate(
                    normalizedSummary,
                    160,
                  )}`,
                  "replace",
                );
              }

              const newlyAdded: Array<{ title: string; url: string }> = [];
              for (const source of result.sources || []) {
                if (!source.url) {
                  continue;
                }
                const bucket =
                  sourceSubtopics.get(source.url) ?? new Set<number>();
                bucket.add(subIndex);
                sourceSubtopics.set(source.url, bucket);
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

              const summaryLine =
                newlyAdded.length > 0
                  ? `✔ ${label} completed – ${newlyAdded.length} new source(s) added.`
                  : `✔ ${label} completed – no new unique sources found.`;
              this.emitProgress(updateOutput, summaryLine, "append");
            }
          }
        }
      }
      diagnostics.push(`Emergent searches executed: ${emergentSearchCount}`);

      if (sources.length === 0) {
        this.emitProgress(
          updateOutput,
          "⚠️ No sources were discovered during web search.",
          "append",
        );
      } else {
        this.emitProgress(
          updateOutput,
          `ℹ📁 Collected ${sources.length} unique source(s) for deeper review.`,
          "append",
        );
      }

      // Step 3: Process relevant documents from URLs
      const fetchTool = new WebFetchTool(this.config);
      const processedDocuments: string[] = [];
      const documentSnippets: string[] = [];
      const documentSnippetsBySubIndex: Array<string[]> = [];
      const sourcesForProcessing = sources.slice(
        0,
        Math.min(maxResults, sources.length),
      );
      let pdfFetchAttempts = 0;
      let pdfFetchSuccesses = 0;
      let pdfFetchFailures = 0;
      const pdfFailureReasons = new Map<string, number>();
      const pdfFailureSamples: Array<{ url: string; reason: string }> = [];
      diagnostics.push(
        `Sources collected: ${sources.length} | Sources summarized: ${sourcesForProcessing.length}`,
      );

      if (sourcesForProcessing.length > 0) {
        this.emitProgress(
          updateOutput,
          `ℹ📰 Summarizing top ${sourcesForProcessing.length} source(s) for detailed insights.`,
          "append",
        );
      }

      for (let i = 0; i < sourcesForProcessing.length; i++) {
        const source = sourcesForProcessing[i];
        const isPdf = this.isPdfUrl(source.url);
        if (isPdf) {
          pdfFetchAttempts += 1;
        }
        this.emitProgress(
          updateOutput,
          `📰 [${i + 1}/${sourcesForProcessing.length}] Summarizing ${this.truncate(
            source.title || source.url,
            120,
          )}`,
          "replace",
        );

        try {
          const fetchInvocation = fetchTool.build({
            url: source.url,
            prompt: `Summarize the key information from this page relevant to the research question: "${this.params.query}"`,
          });
          const fetchResult = await fetchInvocation.execute(signal);

          const fetchText = partToString(fetchResult.llmContent || "");
          if (isPdf) {
            const displayText = String(fetchResult.returnDisplay ?? "");
            const errorMessage = fetchResult.error?.message ?? "";
            if (/PDF extracted/i.test(displayText)) {
              pdfFetchSuccesses += 1;
            } else if (errorMessage) {
              pdfFetchFailures += 1;
              const lowered = errorMessage.toLowerCase();
              let key = "other";
              if (lowered.includes("module is not available")) {
                key = "module_missing";
              } else if (lowered.includes("exceeds size limit")) {
                key = "size_limit";
              } else if (lowered.includes("timed out")) {
                key = "timeout";
              } else if (
                lowered.includes("extraction failed") ||
                lowered.includes("parsed but no extractable text")
              ) {
                key = "parse_error";
              }
              pdfFailureReasons.set(key, (pdfFailureReasons.get(key) ?? 0) + 1);
              if (pdfFailureSamples.length < 5) {
                pdfFailureSamples.push({
                  url: source.url,
                  reason: errorMessage,
                });
              }
            } else if (displayText) {
              pdfFetchFailures += 1;
              pdfFailureReasons.set(
                "other",
                (pdfFailureReasons.get("other") ?? 0) + 1,
              );
              if (pdfFailureSamples.length < 5) {
                pdfFailureSamples.push({
                  url: source.url,
                  reason: displayText,
                });
              }
            }
          }
          if (fetchText.trim()) {
            processedDocuments.push(fetchText);
            const normalizedText = fetchText.replace(/\s+/g, " ");
            documentSnippets.push(normalizedText);
            const subtopicIndices = sourceSubtopics.get(source.url);
            if (subtopicIndices) {
              for (const index of subtopicIndices) {
                if (!documentSnippetsBySubIndex[index]) {
                  documentSnippetsBySubIndex[index] = [];
                }
                documentSnippetsBySubIndex[index]!.push(normalizedText);
              }
            }
            this.emitProgress(
              updateOutput,
              `✅ Captured insights from ${this.truncate(
                source.title || source.url,
                100,
              )}`,
              "replace",
            );
          } else {
            this.emitProgress(
              updateOutput,
              `ℹ No summarizable content returned from ${this.truncate(
                source.title || source.url,
                100,
              )}.`,
              "replace",
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          this.emitProgress(
            updateOutput,
            `⚠️ Error fetching ${this.truncate(
              source.title || source.url,
              90,
            )}: ${this.truncate(errorMessage, 120)}`,
            "replace",
          );
        }

        this.emitProgress(
          updateOutput,
          `✔ Summarized ${this.truncate(source.title || source.url, 100)}`,
          "append",
        );
      }

      if (pdfFetchAttempts > 0) {
        diagnostics.push(
          `PDF extraction: attempted=${pdfFetchAttempts}, succeeded=${pdfFetchSuccesses}, failed=${pdfFetchFailures}`,
        );
        if (pdfFailureReasons.size > 0) {
          diagnostics.push(
            `PDF extraction failures: ${Array.from(pdfFailureReasons.entries())
              .map(([reason, count]) => `${reason}=${count}`)
              .join(", ")}`,
          );
        }
        if (pdfFailureSamples.length > 0) {
          diagnostics.push(
            `PDF failure samples: ${pdfFailureSamples
              .map(
                (sample) =>
                  `${this.truncate(sample.url, 60)} -> ${this.truncate(
                    sample.reason,
                    80,
                  )}`,
              )
              .join(" | ")}`,
          );
        }
      }

      // Step 4: Combine all information and generate a final report
      const combinedContent =
        this.params.mode === "max"
          ? ""
          : [...searchResults, ...processedDocuments].join("\n\n---\n\n");

      const subtopicBriefs =
        this.params.mode === "max"
          ? plan.subQueries
              .map((sub, index) => {
                const highlights = [
                  ...(searchResultsBySubIndex[index] ?? []),
                  ...(documentSnippetsBySubIndex[index] ?? []),
                ];
                const keyPoints = this.extractKeyPoints(
                  highlights,
                  this.params.mode === "max" ? 6 : 4,
                );
                if (keyPoints.length === 0) {
                  return "";
                }
                return [
                  `### ${sub.query}`,
                  ...keyPoints.map((point) => `- ${point}`),
                ].join("\n");
              })
              .filter(Boolean)
              .join("\n\n")
          : "";

      const evidenceHighlights = this.extractKeyPoints(
        [...searchResults, ...documentSnippets],
        this.params.mode === "max" ? 90 : 24,
      );
      diagnostics.push(`Evidence highlights: ${evidenceHighlights.length}`);

      const sourceCatalogForPrompt = this.buildSourceCatalogForPrompt(sources);
      
      // Create a prompt that follows Perplexica's structure for generating the final report
      const planSummary = plan.subQueries
        .map(
          (sub, index) =>
            `${index + 1}. ${sub.query}${
              sub.rationale ? ` — ${sub.rationale}` : ""
            }`,
        )
        .join("\n");

      const intentBlock = intentProfile
        ? [
            `Intent: ${intentProfile.intent}`,
            intentProfile.constraints.length
              ? `Constraints: ${intentProfile.constraints.join("; ")}`
              : "Constraints: none specified",
            intentProfile.assumptions.length
              ? `Assumptions: ${intentProfile.assumptions.join("; ")}`
              : "Assumptions: none needed",
            intentProfile.clarifyingQuestions.length
              ? `Clarifying questions (for the user): ${intentProfile.clarifyingQuestions.join("; ")}`
              : "Clarifying questions: none",
          ].join("\n")
        : "";

      const narrativeGuidance =
        this.params.mode === "quality"
          ? "Produce a long-form feature article (8-10 robust paragraphs) that reads like a magazine investigation."
          : this.params.mode === "balanced"
            ? "Produce a cohesive narrative article (6-8 paragraphs) that balances depth with readability."
            : "Produce a concise narrative briefing (4-6 paragraphs) that still delivers context and insight.";

      const finalPrompt = `
You are an investigative research writer. Use the supplied plan and evidence to craft a cohesive narrative report.

Primary Topic: ${plan.primaryTopic}

Research Objectives:
${planSummary}

${intentBlock ? `Intent & constraints:\n${intentBlock}\n` : ""}

${subtopicBriefs ? `Subtopic evidence briefs (for depth and coverage):\n${subtopicBriefs}\n` : ""}

Synthesized Evidence (search highlights, document summaries, quantitative snippets):
${combinedContent}

Available Source Catalog (use these numeric identifiers in citations):
${sourceCatalogForPrompt}

Writing Guidelines:
- ${narrativeGuidance}
- Use section headers only when they improve clarity.
- Write primarily in flowing paragraphs; reserve bullet or table structures only for dense data recaps.
- Open with an engaging overview, develop the story with clear transitions, and close with implications or recommended next steps.
- Integrate data points, historical context, and qualitative insights, explaining their significance.
- Cite every meaningful statement using inline citations in [number] format referencing the Source Catalog above.
- Do not invent citations or reuse a number for multiple distinct sources.
- Maintain a neutral, evidence-driven tone suitable for analysts and decision makers.
- Do not add a Sources/References section; one will be appended automatically.
`;
      
      this.emitProgress(
        updateOutput,
        "ℹ🧠 Synthesizing final report…",
        "append",
      );

      let resultText = "";
      let fallbackReason = "";
      if (this.params.mode === "max") {
        this.emitProgress(
          updateOutput,
          "ℹ📐 Building a dynamic report blueprint…",
          "append",
        );
      const reportSpec = await this.buildReportSpec(
          plan,
          intentProfile ?? null,
          evidenceHighlights,
          signal,
        );
        diagnostics.push(
          `Report spec: target_words=${reportSpec.targetWordCount}, sections=${reportSpec.sections.length}`,
        );
        if (maxProfile) {
          diagnostics.push(
            `Report pipeline: multi-section synthesis with redundancy suppression`,
          );
        }
        const sectionOutputs: string[] = [];
        const coveredPoints: string[] = [];
        for (const section of reportSpec.sections) {
          this.emitProgress(
            updateOutput,
            `✍️ Drafting section: ${section.title}`,
            "replace",
          );
          const sectionText = await this.generateReportSection(
            section,
            reportSpec,
            plan,
            intentProfile ?? null,
            evidenceHighlights,
            subtopicBriefs,
            sourceCatalogForPrompt,
            signal,
            coveredPoints.slice(0, 16),
          );
          if (sectionText.trim()) {
            sectionOutputs.push(sectionText.trim());
            const newPoints = this.extractKeyPoints([sectionText], 6);
            newPoints.forEach((point) => {
              if (!coveredPoints.includes(point)) {
                coveredPoints.push(point);
              }
            });
          }
        }
        const draftReport = sectionOutputs.join("\n\n");
        if (draftReport.trim()) {
          this.emitProgress(
            updateOutput,
            "🧩 Polishing narrative flow and removing repetition…",
            "append",
          );
          resultText = await this.polishMaxReport(
            draftReport,
            plan,
            intentProfile ?? null,
            sourceCatalogForPrompt,
            signal,
          );
          diagnostics.push("Report polish: applied (narrative)");
          if (resultText.trim()) {
            this.emitProgress(
              updateOutput,
              "🔎 Removing residual repetition…",
              "append",
            );
            resultText = await this.dedupeMaxReport(
              resultText,
              plan,
              sourceCatalogForPrompt,
              signal,
            );
            diagnostics.push("Report polish: applied (dedupe)");
            if (resultText.trim()) {
              this.emitProgress(
                updateOutput,
                "🧭 Smoothing transitions between sections…",
                "append",
              );
              resultText = await this.addSectionBridges(
                resultText,
                plan,
                signal,
              );
              diagnostics.push("Report polish: applied (bridges)");
            }
          }
        } else {
          resultText = draftReport;
          diagnostics.push("Report polish: skipped (empty draft)");
        }
        if (!resultText.trim()) {
          fallbackReason = "Section generation returned empty output.";
        }
      } else {
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

        const responseText = (await getResponseText(result)) ?? candidateText;
        resultText = responseText && responseText.trim().length > 0
          ? responseText
          : candidateText;
        if (!resultText.trim()) {
          fallbackReason = "LLM returned empty response.";
        }
      }
      const fallbackSummary =
        this.params.mode === "max"
          ? this.buildMaxFallbackReport(
              plan,
              intentProfile ?? null,
              evidenceHighlights,
              subtopicBriefs,
            )
          : this.buildFallbackReport(
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
      if (!resultText.trim()) {
        diagnostics.push("Report generation: fallback");
        diagnostics.push(`Fallback reason: ${fallbackReason || "Unknown"}`);
      } else {
        diagnostics.push("Report generation: full");
      }

      const cleanedReport = this.stripGeneratedSourceSections(
        finalContent.trim(),
      );
      const citations = this.buildCitationMap(cleanedReport, sources);
      
      // Get indices of sources that are actually cited in the report
      const citedIndices = new Set(Object.values(citations).map(c => c.sourceIndex));
      
      // Use LLM to assess which non-cited sources should be kept
      this.emitProgress(
        updateOutput,
        "ℹ🔍 Assessing source quality and relevance…",
        "append",
      );
      
      const approvedSourceIndices = await this.assessSourceRelevance(
        this.params.query,
        sources,
        citedIndices,
        signal,
      );
      
      // Filter sources to only include cited + approved ones
      const filteredSources = sources.filter((_, index) => approvedSourceIndices.has(index));
      
      this.emitProgress(
        updateOutput,
        `✅ Filtered to ${filteredSources.length} relevant sources (kept ${citedIndices.size} cited + ${filteredSources.length - citedIndices.size} approved).`,
        "append",
      );
      
      this.emitProgress(
        updateOutput,
        resultText.trim().length > 0
          ? `✅ Research complete. Compiled ${filteredSources.length} relevant source(s).`
          : `✅ Research complete. Compiled ${filteredSources.length} relevant source(s) and generated a summary from collected material.`,
        "append",
      );

      const reportHeader = this.buildReportHeader(plan);
      const sourcesSection = filteredSources.length
        ? [
            "",
            "## Sources",
            ...filteredSources.map(
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

      const diagnosticsSection = diagnostics.length
        ? ["", "## Diagnostics", ...diagnostics.map((line) => `- ${line}`)].join("\n")
        : "";

      const finalReport = [
        reportHeader,
        cleanedReport,
        toolUsageSection,
        diagnosticsSection,
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
    } catch (error: unknown) {
      const errorMessage = `Error during research for query "${this.params.query}": ${getErrorMessage(
        error,
      )}`;
      
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
      "Conducts deep internet research using multiple sources with citation support. Supports speed, balanced, quality, and max modes.",
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
            enum: ["speed", "balanced", "quality", "max"],
            description: "Optimization mode - speed, balanced, quality, or max.",
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
    
    if (
      params.mode !== "speed" &&
      params.mode !== "balanced" &&
      params.mode !== "quality" &&
      params.mode !== "max"
    ) {
      return "The 'mode' parameter must be one of: speed, balanced, quality, max";
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
