/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from "./tools.js";
import { ToolNames } from "./tool-names.js";
import { makeRelative, shortenPath } from "../utils/paths.js";
import { ApprovalMode } from "../config/config.js";
import { ToolConfirmationOutcome } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
// Directory structure for the wiki
const WIKI_DIR = ".lowcal";
const WIKI_SUBDIRS = ["wiki", "wiki/entities", "wiki/concepts", "wiki/comparisons", "wiki/syntheses", "raw"];
// Default index.md content
const DEFAULT_INDEX_MD = `# Wiki Index

This file catalogs all pages in the knowledge wiki. It is automatically maintained by the LLM agent.

## Entities

_No entities yet._

## Concepts

_No concepts yet._

## Comparisons

_No comparisons yet._

## Syntheses

_No syntheses yet._
`;
// Default log.md content
const DEFAULT_LOG_MD = `# Wiki Log

Append-only record of all wiki operations.

---
`;
// Wiki schema section to inject into LOWCAL.md
const WIKI_SCHEMA_SECTION = `
## Wiki Configuration

The following rules govern how the LLM maintains this project's knowledge wiki.

### Directory Structure
- \`.lowcal/wiki/\` — Compiled knowledge base (LLM-owned, human-readable)
  - \`index.md\` — Content catalog of all wiki pages
  - \`log.md\` — Append-only operation log
  - \`entities/\` — Entity/concept pages (e.g., React, Node.js)
  - \`concepts/\` — Concept explanation pages (e.g., Dependency Injection)
  - \`comparisons/\` — Comparison and trade-off pages (e.g., React vs Vue)
  - \`syntheses/\` — Cross-topic synthesis pages

### Wiki Maintenance Rules
1. **Never modify raw sources** in \`.lowcal/raw/\`. They are immutable ground truth.
2. **Always update \`index.md\`** after creating or modifying wiki pages.
3. **Cross-reference aggressively.** When creating a new page, link to existing entities/concepts using \`[[PageName]]\` syntax.
4. **Flag contradictions explicitly.** If new data conflicts with old wiki claims, note the discrepancy rather than silently overwriting.
5. **File valuable outputs.** Complex answers and discoveries should be saved as new wiki pages, not just returned in chat.
6. **Use consistent naming.** Page filenames are lowercase-hyphenated (\`react-hooks.md\`, \`dependency-injection.md\`).

### Ingest Workflow
When ingesting a source:
1. Read the source document fully
2. Extract key entities (people, projects, libraries) and concepts (patterns, techniques)
3. Create or update relevant wiki pages in appropriate subdirectories
4. Update cross-references in existing pages that relate to new content
5. Note any contradictions with existing knowledge
6. Append operation to \`log.md\`

### Query Workflow
When answering from the wiki:
1. Scan \`index.md\` for relevant topics
2. Read matching wiki pages (not raw sources)
3. Synthesize answer with inline citations like \[see: entities/PageName]
4. If the answer is complex and reusable, offer to file it as a new synthesis page

### Lint Workflow
When performing health checks:
1. Scan for contradictions between pages on the same topic
2. Identify orphan pages (no inbound links)
3. Check for missing cross-references (entities mentioned but not linked)
4. Verify \`index.md\` completeness
5. Report findings with severity levels
`;
class WikiInitToolInvocation extends BaseToolInvocation {
    config;
    constructor(config, params) {
        super(params);
        this.config = config;
    }
    toolLocations() {
        const targetDir = this.config.getTargetDir();
        return [
            { path: path.join(targetDir, WIKI_DIR) },
            { path: path.join(targetDir, "LOWCAL.md") },
        ];
    }
    getDescription() {
        return `Initialize LowCal wiki in ${shortenPath(this.config.getTargetDir())}`;
    }
    async shouldConfirmExecute(_abortSignal) {
        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }
        const confirmationDetails = {
            type: "info",
            title: "Confirm Wiki Initialization",
            prompt: `This will create a .lowcal/ directory with wiki structure and update LOWCAL.md with wiki configuration rules. Continue?`,
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
            const wikiRoot = path.join(targetDir, WIKI_DIR);
            // Check if wiki already exists
            const wikiPath = path.join(wikiRoot, "wiki");
            let alreadyExists = false;
            try {
                await fs.access(wikiPath);
                alreadyExists = true;
            }
            catch {
                // Directory doesn't exist, proceed with initialization
            }
            if (alreadyExists) {
                return {
                    llmContent: `Wiki is already initialized at ${wikiRoot}. No action needed.`,
                    returnDisplay: "Wiki already exists",
                };
            }
            // Create directory structure
            for (const subdir of WIKI_SUBDIRS) {
                const fullPath = path.join(wikiRoot, subdir);
                await fs.mkdir(fullPath, { recursive: true });
            }
            // Create index.md
            const indexPath = path.join(wikiRoot, "wiki", "index.md");
            await fs.writeFile(indexPath, DEFAULT_INDEX_MD, "utf-8");
            // Create log.md
            const logPath = path.join(wikiRoot, "wiki", "log.md");
            const timestamp = new Date().toISOString();
            await fs.writeFile(logPath, `${DEFAULT_LOG_MD}## [${timestamp}] wiki_init | Wiki initialized\n`, "utf-8");
            // Update LOWCAL.md with wiki schema section
            const lowcalPath = path.join(targetDir, "LOWCAL.md");
            let lowcalContent = "";
            try {
                lowcalContent = await fs.readFile(lowcalPath, "utf-8");
            }
            catch {
                // LOWCAL.md doesn't exist yet, create it with just the wiki section
                lowcalContent = "# Project Context\n";
            }
            // Check if wiki schema is already present
            if (!lowcalContent.includes("## Wiki Configuration")) {
                const updatedContent = lowcalContent + WIKI_SCHEMA_SECTION;
                await fs.writeFile(lowcalPath, updatedContent, "utf-8");
            }
            // Optionally add .lowcal/ to .gitignore
            if (this.params.gitignore !== false) {
                const gitignorePath = path.join(targetDir, ".gitignore");
                try {
                    let gitignoreContent = "";
                    let gitignoreExists = false;
                    try {
                        gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
                        gitignoreExists = true;
                    }
                    catch {
                        // .gitignore doesn't exist
                    }
                    if (!gitignoreContent.includes(".lowcal/")) {
                        const updatedGitignore = gitignoreContent + (gitignoreExists && !gitignoreContent.endsWith("\n") ? "\n" : "") + ".lowcal/\n";
                        await fs.writeFile(gitignorePath, updatedGitignore, "utf-8");
                    }
                }
                catch {
                    // Failed to update .gitignore, non-fatal
                }
            }
            const relativeWikiRoot = makeRelative(wikiRoot, targetDir);
            const resultMessage = `Wiki initialized successfully at ${shortenPath(relativeWikiRoot)}.

Created:
- ${relativeWikiRoot}/wiki/ (knowledge base)
  - index.md (content catalog)
  - log.md (operation log)
  - entities/ (entity pages)
  - concepts/ (concept pages)
  - comparisons/ (comparison pages)
  - syntheses/ (synthesis pages)
- ${relativeWikiRoot}/raw/ (source documents)

LOWCAL.md updated with wiki configuration rules.`;
            return {
                llmContent: resultMessage,
                returnDisplay: `Wiki initialized at .lowcal/wiki/`,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const rawError = `Error during wiki initialization: ${errorMessage}`;
            return {
                llmContent: rawError,
                returnDisplay: `Wiki initialization failed`,
                error: {
                    message: rawError,
                    type: ToolErrorType.EXECUTION_FAILED,
                },
            };
        }
    }
}
/**
 * Implementation of the WikiInit tool logic
 */
export class WikiInitTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.WIKI_INIT;
    constructor(config) {
        super(WikiInitTool.Name, "WikiInit", "Initialize the LowCal wiki for this project. Creates a .lowcal/ directory with wiki structure (entities/, concepts/, comparisons/, syntheses/) and updates LOWCAL.md with wiki configuration rules. Use this to set up persistent knowledge compounding for your project.", Kind.Other, {
            properties: {
                gitignore: {
                    description: "Whether to add .lowcal/ to .gitignore (optional, defaults to true)",
                    type: "boolean",
                },
            },
            required: [],
            type: "object",
        });
        this.config = config;
    }
    /**
     * Validates the parameters for the tool.
     */
    validateToolParamValues(_params) {
        return null;
    }
    createInvocation(params) {
        return new WikiInitToolInvocation(this.config, params);
    }
}
//# sourceMappingURL=wiki-init.js.map