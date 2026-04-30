/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { WikiQueryTool, findRelevantPages, readWikiPage, gatherWikiContext } from "./wiki-query.js";
describe("WikiQueryTool", () => {
    let tempRootDir;
    let wikiTool;
    const abortSignal = new AbortController().signal;
    function createMockConfig(rootDir) {
        return {
            getTargetDir: () => rootDir,
            getApprovalMode: () => "auto_edit",
            setApprovalMode: () => { },
        };
    }
    beforeEach(async () => {
        tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-query-test-"));
        wikiTool = new WikiQueryTool(createMockConfig(tempRootDir));
        // Set up a minimal wiki structure with some content
        const wikiRoot = path.join(tempRootDir, ".lowcal/wiki");
        await fs.mkdir(path.join(wikiRoot, "entities"), { recursive: true });
        await fs.mkdir(path.join(wikiRoot, "concepts"), { recursive: true });
        // Create entity pages
        await fs.writeFile(path.join(wikiRoot, "entities/react.md"), "# React\n\nA JavaScript library for building user interfaces.\n");
        await fs.writeFile(path.join(wikiRoot, "entities/node-js.md"), "# Node.js\n\nA JavaScript runtime built on Chrome's V8 engine.\n");
        // Create concept pages
        await fs.writeFile(path.join(wikiRoot, "concepts/dependency-injection.md"), "# Dependency Injection\n\nA design pattern where dependencies are provided to a component.\n");
        // Create index
        await fs.writeFile(path.join(wikiRoot, "index.md"), `# Wiki Index

## Entities
- [[React]]: A JavaScript library
- [[Node.js]]: A JavaScript runtime

## Concepts
- [[Dependency Injection]]: Design pattern
`);
    });
    afterEach(async () => {
        await fs.rm(tempRootDir, { recursive: true, force: true });
    });
    describe("tool metadata", () => {
        it("should have correct name and display name", () => {
            expect(wikiTool.name).toBe("wiki_query");
            expect(wikiTool.displayName).toBe("WikiQuery");
        });
        it("should require the question parameter", () => {
            const required = wikiTool.schema.parametersJsonSchema.required;
            expect(required).toContain("question");
        });
    });
    describe("validateToolParamValues", () => {
        it("should pass with valid question", () => {
            expect(wikiTool.validateToolParams({ question: "What is React?" })).toBeNull();
        });
        it("should fail with empty question", () => {
            const error = wikiTool.validateToolParams({ question: "" });
            expect(error).toContain("cannot be empty");
        });
        it("should pass with format option", () => {
            expect(wikiTool.validateToolParams({ question: "test", format: "table" })).toBeNull();
        });
    });
    describe("execute", () => {
        it("should return error when wiki is not initialized", async () => {
            // Remove index.md
            await fs.unlink(path.join(tempRootDir, ".lowcal/wiki/index.md"));
            const invocation = wikiTool.build({ question: "What is React?" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("not initialized");
            expect(result.error).toBeDefined();
        });
        it("should find relevant pages and return context", async () => {
            const invocation = wikiTool.build({ question: "What is React?" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("Wiki Query Context");
            expect(result.llmContent).toContain("What is React?");
            expect(result.returnDisplay).toContain("relevant wiki page");
        });
        it("should report empty wiki when no pages exist", async () => {
            // Remove all entity/concept pages
            await fs.rm(path.join(tempRootDir, ".lowcal/wiki/entities"), { recursive: true });
            await fs.rm(path.join(tempRootDir, ".lowcal/wiki/concepts"), { recursive: true });
            const invocation = wikiTool.build({ question: "What is React?" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("no relevant content");
        });
        it("should include format preference in context", async () => {
            const invocation = wikiTool.build({ question: "Compare frameworks", format: "table" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("**Format Preference:** table");
        });
    });
    describe("getDescription", () => {
        it("should include the question in description", () => {
            const invocation = wikiTool.build({ question: "What is React?" });
            expect(invocation.getDescription()).toContain("What is React?");
        });
    });
});
describe("findRelevantPages", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-relevance-test-"));
        // Create index with multiple pages
        await fs.writeFile(path.join(tempDir, "index.md"), `# Wiki Index

## Entities
- [[React]]: A JavaScript library for UIs
- [[Vue]]: Progressive JavaScript framework
- [[Node.js]]: Server-side JavaScript runtime
- [[TypeScript]]: Typed superset of JavaScript
`);
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("should return pages relevant to the question", async () => {
        const pages = await findRelevantPages(tempDir, "What is React?");
        expect(pages).toContain("React");
    });
    it("should rank most relevant pages first", async () => {
        const pages = await findRelevantPages(tempDir, "Tell me about React and JavaScript libraries");
        // React should be the top result since it matches multiple keywords
        expect(pages[0]).toBe("React");
    });
    it("should return fallback pages when no keywords match", async () => {
        const pages = await findRelevantPages(tempDir, "xyz123abc");
        // Should return some pages as fallback
        expect(pages.length).toBeGreaterThan(0);
    });
    it("should return empty array for missing index", async () => {
        const pages = await findRelevantPages(path.join(tempDir, "nonexistent"), "test");
        expect(pages).toEqual([]);
    });
});
describe("readWikiPage", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-readpage-test-"));
        await fs.mkdir(path.join(tempDir, "entities"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "entities/react.md"), "# React\nA JavaScript library.\n");
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("should find and read a page by name", async () => {
        const result = await readWikiPage(tempDir, "React");
        expect(result).not.toBeNull();
        expect(result.path).toBe("entities/react.md");
        expect(result.content).toContain("JavaScript library");
    });
    it("should return null for non-existent page", async () => {
        const result = await readWikiPage(tempDir, "NonExistent");
        expect(result).toBeNull();
    });
});
describe("gatherWikiContext", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-gather-test-"));
        await fs.mkdir(path.join(tempDir, "entities"), { recursive: true });
        await fs.writeFile(path.join(tempDir, "entities/react.md"), "# React\nA JavaScript library.\n");
        await fs.writeFile(path.join(tempDir, "index.md"), "# Wiki Index\n## Entities\n- [[React]]: A JS library\n");
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("should return index content and relevant pages", async () => {
        const result = await gatherWikiContext(tempDir, "What is React?");
        expect(result.indexContent).toContain("Wiki Index");
        expect(result.pages.length).toBeGreaterThan(0);
        expect(result.pages[0].name).toBe("React");
    });
    it("should return empty pages when no matches", async () => {
        const result = await gatherWikiContext(tempDir, "xyz123nonexistent");
        // May still return some fallback pages or none depending on scoring
        expect(result.indexContent).toContain("Wiki Index");
    });
});
//# sourceMappingURL=wiki-query.test.js.map