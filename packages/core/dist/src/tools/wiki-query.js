/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";
import { ApprovalMode } from "../config/config.js";
import { ToolConfirmationOutcome } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
// Wiki directory constants (must match wiki-init.ts)
const WIKI_DIR = ".lowcal";
/**
 * Scans the wiki index and returns page paths that are relevant to a query.
 * Uses simple keyword matching against category headers and entry summaries.
 */
export async function findRelevantPages(wikiRoot, question) {
    const indexPath = path.join(wikiRoot, "index.md");
    let indexContent = "";
    try {
        indexContent = await fs.readFile(indexPath, "utf-8");
    }
    catch {
        return [];
    }
    // Extract all [[wikilink]] references from the index
    const pageLinks = [];
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = linkRegex.exec(indexContent)) !== null) {
        pageLinks.push(match[1]);
    }
    // Score pages by keyword relevance to the question
    const keywords = question
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2); // Ignore short words
    if (keywords.length === 0) {
        return pageLinks.slice(0, 5); // Return first few pages as fallback
    }
    const scored = pageLinks.map((pageName) => {
        const lowerName = pageName.toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
            if (lowerName.includes(keyword)) {
                score += 3; // Exact word match in name is strong signal
            }
            else {
                // Partial match (e.g., "react" matches "reactivity")
                const nameWords = lowerName.replace(/[-_]/g, " ").split(" ");
                for (const word of nameWords) {
                    if (word.includes(keyword) || keyword.includes(word)) {
                        score += 1;
                    }
                }
            }
        }
        return { pageName, score };
    });
    // Return top-scoring pages (at least those with score > 0, capped at 10)
    const relevant = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((s) => s.pageName);
    // If no pages scored, return all pages (let the LLM decide)
    return relevant.length > 0 ? relevant : pageLinks.slice(0, 5);
}
/**
 * Reads wiki page content given a page name. Searches across all subdirectories.
 */
export async function readWikiPage(wikiRoot, pageName) {
    const slug = pageName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + ".md";
    // Search in all wiki subdirectories
    const subdirs = ["entities", "concepts", "comparisons", "syntheses"];
    for (const subdir of subdirs) {
        const candidatePath = path.join(wikiRoot, subdir, slug);
        try {
            const content = await fs.readFile(candidatePath, "utf-8");
            return { path: `${subdir}/${slug}`, content };
        }
        catch {
            // Try without .md extension in filename (some pages might not have it)
            continue;
        }
    }
    // Also try direct match (pageName might already be a slug)
    for (const subdir of subdirs) {
        const candidatePath = path.join(wikiRoot, subdir, pageName);
        try {
            const content = await fs.readFile(candidatePath, "utf-8");
            return { path: `${subdir}/${pageName}`, content };
        }
        catch {
            continue;
        }
    }
    return null;
}
/**
 * Gathers all wiki page contents for a set of relevant pages.
 */
export async function gatherWikiContext(wikiRoot, question) {
    // Read the full index first
    const indexPath = path.join(wikiRoot, "index.md");
    let indexContent = "";
    try {
        indexContent = await fs.readFile(indexPath, "utf-8");
    }
    catch {
        indexContent = "(No wiki index found)";
    }
    // Find relevant pages and read their content
    const relevantPages = await findRelevantPages(wikiRoot, question);
    const pages = [];
    for (const pageName of relevantPages) {
        const pageResult = await readWikiPage(wikiRoot, pageName);
        if (pageResult) {
            pages.push({
                name: pageName,
                path: pageResult.path,
                content: pageResult.content,
            });
        }
    }
    return { indexContent, pages };
}
class WikiQueryToolInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    getDescription() {
        return `Querying wiki for: "${this.params.question}"`;
    }
    async shouldConfirmExecute(_abortSignal) {
        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }
        const confirmationDetails = {
            type: "info",
            title: "Confirm Wiki Query",
            prompt: `Search the wiki for: "${this.params.question}"`,
            onConfirm: async (outcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
                }
            },
        };
        return confirmationDetails;
    }
    async execute(_signal) {
        try {
            const targetDir = this.config.getTargetDir();
            const wikiRoot = path.join(targetDir, WIKI_DIR, "wiki");
            // Verify wiki is initialized
            try {
                await fs.access(path.join(wikiRoot, "index.md"));
            }
            catch {
                return {
                    llmContent: `Wiki not initialized. Run wiki_init first to set up the wiki directory structure.`,
                    returnDisplay: "Wiki not initialized",
                    error: {
                        message: "Wiki not initialized. Run wiki_init first.",
                        type: ToolErrorType.EXECUTION_FAILED,
                    },
                };
            }
            // Gather context from wiki
            const { indexContent, pages } = await gatherWikiContext(wikiRoot, this.params.question);
            if (pages.length === 0) {
                return {
                    llmContent: `The wiki is empty or has no relevant content for the question "${this.params.question}". Consider ingesting some sources first using wiki_ingest.`,
                    returnDisplay: "No relevant wiki pages found",
                };
            }
            // Build context payload for the LLM to synthesize an answer
            const pageContents = pages
                .map((p) => `--- ${p.path} ---\n${p.content}`)
                .join("\n\n");
            const queryContext = `## Wiki Query Context

**Question:** ${this.params.question}
**Format Preference:** ${this.params.format || "markdown"}
**Relevant Pages Found:** ${pages.length}

### Wiki Index Overview
\`\`\`
${indexContent}
\`\`\`

### Relevant Page Contents
${pageContents}

---

Please synthesize an answer to the question using only the wiki content above. Include inline citations like [see: entities/PageName] when referencing specific pages.`;
            return {
                llmContent: queryContext,
                returnDisplay: `Found ${pages.length} relevant wiki page(s) for "${this.params.question}"`,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const rawError = `Error during wiki query: ${errorMessage}`;
            return {
                llmContent: rawError,
                returnDisplay: "Wiki query failed",
                error: {
                    message: rawError,
                    type: ToolErrorType.EXECUTION_FAILED,
                },
            };
        }
    }
}
/**
 * Implementation of the WikiQuery tool logic.
 * Scans the wiki index for relevant pages, reads their content, and provides
 * structured context to the LLM for answer synthesis with citations.
 */
export class WikiQueryTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.WIKI_QUERY;
    constructor(config) {
        super(WikiQueryTool.Name, "WikiQuery", "Search the LowCal wiki and synthesize an answer from compiled knowledge. Scans the wiki index for relevant pages, reads their content, and provides structured context with inline citations. Use this to query your project's institutional memory rather than re-deriving answers from raw sources.", Kind.Search, {
            properties: {
                question: {
                    description: "The question to answer using the compiled wiki knowledge base.",
                    type: "string",
                },
                format: {
                    description: 'Output format preference. "markdown" for prose (default), "table" for comparison tables, "bullet" for bullet-point summaries.',
                    type: "string",
                    enum: ["markdown", "table", "bullet"],
                },
                file_output: {
                    description: "Whether to save high-value answers as new synthesis pages in the wiki. Defaults to false.",
                    type: "boolean",
                },
            },
            required: ["question"],
            type: "object",
        });
        this.config = config;
    }
    validateToolParamValues(params) {
        if (!params.question || typeof params.question !== "string" || params.question.trim() === "") {
            return "The 'question' parameter cannot be empty.";
        }
        if (params.format &&
            params.format !== "markdown" &&
            params.format !== "table" &&
            params.format !== "bullet") {
            return "The 'format' parameter must be one of: markdown, table, bullet.";
        }
        return null;
    }
    createInvocation(params) {
        return new WikiQueryToolInvocation(this.config, params);
    }
}
//# sourceMappingURL=wiki-query.js.map