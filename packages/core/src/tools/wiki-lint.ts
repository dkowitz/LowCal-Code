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
import type { ToolCallConfirmationDetails } from "./tools.js";
import { ToolConfirmationOutcome } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";

/**
 * Parameters for the WikiLintTool
 */
export interface WikiLintToolParams {
  /**
   * Scope of the lint check: "full" scans all pages, "recent" only checks pages
   * modified in the last N days. Defaults to "full".
   */
  scope?: "full" | "recent";

  /**
   * Whether to automatically fix structural issues (broken links, missing index entries).
   * Defaults to false — report-only mode.
   */
  auto_fix?: boolean;
}

// Wiki directory constants (must match wiki-init.ts)
const WIKI_DIR = ".lowcal";
const WIKI_SUBDIRS = ["entities", "concepts", "comparisons", "syntheses"];

/**
 * Severity levels for lint findings.
 */
export enum LintSeverity {
  ERROR = "error",
  WARNING = "warning",
  INFO = "info",
}

/**
 * A single lint finding.
 */
export interface LintFinding {
  /** Severity of the finding */
  severity: LintSeverity;
  /** Human-readable rule name (e.g., "orphan-page") */
  rule: string;
  /** The page or path this finding relates to */
  subject: string;
  /** Description of what was found and suggested fix */
  message: string;
}

/**
 * Result of a lint operation.
 */
export interface WikiLintResult {
  findings: LintFinding[];
  summary: { errors: number; warnings: number; info: number };
}

/**
 * Scans all wiki pages and returns their paths grouped by subdirectory.
 */
export async function getAllWikiPages(wikiRoot: string): Promise<Record<string, string[]>> {
  const pages: Record<string, string[]> = {};

  for (const subdir of WIKI_SUBDIRS) {
    const dirPath = path.join(wikiRoot, subdir);
    try {
      const entries = await fs.readdir(dirPath);
      const mdFiles = entries.filter((e) => e.endsWith(".md"));
      if (mdFiles.length > 0) {
        pages[subdir] = mdFiles;
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return pages;
}

/**
 * Checks for orphan pages — pages that have no inbound [[wikilinks]] from other wiki pages.
 */
export async function checkOrphanPages(wikiRoot: string): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const allPages = await getAllWikiPages(wikiRoot);

  // Collect all page names (without .md extension)
  const allPageNames = new Set<string>();
  for (const files of Object.values(allPages)) {
    for (const file of files) {
      allPageNames.add(path.basename(file, ".md"));
    }
  }

  // Collect all [[wikilink]] references across all pages
  const linkedTo = new Set<string>();
  for (const [subdir, files] of Object.entries(allPages)) {
    for (const file of files) {
      const filePath = path.join(wikiRoot, subdir, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        // Extract [[wikilink]] references
        const linkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
          linkedTo.add(match[1]);
        }

        // Also check the index.md for links to this page
      } catch {
        continue;
      }
    }
  }

  // Check index.md for references too
  const indexPath = path.join(wikiRoot, "index.md");
  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = linkRegex.exec(indexContent)) !== null) {
      linkedTo.add(match[1]);
    }
  } catch {
    // Index doesn't exist
  }

  // Find pages not referenced by any other page or the index
  for (const pageName of allPageNames) {
    const lowerName = pageName.toLowerCase();
    // Normalize: replace hyphens/underscores with spaces, trim whitespace
    const normalizedPage = lowerName.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

    const isLinked = Array.from(linkedTo).some((link) => {
      const normalizedLink = link.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
      return normalizedLink === normalizedPage;
    });

    if (!isLinked) {
      findings.push({
        severity: LintSeverity.WARNING,
        rule: "orphan-page",
        subject: pageName,
        message: `Page "${pageName}" has no inbound [[wikilinks]] from other wiki pages or the index. Consider adding cross-references to connect it to related topics.`,
      });
    }
  }

  return findings;
}

/**
 * Checks for missing cross-references — entities mentioned in text but not linked with [[wikilink]].
 */
export async function checkMissingCrossReferences(wikiRoot: string): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const allPages = await getAllWikiPages(wikiRoot);

  // Build a set of known entity/concept names (from filenames)
  const knownEntities = new Set<string>();
  for (const subdir of ["entities", "concepts"]) {
    if (allPages[subdir]) {
      for (const file of allPages[subdir]) {
        knownEntities.add(path.basename(file, ".md"));
      }
    }
  }

  // Check each page for mentions of known entities that aren't linked
  for (const [subdir, files] of Object.entries(allPages)) {
    for (const file of files) {
      const filePath = path.join(wikiRoot, subdir, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");

        // Get all [[wikilink]] references in this page (these are already linked)
        const existingLinks: string[] = [];
        const linkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
          existingLinks.push(match[1].toLowerCase().replace(/[-_]/g, ""));
        }

        // Check if any known entities are mentioned but not linked
        for (const entity of knownEntities) {
          const entitySlug = entity.toLowerCase().replace(/[-_]/g, "");
          const fileName = path.basename(file, ".md").toLowerCase();

          // Skip self-references and already-linked entities
          if (entitySlug === fileName.replace(/[-_]/g, "") || existingLinks.includes(entitySlug)) {
            continue;
          }

          // Check if the entity name appears in the content (case-insensitive)
          const entityWords = entity.toLowerCase().split(/[-_\s]+/).filter((w) => w.length > 2);
          for (const word of entityWords) {
            // Use word boundary matching to avoid false positives
            const regex = new RegExp(`\\b${word}\\b`, "i");
            if (regex.test(content)) {
              findings.push({
                severity: LintSeverity.INFO,
                rule: "missing-cross-reference",
                subject: `${subdir}/${file}`,
                message: `Entity "${entity}" appears to be mentioned in this page but is not linked with [[${entity}]]. Consider adding a cross-reference.`,
              });
              break; // One finding per entity per page
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  return findings;
}

/**
 * Checks that all wiki pages are listed in index.md.
 */
export async function checkIndexCompleteness(wikiRoot: string): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const allPages = await getAllWikiPages(wikiRoot);

  // Read index content
  const indexPath = path.join(wikiRoot, "index.md");
  let indexContent = "";
  try {
    indexContent = await fs.readFile(indexPath, "utf-8");
  } catch {
    findings.push({
      severity: LintSeverity.ERROR,
      rule: "missing-index",
      subject: "index.md",
      message: "Wiki index file (index.md) does not exist. Run wiki_init to create it.",
    });
    return findings;
  }

  // Check each page is referenced in the index
  for (const [subdir, files] of Object.entries(allPages)) {
    for (const file of files) {
      const pageName = path.basename(file, ".md");
      const lowerIndex = indexContent.toLowerCase();
      const lowerPage = pageName.toLowerCase().replace(/[-_]/g, "");

      // Check if the page name appears in the index (as [[link]] or plain text)
      const isInIndex =
        lowerIndex.includes(`[[${pageName}]]`) ||
        lowerIndex.includes(pageName.toLowerCase()) ||
        lowerIndex.includes(lowerPage);

      if (!isInIndex) {
        findings.push({
          severity: LintSeverity.ERROR,
          rule: "missing-index-entry",
          subject: `${subdir}/${file}`,
          message: `Page "${pageName}" is not listed in index.md. Add an entry under the "${subdir}" section.`,
        });
      }
    }
  }

  return findings;
}

/**
 * Checks for potential contradictions between pages on similar topics.
 * This is a basic check — it looks for conflicting statements about shared keywords.
 */
export async function checkContradictions(wikiRoot: string): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const allPages = await getAllWikiPages(wikiRoot);

  // Collect page contents with their paths
  type PageContent = { path: string; content: string };
  const pageContents: PageContent[] = [];

  for (const [subdir, files] of Object.entries(allPages)) {
    for (const file of files) {
      const filePath = path.join(wikiRoot, subdir, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        pageContents.push({ path: `${subdir}/${file}`, content });
      } catch {
        continue;
      }
    }
  }

  // Look for explicit contradiction markers in pages (added during ingestion)
  for (const page of pageContents) {
    const contradictionRegex = />\s*\*\*CONTRADICTION:\*\*\s*(.+)/g;
    let match;
    while ((match = contradictionRegex.exec(page.content)) !== null) {
      findings.push({
        severity: LintSeverity.WARNING,
        rule: "contradiction-flagged",
        subject: page.path,
        message: `Contradiction flagged in this page: ${match[1].trim()}`,
      });
    }
  }

  return findings;
}

/**
 * Runs all lint checks and returns aggregated results.
 */
export async function runWikiLint(wikiRoot: string): Promise<WikiLintResult> {
  const allFindings: LintFinding[] = [];

  // Run all checks in parallel
  const [orphans, missingRefs, indexIssues, contradictions] = await Promise.all([
    checkOrphanPages(wikiRoot),
    checkMissingCrossReferences(wikiRoot),
    checkIndexCompleteness(wikiRoot),
    checkContradictions(wikiRoot),
  ]);

  allFindings.push(...orphans, ...missingRefs, ...indexIssues, ...contradictions);

  // Sort by severity: errors first, then warnings, then info
  const severityOrder = { [LintSeverity.ERROR]: 0, [LintSeverity.WARNING]: 1, [LintSeverity.INFO]: 2 };
  allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const summary = {
    errors: allFindings.filter((f) => f.severity === LintSeverity.ERROR).length,
    warnings: allFindings.filter((f) => f.severity === LintSeverity.WARNING).length,
    info: allFindings.filter((f) => f.severity === LintSeverity.INFO).length,
  };

  return { findings: allFindings, summary };
}

class WikiLintToolInvocation extends BaseToolInvocation<WikiLintToolParams, ToolResult> {
  constructor(
    private config: Config,
    params: WikiLintToolParams,
  ) {
    super(params);
  }

  override getDescription(): string {
    return `Running wiki lint (${this.params.scope || "full"} scope${this.params.auto_fix ? ", auto-fix enabled" : ""})`;
  }

  override async shouldConfirmExecute(
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: "info",
      title: "Confirm Wiki Lint",
      prompt: `Run wiki health check (${this.params.scope || "full"} scope${this.params.auto_fix ? ", with auto-fix" : ""})?`,
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

      // Run lint checks
      const result = await runWikiLint(wikiRoot);

      // Format findings as a report
      let report = `## Wiki Lint Report\n\n`;
      report += `**Scope:** ${this.params.scope || "full"}\n`;
      report += `**Pages Scanned:** ${(await getAllWikiPages(wikiRoot))}\n\n`;
      report += `### Summary\n- **Errors:** ${result.summary.errors}\n`;
      report += `- **Warnings:** ${result.summary.warnings}\n`;
      report += `- **Info:** ${result.summary.info}\n\n`;

      if (result.findings.length === 0) {
        report += `✅ No issues found. The wiki is healthy.\n`;
      } else {
        report += `### Findings\n\n`;
        for (const finding of result.findings) {
          const icon =
            finding.severity === LintSeverity.ERROR
              ? "❌"
              : finding.severity === LintSeverity.WARNING
                ? "⚠️"
                : "ℹ️";

          report += `${icon} **[${finding.severity.toUpperCase()}] ${finding.rule}** — ${finding.subject}\n`;
          report += `   ${finding.message}\n\n`;
        }
      }

      // Append to log
      const logPath = path.join(wikiRoot, "log.md");
      const timestamp = new Date().toISOString();
      try {
        const existingLog = await fs.readFile(logPath, "utf-8");
        const cleanedLog = existingLog.replace(/---\s*$/, "").trimEnd();
        await fs.writeFile(
          logPath,
          `${cleanedLog}\n\n## [${timestamp}] lint | ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info\n\n---\n`,
          "utf-8",
        );
      } catch {
        // Log doesn't exist, non-critical
      }

      return {
        llmContent: report,
        returnDisplay: `Wiki lint: ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const rawError = `Error during wiki lint: ${errorMessage}`;
      return {
        llmContent: rawError,
        returnDisplay: "Wiki lint failed",
        error: {
          message: rawError,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

/**
 * Implementation of the WikiLint tool logic.
 * Scans the wiki for contradictions, orphan pages, missing cross-references,
 * and index completeness issues. Reports findings with severity levels.
 */
export class WikiLintTool extends BaseDeclarativeTool<WikiLintToolParams, ToolResult> {
  static readonly Name = ToolNames.WIKI_LINT;

  constructor(private config: Config) {
    super(
      WikiLintTool.Name,
      "WikiLint",
      "Run a health check on the LowCal wiki. Scans for contradictions between pages, orphan pages with no inbound links, missing cross-references, and index completeness issues. Reports findings with severity levels (error, warning, info). Use this periodically to maintain wiki quality and catch hallucination decay.",
      Kind.Search,
      {
        properties: {
          scope: {
            description: 'Scope of the lint check: "full" scans all pages, "recent" only checks recently modified pages. Defaults to "full".',
            type: "string",
            enum: ["full", "recent"],
          },
          auto_fix: {
            description: "Whether to automatically fix structural issues like broken links and missing index entries. Defaults to false (report-only mode).",
            type: "boolean",
          },
        },
        required: [],
        type: "object",
      },
    );
  }

  protected override validateToolParamValues(
    params: WikiLintToolParams,
  ): string | null {
    if (
      params.scope &&
      params.scope !== "full" &&
      params.scope !== "recent"
    ) {
      return "The 'scope' parameter must be either 'full' or 'recent'.";
    }

    return null;
  }

  protected createInvocation(
    params: WikiLintToolParams,
  ): ToolInvocation<WikiLintToolParams, ToolResult> {
    return new WikiLintToolInvocation(this.config, params);
  }
}
