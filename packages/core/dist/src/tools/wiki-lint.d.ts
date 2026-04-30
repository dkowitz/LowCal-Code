/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import { BaseDeclarativeTool } from "./tools.js";
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
/**
 * Severity levels for lint findings.
 */
export declare enum LintSeverity {
    ERROR = "error",
    WARNING = "warning",
    INFO = "info"
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
    summary: {
        errors: number;
        warnings: number;
        info: number;
    };
}
/**
 * Scans all wiki pages and returns their paths grouped by subdirectory.
 */
export declare function getAllWikiPages(wikiRoot: string): Promise<Record<string, string[]>>;
/**
 * Checks for orphan pages — pages that have no inbound [[wikilinks]] from other wiki pages.
 */
export declare function checkOrphanPages(wikiRoot: string): Promise<LintFinding[]>;
/**
 * Checks for missing cross-references — entities mentioned in text but not linked with [[wikilink]].
 */
export declare function checkMissingCrossReferences(wikiRoot: string): Promise<LintFinding[]>;
/**
 * Checks that all wiki pages are listed in index.md.
 */
export declare function checkIndexCompleteness(wikiRoot: string): Promise<LintFinding[]>;
/**
 * Checks for potential contradictions between pages on similar topics.
 * This is a basic check — it looks for conflicting statements about shared keywords.
 */
export declare function checkContradictions(wikiRoot: string): Promise<LintFinding[]>;
/**
 * Runs all lint checks and returns aggregated results.
 */
export declare function runWikiLint(wikiRoot: string): Promise<WikiLintResult>;
/**
 * Implementation of the WikiLint tool logic.
 * Scans the wiki for contradictions, orphan pages, missing cross-references,
 * and index completeness issues. Reports findings with severity levels.
 */
export declare class WikiLintTool extends BaseDeclarativeTool<WikiLintToolParams, ToolResult> {
    private config;
    static readonly Name: "wiki_lint";
    constructor(config: Config);
    protected validateToolParamValues(params: WikiLintToolParams): string | null;
    protected createInvocation(params: WikiLintToolParams): ToolInvocation<WikiLintToolParams, ToolResult>;
}
