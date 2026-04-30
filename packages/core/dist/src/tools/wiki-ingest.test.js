/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { WikiIngestTool, toSlug, extractWikilinks, readWikiIndex, updateWikiIndex, appendWikiLog } from "./wiki-ingest.js";
describe("WikiIngestTool", () => {
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
        tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-ingest-test-"));
        wikiTool = new WikiIngestTool(createMockConfig(tempRootDir));
        // Set up a minimal wiki structure (as if wiki_init was run)
        const wikiRoot = path.join(tempRootDir, ".lowcal/wiki");
        await fs.mkdir(path.join(wikiRoot, "entities"), { recursive: true });
        await fs.mkdir(path.join(wikiRoot, "concepts"), { recursive: true });
        await fs.mkdir(path.join(wikiRoot, "comparisons"), { recursive: true });
        await fs.mkdir(path.join(wikiRoot, "syntheses"), { recursive: true });
        await fs.writeFile(path.join(wikiRoot, "index.md"), "# Wiki Index\n\n## Entities\n_No entities yet._\n\n## Concepts\n_No concepts yet._\n");
        await fs.writeFile(path.join(wikiRoot, "log.md"), "# Wiki Log\n");
    });
    afterEach(async () => {
        await fs.rm(tempRootDir, { recursive: true, force: true });
    });
    describe("tool metadata", () => {
        it("should have correct name and display name", () => {
            expect(wikiTool.name).toBe("wiki_ingest");
            expect(wikiTool.displayName).toBe("WikiIngest");
        });
        it("should require the source parameter", () => {
            const required = wikiTool.schema.parametersJsonSchema.required;
            expect(required).toContain("source");
        });
    });
    describe("validateToolParamValues", () => {
        it("should pass with valid source", () => {
            expect(wikiTool.validateToolParams({ source: "myfile.txt" })).toBeNull();
        });
        it("should fail with empty source", () => {
            const error = wikiTool.validateToolParams({ source: "" });
            expect(error).toContain("cannot be empty");
        });
        it("should fail with whitespace-only source", () => {
            const error = wikiTool.validateToolParams({ source: "   " });
            expect(error).toContain("cannot be empty");
        });
        it("should pass with supervised mode", () => {
            expect(wikiTool.validateToolParams({ source: "file.txt", mode: "supervised" })).toBeNull();
        });
        it("should pass with batch mode", () => {
            expect(wikiTool.validateToolParams({ source: "file.txt", mode: "batch" })).toBeNull();
        });
        it("should fail with invalid mode", () => {
            const error = wikiTool.validateToolParams({ source: "file.txt", mode: "invalid" });
            expect(error).toBeTruthy();
            expect(typeof error).toBe("string");
        });
    });
    describe("execute", () => {
        it("should return error when wiki is not initialized", async () => {
            // Remove the index.md to simulate uninitialized wiki
            await fs.unlink(path.join(tempRootDir, ".lowcal/wiki/index.md"));
            const invocation = wikiTool.build({ source: "test.txt" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("not initialized");
            expect(result.error).toBeDefined();
        });
        it("should return error when source file not found", async () => {
            const invocation = wikiTool.build({ source: "nonexistent.txt" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("not found");
            expect(result.error).toBeDefined();
        });
        it("should return instructive error for URL sources", async () => {
            const invocation = wikiTool.build({ source: "https://example.com/article" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("web_fetch");
            expect(result.error).toBeDefined();
        });
        it("should ingest a local file and archive to raw/", async () => {
            // Create a source file
            const sourcePath = path.join(tempRootDir, "source.txt");
            await fs.writeFile(sourcePath, "# Hello World\nThis is test content.\n");
            const invocation = wikiTool.build({ source: "source.txt" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("ingested and archived");
            expect(result.returnDisplay).toContain("Ingested source");
            // Verify raw archive was created
            const rawDir = path.join(tempRootDir, ".lowcal/raw");
            const rawFiles = await fs.readdir(rawDir);
            expect(rawFiles.length).toBeGreaterThan(0);
            expect(rawFiles[0]).toMatch(/.*_source\.txt$/);
            // Verify archived content matches source
            const archivedContent = await fs.readFile(path.join(rawDir, rawFiles[0]), "utf-8");
            expect(archivedContent).toContain("Hello World");
        });
        it("should append to wiki log after ingestion", async () => {
            const sourcePath = path.join(tempRootDir, "source.txt");
            await fs.writeFile(sourcePath, "Test content\n");
            const invocation = wikiTool.build({ source: "source.txt" });
            await invocation.execute(abortSignal);
            const logContent = await fs.readFile(path.join(tempRootDir, ".lowcal/wiki/log.md"), "utf-8");
            expect(logContent).toContain("ingest");
            expect(logContent).toContain("source.txt");
        });
        it("should include source summary in result", async () => {
            const sourcePath = path.join(tempRootDir, "source.txt");
            await fs.writeFile(sourcePath, "# My Document\nSome content here.\n");
            const invocation = wikiTool.build({ source: "source.txt" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("Source:");
            expect(result.llmContent).toContain("Size:");
        });
        it("should include ingest instructions in result", async () => {
            const sourcePath = path.join(tempRootDir, "source.txt");
            await fs.writeFile(sourcePath, "Test content\n");
            const invocation = wikiTool.build({ source: "source.txt" });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("Wiki Ingestion Instructions");
            expect(result.llmContent).toContain("Extract and Create Entity Pages");
        });
        it("should handle absolute file paths", async () => {
            const sourcePath = path.join(tempRootDir, "source.txt");
            await fs.writeFile(sourcePath, "Absolute path test\n");
            const invocation = wikiTool.build({ source: sourcePath });
            const result = await invocation.execute(abortSignal);
            expect(result.llmContent).toContain("ingested and archived");
        });
    });
    describe("getDescription", () => {
        it("should include source path in description", () => {
            const invocation = wikiTool.build({ source: "myfile.txt" });
            expect(invocation.getDescription()).toContain("myfile.txt");
        });
        it("should include mode in description when specified", () => {
            const invocation = wikiTool.build({ source: "file.txt", mode: "batch" });
            expect(invocation.getDescription()).toContain("batch");
        });
    });
    describe("toolLocations", () => {
        it("should return wiki and source paths", () => {
            const invocation = wikiTool.build({ source: "myfile.txt" });
            const locations = invocation.toolLocations();
            expect(locations.length).toBeGreaterThanOrEqual(1);
        });
    });
});
describe("toSlug", () => {
    it("should convert simple title to slug", () => {
        expect(toSlug("React Hooks")).toBe("react-hooks.md");
    });
    it("should handle special characters", () => {
        expect(toSlug("TypeScript: A Guide!")).toBe("typescript-a-guide.md");
    });
    it("should collapse multiple spaces into single hyphen", () => {
        expect(toSlug("Multiple   Spaces")).toBe("multiple-spaces.md");
    });
    it("should remove leading/trailing hyphens", () => {
        expect(toSlug("--Edge Case--")).toBe("edge-case.md");
    });
    it("should handle already-lowercase input", () => {
        // Dots get converted to hyphens by the slug function
        expect(toSlug("already-slug.md")).toBe("already-slug-md.md");
    });
});
describe("extractWikilinks", () => {
    it("should extract wikilinks from content", () => {
        const content = "See [[React]] and [[Node.js]] for more.";
        expect(extractWikilinks(content)).toEqual(["React", "Node.js"]);
    });
    it("should return empty array when no links present", () => {
        expect(extractWikilinks("No links here")).toEqual([]);
    });
    it("should handle multiple occurrences of same link", () => {
        const content = "[[React]] is great. Also [[React]].";
        expect(extractWikilinks(content)).toEqual(["React", "React"]);
    });
});
describe("readWikiIndex", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-index-test-"));
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("should parse categories and entries from index", async () => {
        await fs.writeFile(path.join(tempDir, "index.md"), `# Wiki Index

## Entities
- [[React]]: A JavaScript library
- [[Vue]]: Progressive framework

## Concepts
- [[Dependency Injection]]: Design pattern
`);
        const index = await readWikiIndex(tempDir);
        expect(index["Entities"]).toContain("React");
        expect(index["Entities"]).toContain("Vue");
        expect(index["Concepts"]).toContain("Dependency Injection");
    });
    it("should return empty object for missing index", async () => {
        const index = await readWikiIndex(path.join(tempDir, "nonexistent"));
        expect(index).toEqual({});
    });
});
describe("updateWikiIndex", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-index-update-"));
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("should add new entries to existing index", async () => {
        await fs.writeFile(path.join(tempDir, "index.md"), "# Wiki Index\n\n## Entities\n_No entities yet._\n");
        const changes = [
            { relativePath: "entities/react.md", action: "created", summary: "A JavaScript library" },
        ];
        await updateWikiIndex(tempDir, changes);
        const content = await fs.readFile(path.join(tempDir, "index.md"), "utf-8");
        expect(content).toContain("[[react]]");
        expect(content).toContain("A JavaScript library");
    });
    it("should create index if it does not exist", async () => {
        const changes = [
            { relativePath: "concepts/dependency-injection.md", action: "created", summary: "Design pattern" },
        ];
        await updateWikiIndex(tempDir, changes);
        const content = await fs.readFile(path.join(tempDir, "index.md"), "utf-8");
        expect(content).toContain("# Wiki Index");
        expect(content).toContain("dependency-injection");
    });
});
describe("appendWikiLog", () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wiki-log-test-"));
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it("should append entry to existing log", async () => {
        await fs.writeFile(path.join(tempDir, "log.md"), "# Wiki Log\n\n## [2025-01-01] initial setup\n\n---\n");
        await appendWikiLog(tempDir, "ingest | test.txt");
        const content = await fs.readFile(path.join(tempDir, "log.md"), "utf-8");
        expect(content).toContain("initial setup");
        expect(content).toContain("ingest");
    });
    it("should create log if it does not exist", async () => {
        await appendWikiLog(tempDir, "first entry");
        const content = await fs.readFile(path.join(tempDir, "log.md"), "utf-8");
        expect(content).toContain("# Wiki Log");
        expect(content).toContain("first entry");
    });
});
//# sourceMappingURL=wiki-ingest.test.js.map