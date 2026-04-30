/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";
import { ApprovalMode } from "../config/config.js";
import type {
  ToolCallConfirmationDetails,
  ToolLocation,
} from "./tools.js";
import { ToolConfirmationOutcome } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";

/**
 * Parameters for the WikiIngestTool
 */
export interface WikiIngestToolParams {
  /**
   * Path to the source file or URL to ingest into the wiki.
   */
  source: string;

  /**
   * Whether to discuss key takeaways with the user before writing ("supervised")
   * or process directly ("batch"). Defaults to "supervised".
   */
  mode?: "supervised" | "batch";
}

// Wiki directory constants (must match wiki-init.ts)
const WIKI_DIR = ".lowcal";

/**
 * Represents a page that was created or updated during ingestion.
 */
export interface WikiPageChange {
  /** Relative path within the wiki directory (e.g., "entities/react.md") */
  relativePath: string;
  /** Whether this is a new page ("created") or an update to existing content ("updated") */
  action: "created" | "updated";
  /** One-line summary of what changed */
  summary: string;
}

/**
 * Represents a contradiction found between new and existing wiki content.
 */
export interface WikiContradiction {
  /** The page where the contradiction was found */
  page: string;
  /** What the existing wiki says */
  existingClaim: string;
  /** What the new source says */
  newClaim: string;
}

/**
 * Result of an ingestion operation.
 */
export interface WikiIngestResult {
  /** Source that was ingested */
  source: string;
  /** Pages created or updated */
  pagesChanged: WikiPageChange[];
  /** Contradictions found between new and existing content */
  contradictions: WikiContradiction[];
}

/**
 * Converts a page title to a valid filename slug.
 * e.g., "React Hooks" -> "react-hooks.md"
 */
export function toSlug(title: string): string {
  return (
    title
      .toLowerCase()
      // Replace non-alphanumeric chars with hyphens
      .replace(/[^a-z0-9]+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      + ".md"
  );
}

/**
 * Extracts [[wikilink]] references from markdown content.
 */
export function extractWikilinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
  return matches.map((m) => m.slice(2, -2));
}

/**
 * Reads the wiki index and returns a map of category -> list of page entries.
 */
export async function readWikiIndex(wikiRoot: string): Promise<Record<string, string[]>> {
  const indexPath = path.join(wikiRoot, "index.md");
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const categories: Record<string, string[]> = {};

    // Parse markdown headers as category keys
    const lines = content.split("\n");
    let currentCategory = "";
    for (const line of lines) {
      const headerMatch = line.match(/^##\s+(.+)$/);
      if (headerMatch) {
        currentCategory = headerMatch[1].trim();
        if (!categories[currentCategory]) {
          categories[currentCategory] = [];
        }
        continue;
      }

      // Extract page entries (lines with [[wikilinks]], [text](links), or plain text)
      const wikiLinkMatch = line.match(/^-[\s*]+\[\[([^\]]+)\]\]/);
      const mdLinkMatch = line.match(/^-[\s*]+\[([^\]]+)\]\([^)]+\)/);
      const plainMatch = line.match(/^-[\s*]+(.+)/);

      if (currentCategory) {
        let pageName: string | null = null;
        if (wikiLinkMatch) {
          pageName = wikiLinkMatch[1];
        } else if (mdLinkMatch) {
          pageName = mdLinkMatch[1];
        } else if (plainMatch) {
          pageName = plainMatch[1].trim();
        }

        if (pageName && !pageName.startsWith("_No ")) {
          categories[currentCategory].push(pageName);
        }
      }
    }

    return categories;
  } catch {
    return {};
  }
}

/**
 * Updates the wiki index.md with new or changed page entries.
 */
export async function updateWikiIndex(
  wikiRoot: string,
  changes: WikiPageChange[],
): Promise<void> {
  const indexPath = path.join(wikiRoot, "index.md");
  let content = "";

  try {
    content = await fs.readFile(indexPath, "utf-8");
  } catch {
    // Index doesn't exist yet — create it
    content = "# Wiki Index\n\nThis file catalogs all pages in the knowledge wiki. It is automatically maintained by the LLM agent.\n";
  }

  // Group changes by category (derived from relative path prefix)
  const categories: Record<string, WikiPageChange[]> = {};
  for (const change of changes) {
    const [category] = change.relativePath.split("/");
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(change);
  }

  // For each category, add new entries to the index
  for (const [category, catChanges] of Object.entries(categories)) {
    const sectionHeader = `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;

    if (!content.includes(sectionHeader)) {
      // Add new category section before "## Syntheses" or at end
      const insertionPoint = content.includes("## Syntheses")
        ? content.indexOf("## Syntheses")
        : content.length;

      content =
        content.slice(0, insertionPoint) +
        `${sectionHeader}\n` +
        catChanges.map((c) => `- [[${path.basename(c.relativePath, ".md")}]]: ${c.summary}`).join("\n") +
        "\n\n" +
        content.slice(insertionPoint);
    } else {
      // Add entries under existing category section
      const sectionStart = content.indexOf(sectionHeader);
      const nextSectionMatch = content.slice(sectionStart + sectionHeader.length).match(/^\n(?=## )/);
      const sectionEnd = nextSectionMatch
        ? sectionStart + sectionHeader.length + nextSectionMatch.index!
        : content.length;

      // Find the start of entries in this section (after header and blank line)
      const sectionContent = content.slice(sectionStart, sectionEnd);
      const entriesStart = sectionContent.search(/\n\n/) !== -1
        ? sectionStart + sectionHeader.length + sectionContent.indexOf("\n\n") + 2
        : sectionStart + sectionHeader.length;

      // Add new entries at the end of this category's entries (before blank line)
      const newEntries = catChanges
        .map((c) => `- [[${path.basename(c.relativePath, ".md")}]]: ${c.summary}`)
        .join("\n");

      content =
        content.slice(0, entriesStart) +
        newEntries + "\n" +
        content.slice(entriesStart);
    }
  }

  await fs.writeFile(indexPath, content, "utf-8");
}

/**
 * Appends an entry to the wiki log.md.
 */
export async function appendWikiLog(
  wikiRoot: string,
  entry: string,
): Promise<void> {
  const logPath = path.join(wikiRoot, "log.md");
  const timestamp = new Date().toISOString();
  const logEntry = `## [${timestamp}] ${entry}\n\n---\n`;

  try {
    const existing = await fs.readFile(logPath, "utf-8");
    // Remove trailing separator if present, then append new entry
    const cleaned = existing.replace(/---\s*$/, "").trimEnd();
    await fs.writeFile(logPath, `${cleaned}\n${logEntry}`, "utf-8");
  } catch {
    // Log doesn't exist yet — create it
    await fs.writeFile(logPath, `# Wiki Log\n\nAppend-only record of all wiki operations.\n\n${logEntry}`, "utf-8");
  }
}

class WikiIngestToolInvocation extends BaseToolInvocation<WikiIngestToolParams, ToolResult> {
  constructor(
    private config: Config,
    params: WikiIngestToolParams,
  ) {
    super(params);
  }

  override toolLocations(): ToolLocation[] {
    const targetDir = this.config.getTargetDir();
    return [
      { path: path.join(targetDir, WIKI_DIR, "wiki") },
      { path: this.params.source },
    ];
  }

  override getDescription(): string {
    return `Ingesting source "${this.params.source}" into wiki (${this.params.mode || "supervised"} mode)`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: "info",
      title: "Confirm Wiki Ingestion",
      prompt: `Ingest source "${this.params.source}" into the wiki? This will read the source, extract knowledge, and create/update wiki pages.`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };
    return confirmationDetails;
  }

  override async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const targetDir = this.config.getTargetDir();
      const wikiRoot = path.join(targetDir, WIKI_DIR, "wiki");

      // Verify wiki is initialized
      try {
        await fs.access(path.join(wikiRoot, "index.md"));
      } catch {
        return {
          llmContent: `Wiki not initialized. Run wiki_init first to set up the wiki directory structure.`,
          returnDisplay: "Wiki not initialized",
          error: {
            message: "Wiki not initialized. Run wiki_init first.",
            type: ToolErrorType.EXECUTION_FAILED,
          },
        };
      }

      // Read source content
      let sourceContent: string;
      const sourcePath = this.params.source;

      try {
        // Try as file path first (resolve relative to target dir)
        const resolvedPath = path.isAbsolute(sourcePath)
          ? sourcePath
          : path.resolve(targetDir, sourcePath);
        sourceContent = await fs.readFile(resolvedPath, "utf-8");
      } catch {
        // If it's a URL or the file doesn't exist, return an instructive error
        // that tells the LLM to use web_fetch first
        if (sourcePath.startsWith("http://") || sourcePath.startsWith("https://")) {
          return {
            llmContent: `Source is a URL. Use web_fetch tool to retrieve content first, then provide the saved file path to wiki_ingest.`,
            returnDisplay: "URL sources require pre-fetching",
            error: {
              message: "URL sources must be fetched with web_fetch before ingestion.",
              type: ToolErrorType.EXECUTION_FAILED,
            },
          };
        }
        return {
          llmContent: `Source file not found: ${sourcePath}`,
          returnDisplay: "Source file not found",
          error: {
            message: `Source file not found: ${sourcePath}`,
            type: ToolErrorType.FILE_NOT_FOUND,
          },
        };
      }

      // Copy source to raw/ for archival (immutable ground truth)
      const rawDir = path.join(targetDir, WIKI_DIR, "raw");
      await fs.mkdir(rawDir, { recursive: true });

      const sourceBasename = path.basename(sourcePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const archivedName = `${timestamp}_${sourceBasename}`;
      const rawPath = path.join(rawDir, archivedName);
      await fs.writeFile(rawPath, sourceContent, "utf-8");

      // Generate a summary of the source content for the LLM to work with
      const sourceSummary = this.generateSourceSummary(sourceContent, sourcePath);

      // Build the ingest prompt that instructs the LLM on what pages to create/update
      const ingestInstructions = this.buildIngestInstructions(
        sourceSummary,
        sourcePath,
        wikiRoot,
      );

      // Append to log
      await appendWikiLog(wikiRoot, `ingest | Source: ${sourceBasename} (${this.params.mode || "supervised"} mode)`);

      const resultMessage = `Source "${sourceBasename}" ingested and archived to .lowcal/raw/${archivedName}.

${sourceSummary}

${ingestInstructions}`;

      return {
        llmContent: resultMessage,
        returnDisplay: `Ingested source: ${sourceBasename}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const rawError = `Error during wiki ingestion: ${errorMessage}`;
      return {
        llmContent: rawError,
        returnDisplay: "Wiki ingestion failed",
        error: {
          message: rawError,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  /**
   * Generates a brief summary of the source content.
   * For large files, this extracts key sections and metadata.
   */
  private generateSourceSummary(content: string, sourcePath: string): string {
    const lines = content.split("\n");
    const lineCount = lines.length;
    const charCount = content.length;

    let summary = `**Source:** ${path.basename(sourcePath)}\n`;
    summary += `**Size:** ${lineCount} lines, ${charCount.toLocaleString()} characters\n\n`;

    // For very large files, summarize structure rather than including full content
    if (charCount > 10000) {
      // Extract headers/structure
      const headers = lines.filter((l) => l.match(/^#+\s+/)).slice(0, 20);
      if (headers.length > 0) {
        summary += "**Document Structure:**\n";
        for (const header of headers) {
          summary += `  ${header.trim()}\n`;
        }
        summary += "\n> Full content available at .lowcal/raw/ — use read_file to access specific sections.\n";
      } else {
        // No headers — show first and last portions
        summary += "**Preview (first 50 lines):**\n```\n";
        summary += lines.slice(0, 50).join("\n");
        summary += "\n```\n\n> Content truncated. Full source archived in .lowcal/raw/.\n";
      }
    } else {
      // Small enough to include fully
      summary += "**Full Content:**\n```\n";
      summary += content;
      summary += "\n```\n";
    }

    return summary;
  }

  /**
   * Builds instructions for the LLM on what wiki pages to create/update.
   */
  private buildIngestInstructions(
    sourceSummary: string,
    sourcePath: string,
    wikiRoot: string,
  ): string {
    return `## Wiki Ingestion Instructions

Based on the source content above, perform the following wiki maintenance tasks:

### 1. Extract and Create Entity Pages
Identify key entities (people, projects, libraries, frameworks, organizations) mentioned in the source. For each entity:
- Create a page at \`.lowcal/wiki/entities/${toSlug(path.basename(sourcePath))}\` if it doesn't exist
- Include: name, description, relationships to other entities, and source citations

### 2. Extract and Create Concept Pages
Identify key concepts (patterns, techniques, methodologies) discussed in the source. For each concept:
- Create a page at \`.lowcal/wiki/concepts/${toSlug(path.basename(sourcePath))}\` if it doesn't exist
- Include: definition, context, examples, and related entities

### 3. Update Cross-References
For each new or updated page:
- Add \`[[EntityName]]\` links to related entity pages
- Check existing entity/concept pages for mentions of the new content and add backlinks

### 4. Flag Contradictions
If the source contains claims that contradict existing wiki pages, note them explicitly with:
> **CONTRADICTION:** Existing page \`entities/xxx.md\` states "[existing claim]" but this source says "[new claim]".

### 5. Update Index
After creating/updating all pages, update \`.lowcal/wiki/index.md\` to include new entries under the appropriate category headers.

### Wiki Directory Reference
- Entities: ${wikiRoot}/entities/
- Concepts: ${wikiRoot}/concepts/
- Comparisons: ${wikiRoot}/comparisons/
- Syntheses: ${wikiRoot}/syntheses/`;
  }
}

/**
 * Implementation of the WikiIngest tool logic.
 * Reads a source document, archives it to raw/, and provides structured
 * instructions for the LLM to create/update wiki pages.
 */
export class WikiIngestTool extends BaseDeclarativeTool<WikiIngestToolParams, ToolResult> {
  static readonly Name = ToolNames.WIKI_INGEST;

  constructor(private config: Config) {
    super(
      WikiIngestTool.Name,
      "WikiIngest",
      "Ingest a source document into the LowCal wiki. Archives the source to .lowcal/raw/ and provides structured instructions for creating/updating entity pages, concept pages, cross-references, and the wiki index. Use this when you want to add new knowledge sources (articles, docs, transcripts) to your project's compounding knowledge base.",
      Kind.Edit,
      {
        properties: {
          source: {
            description: "Path to the source file or URL to ingest into the wiki. For URLs, use web_fetch first to save content locally.",
            type: "string",
          },
          mode: {
            description: 'Ingestion mode: "supervised" discusses key takeaways with user before writing (default), "batch" processes directly without interaction.',
            type: "string",
            enum: ["supervised", "batch"],
          },
        },
        required: ["source"],
        type: "object",
      },
    );
  }

  /**
   * Validates the parameters for the tool.
   */
  protected override validateToolParamValues(
    params: WikiIngestToolParams,
  ): string | null {
    if (!params.source || typeof params.source !== "string" || params.source.trim() === "") {
      return "The 'source' parameter cannot be empty.";
    }

    if (
      params.mode &&
      params.mode !== "supervised" &&
      params.mode !== "batch"
    ) {
      return "The 'mode' parameter must be either 'supervised' or 'batch'.";
    }

    return null;
  }

  protected createInvocation(
    params: WikiIngestToolParams,
  ): ToolInvocation<WikiIngestToolParams, ToolResult> {
    return new WikiIngestToolInvocation(this.config, params);
  }
}
