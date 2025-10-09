/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs";
import * as path from "node:path";
import ignore, {} from "ignore";
import { isGitRepository } from "./gitUtils.js";
export class GitIgnoreParser {
    projectRoot;
    ig = ignore();
    patterns = [];
    constructor(projectRoot) {
        this.projectRoot = path.resolve(projectRoot);
    }
    loadGitRepoPatterns() {
        if (!isGitRepository(this.projectRoot))
            return;
        // Always ignore .git directory regardless of .gitignore content
        this.addPatterns([".git"]);
        const patternFiles = [".gitignore", path.join(".git", "info", "exclude")];
        for (const pf of patternFiles) {
            this.loadPatterns(pf);
        }
    }
    loadPatterns(patternsFileName) {
        const patternsFilePath = path.join(this.projectRoot, patternsFileName);
        let content;
        try {
            content = fs.readFileSync(patternsFilePath, "utf-8");
        }
        catch (_error) {
            // ignore file not found
            return;
        }
        const patterns = (content ?? "")
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p !== "" && !p.startsWith("#"));
        this.addPatterns(patterns);
    }
    addPatterns(patterns) {
        this.ig.add(patterns);
        this.patterns.push(...patterns);
    }
    isIgnored(filePath) {
        const resolved = path.resolve(this.projectRoot, filePath);
        const relativePath = path.relative(this.projectRoot, resolved);
        if (relativePath === "" || relativePath.startsWith("..")) {
            return false;
        }
        // Even in windows, Ignore expects forward slashes.
        const normalizedPath = relativePath.replace(/\\/g, "/");
        return this.ig.ignores(normalizedPath);
    }
    getPatterns() {
        return this.patterns;
    }
}
//# sourceMappingURL=gitIgnoreParser.js.map