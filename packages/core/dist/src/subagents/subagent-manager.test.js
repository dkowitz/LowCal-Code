/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { SubagentManager } from "./subagent-manager.js";
import { SubagentError } from "./types.js";
import { makeFakeConfig } from "../test-utils/config.js";
// Mock file system operations
vi.mock("fs/promises");
vi.mock("os", async (importOriginal) => {
    const os = await importOriginal();
    return {
        ...os,
        homedir: vi.fn(() => "/home/user"),
        tmpdir: vi.fn(() => "/tmp"),
    };
});
vi.mock("node:os", async (importOriginal) => {
    const os = await importOriginal();
    return {
        ...os,
        homedir: vi.fn(() => "/home/user"),
        tmpdir: vi.fn(() => "/tmp"),
    };
});
// Mock yaml parser - use vi.hoisted for proper hoisting
const mockParseYaml = vi.hoisted(() => vi.fn());
const mockStringifyYaml = vi.hoisted(() => vi.fn());
vi.mock("../utils/yaml-parser.js", () => ({
    parse: mockParseYaml,
    stringify: mockStringifyYaml,
}));
// Mock dependencies - create mock functions at the top level
const mockValidateConfig = vi.hoisted(() => vi.fn());
const mockValidateOrThrow = vi.hoisted(() => vi.fn());
vi.mock("./validation.js", () => ({
    SubagentValidator: class MockSubagentValidator {
        validateConfig = mockValidateConfig;
        validateOrThrow = mockValidateOrThrow;
    },
}));
vi.mock("./subagent.js");
describe("SubagentManager", () => {
    let manager;
    let mockToolRegistry;
    let mockConfig;
    beforeEach(() => {
        mockToolRegistry = {
            getAllTools: vi.fn().mockReturnValue([
                { name: "read_file", displayName: "Read File" },
                { name: "write_file", displayName: "Write File" },
                { name: "grep", displayName: "Search Files" },
            ]),
        };
        // Create mock Config object using test utility
        mockConfig = makeFakeConfig({
            sessionId: "test-session-id",
        });
        // Mock the tool registry and project root methods
        vi.spyOn(mockConfig, "getToolRegistry").mockReturnValue(mockToolRegistry);
        vi.spyOn(mockConfig, "getProjectRoot").mockReturnValue("/test/project");
        // Mock os.homedir
        vi.mocked(os.homedir).mockReturnValue("/home/user");
        // Reset and setup mocks
        vi.clearAllMocks();
        mockValidateConfig.mockReturnValue({
            isValid: true,
            errors: [],
            warnings: [],
        });
        mockValidateOrThrow.mockImplementation(() => { });
        // Setup yaml parser mocks with sophisticated behavior
        mockParseYaml.mockImplementation((yamlString) => {
            // Handle different test cases based on YAML content
            if (yamlString.includes("tools:")) {
                return {
                    name: "test-agent",
                    description: "A test subagent",
                    tools: ["read_file", "write_file"],
                };
            }
            if (yamlString.includes("modelConfig:")) {
                return {
                    name: "test-agent",
                    description: "A test subagent",
                    modelConfig: { model: "custom-model", temp: 0.5 },
                };
            }
            if (yamlString.includes("runConfig:")) {
                return {
                    name: "test-agent",
                    description: "A test subagent",
                    runConfig: { max_time_minutes: 5, max_turns: 10 },
                };
            }
            if (yamlString.includes("name: agent1")) {
                return { name: "agent1", description: "First agent" };
            }
            if (yamlString.includes("name: agent2")) {
                return { name: "agent2", description: "Second agent" };
            }
            if (yamlString.includes("name: agent3")) {
                return { name: "agent3", description: "Third agent" };
            }
            if (yamlString.includes("name: 11")) {
                return { name: 11, description: 333 }; // Numeric values test case
            }
            if (yamlString.includes("name: true")) {
                return { name: true, description: false }; // Boolean values test case
            }
            if (!yamlString.includes("name:")) {
                return { description: "A test subagent" }; // Missing name case
            }
            if (!yamlString.includes("description:")) {
                return { name: "test-agent" }; // Missing description case
            }
            // Default case
            return {
                name: "test-agent",
                description: "A test subagent",
            };
        });
        mockStringifyYaml.mockImplementation((obj) => {
            let yaml = "";
            for (const [key, value] of Object.entries(obj)) {
                if (key === "tools" && Array.isArray(value)) {
                    yaml += `tools:\n${value.map((tool) => `  - ${tool}`).join("\n")}\n`;
                }
                else if (key === "modelConfig" &&
                    typeof value === "object" &&
                    value) {
                    yaml += `modelConfig:\n`;
                    for (const [k, v] of Object.entries(value)) {
                        yaml += `  ${k}: ${v}\n`;
                    }
                }
                else if (key === "runConfig" && typeof value === "object" && value) {
                    yaml += `runConfig:\n`;
                    for (const [k, v] of Object.entries(value)) {
                        yaml += `  ${k}: ${v}\n`;
                    }
                }
                else {
                    yaml += `${key}: ${value}\n`;
                }
            }
            return yaml.trim();
        });
        manager = new SubagentManager(mockConfig);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    const validConfig = {
        name: "test-agent",
        description: "A test subagent",
        systemPrompt: "You are a helpful assistant.",
        level: "project",
        filePath: "/test/project/.qwen/agents/test-agent.md",
    };
    const validMarkdown = `---
name: test-agent
description: A test subagent
---

You are a helpful assistant.
`;
    const asReaddirResult = (entries) => entries;
    describe("parseSubagentContent", () => {
        it("should parse valid markdown content", () => {
            const config = manager.parseSubagentContent(validMarkdown, validConfig.filePath, "project");
            expect(config.name).toBe("test-agent");
            expect(config.description).toBe("A test subagent");
            expect(config.systemPrompt).toBe("You are a helpful assistant.");
            expect(config.level).toBe("project");
            expect(config.filePath).toBe(validConfig.filePath);
        });
        it("should parse content with tools", () => {
            const markdownWithTools = `---
name: test-agent
description: A test subagent
tools:
  - read_file
  - write_file
---

You are a helpful assistant.
`;
            const config = manager.parseSubagentContent(markdownWithTools, validConfig.filePath, "project");
            expect(config.tools).toEqual(["read_file", "write_file"]);
        });
        it("should parse content with model config", () => {
            const markdownWithModel = `---
name: test-agent
description: A test subagent
modelConfig:
  model: custom-model
  temp: 0.5
---

You are a helpful assistant.
`;
            const config = manager.parseSubagentContent(markdownWithModel, validConfig.filePath, "project");
            expect(config.modelConfig).toEqual({ model: "custom-model", temp: 0.5 });
        });
        it("should parse content with run config", () => {
            const markdownWithRun = `---
name: test-agent
description: A test subagent
runConfig:
  max_time_minutes: 5
  max_turns: 10
---

You are a helpful assistant.
`;
            const config = manager.parseSubagentContent(markdownWithRun, validConfig.filePath, "project");
            expect(config.runConfig).toEqual({ max_time_minutes: 5, max_turns: 10 });
        });
        it("should handle numeric name and description values", () => {
            const markdownWithNumeric = `---
name: 11
description: 333
---

You are a helpful assistant.
`;
            const config = manager.parseSubagentContent(markdownWithNumeric, validConfig.filePath, "project");
            expect(config.name).toBe("11");
            expect(config.description).toBe("333");
            expect(typeof config.name).toBe("string");
            expect(typeof config.description).toBe("string");
        });
        it("should handle boolean name and description values", () => {
            const markdownWithBoolean = `---
name: true
description: false
---

You are a helpful assistant.
`;
            const config = manager.parseSubagentContent(markdownWithBoolean, validConfig.filePath, "project");
            expect(config.name).toBe("true");
            expect(config.description).toBe("false");
            expect(typeof config.name).toBe("string");
            expect(typeof config.description).toBe("string");
        });
        it("should determine level from file path", () => {
            const projectPath = "/test/project/.qwen/agents/test-agent.md";
            const userPath = "/home/user/.qwen/agents/test-agent.md";
            const projectConfig = manager.parseSubagentContent(validMarkdown, projectPath, "project");
            const userConfig = manager.parseSubagentContent(validMarkdown, userPath, "user");
            expect(projectConfig.level).toBe("project");
            expect(userConfig.level).toBe("user");
        });
        it("should throw error for invalid frontmatter format", () => {
            const invalidMarkdown = `No frontmatter here
Just content`;
            expect(() => manager.parseSubagentContent(invalidMarkdown, validConfig.filePath, "project")).toThrow(SubagentError);
        });
        it("should throw error for missing name", () => {
            const markdownWithoutName = `---
description: A test subagent
---

You are a helpful assistant.
`;
            expect(() => manager.parseSubagentContent(markdownWithoutName, validConfig.filePath, "project")).toThrow(SubagentError);
        });
        it("should throw error for missing description", () => {
            const markdownWithoutDescription = `---
name: test-agent
---

You are a helpful assistant.
`;
            expect(() => manager.parseSubagentContent(markdownWithoutDescription, validConfig.filePath, "project")).toThrow(SubagentError);
        });
        it("should not warn when filename matches subagent name", () => {
            const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
            const matchingPath = "/test/project/.qwen/agents/test-agent.md";
            const config = manager.parseSubagentContent(validMarkdown, matchingPath, "project");
            expect(config.name).toBe("test-agent");
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
    describe("serializeSubagent", () => {
        it("should serialize basic configuration", () => {
            const serialized = manager.serializeSubagent(validConfig);
            expect(serialized).toContain("name: test-agent");
            expect(serialized).toContain("description: A test subagent");
            expect(serialized).toContain("You are a helpful assistant.");
            expect(serialized).toMatch(/^---\n[\s\S]*\n---\n\n[\s\S]*\n$/);
        });
        it("should serialize configuration with tools", () => {
            const configWithTools = {
                ...validConfig,
                tools: ["read_file", "write_file"],
            };
            const serialized = manager.serializeSubagent(configWithTools);
            expect(serialized).toContain("tools:");
            expect(serialized).toContain("- read_file");
            expect(serialized).toContain("- write_file");
        });
        it("should serialize configuration with model config", () => {
            const configWithModel = {
                ...validConfig,
                modelConfig: { model: "custom-model", temp: 0.5 },
            };
            const serialized = manager.serializeSubagent(configWithModel);
            expect(serialized).toContain("modelConfig:");
            expect(serialized).toContain("model: custom-model");
            expect(serialized).toContain("temp: 0.5");
        });
        it("should not include empty optional fields", () => {
            const serialized = manager.serializeSubagent(validConfig);
            expect(serialized).not.toContain("tools:");
            expect(serialized).not.toContain("modelConfig:");
            expect(serialized).not.toContain("runConfig:");
        });
    });
    describe("loadSubagent", () => {
        it("should load subagent from project level first", async () => {
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult(["test-agent.md"]));
            vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);
            const config = await manager.loadSubagent("test-agent");
            expect(config).toBeDefined();
            expect(config.name).toBe("test-agent");
            expect(fs.readdir).toHaveBeenCalledWith(path.normalize("/test/project/.qwen/agents"));
            expect(fs.readFile).toHaveBeenCalledWith(path.normalize("/test/project/.qwen/agents/test-agent.md"), "utf8");
        });
        it("should fall back to user level if project level fails", async () => {
            vi.mocked(fs.readdir)
                .mockRejectedValueOnce(new Error("Project dir not found")) // project level fails
                .mockResolvedValueOnce(asReaddirResult(["test-agent.md"])); // user level succeeds
            vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);
            const config = await manager.loadSubagent("test-agent");
            expect(config).toBeDefined();
            expect(config.name).toBe("test-agent");
            expect(fs.readdir).toHaveBeenCalledWith(path.normalize("/home/user/.qwen/agents"));
            expect(fs.readFile).toHaveBeenCalledWith(path.normalize("/home/user/.qwen/agents/test-agent.md"), "utf8");
        });
        it("should return null if not found at either level", async () => {
            vi.mocked(fs.readdir).mockRejectedValue(new Error("Directory not found"));
            const config = await manager.loadSubagent("nonexistent");
            expect(config).toBeNull();
        });
        it("should load subagent even when filename does not match name", async () => {
            // Mock readdir to return files with different names
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult(["wrong-filename.md", "another-file.md"]));
            // Mock readFile to return content with different name
            const mismatchedMarkdown = `---
name: correct-agent-name
description: A test subagent with mismatched filename
---

You are a helpful assistant.`;
            const anotherFileMarkdown = `---
name: other-agent
description: Some other agent
---

You are another assistant.`;
            vi.mocked(fs.readFile)
                .mockResolvedValueOnce(mismatchedMarkdown) // first file (wrong-filename.md) - matches!
                .mockResolvedValueOnce(anotherFileMarkdown); // second file (another-file.md) - doesn't match
            // Mock parseYaml for different scenarios
            mockParseYaml
                .mockReturnValueOnce({
                name: "correct-agent-name",
                description: "A test subagent with mismatched filename",
            })
                .mockReturnValueOnce({
                name: "other-agent",
                description: "Some other agent",
            });
            const config = await manager.loadSubagent("correct-agent-name");
            expect(config).toBeDefined();
            expect(config.name).toBe("correct-agent-name");
            expect(config.filePath).toBe(path.normalize("/test/project/.qwen/agents/wrong-filename.md"));
            // Verify it scanned the directory instead of using direct path
            expect(fs.readdir).toHaveBeenCalledWith(path.normalize("/test/project/.qwen/agents"));
        });
        it("should search user level when filename mismatch at project level", async () => {
            // Mock project level to have no matching files
            vi.mocked(fs.readdir)
                .mockResolvedValueOnce(asReaddirResult(["other-file.md"])) // project level
                .mockResolvedValueOnce(asReaddirResult(["user-agent.md"])); // user level
            const projectMarkdown = `---
name: wrong-agent
description: Wrong agent
---

You are a wrong assistant.`;
            const userMarkdown = `---
name: target-agent
description: A test subagent at user level
---

You are a helpful assistant.`;
            vi.mocked(fs.readFile)
                .mockResolvedValueOnce(projectMarkdown) // project level file (other-file.md)
                .mockResolvedValueOnce(userMarkdown); // user level file (user-agent.md)
            // Mock parseYaml for different scenarios
            mockParseYaml
                .mockReturnValueOnce({
                name: "wrong-agent",
                description: "Wrong agent",
            })
                .mockReturnValueOnce({
                name: "target-agent",
                description: "A test subagent at user level",
            });
            const config = await manager.loadSubagent("target-agent");
            expect(config).toBeDefined();
            expect(config.name).toBe("target-agent");
            expect(config.filePath).toBe(path.normalize("/home/user/.qwen/agents/user-agent.md"));
            expect(config.level).toBe("user");
        });
        it("should handle specific level search with filename mismatch", async () => {
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult(["misnamed-file.md"]));
            const levelMarkdown = `---
name: specific-agent
description: A test subagent for specific level
---

You are a helpful assistant.`;
            vi.mocked(fs.readFile).mockResolvedValue(levelMarkdown);
            mockParseYaml.mockReturnValue({
                name: "specific-agent",
                description: "A test subagent for specific level",
            });
            const config = await manager.loadSubagent("specific-agent", "project");
            expect(config).toBeDefined();
            expect(config.name).toBe("specific-agent");
            expect(config.filePath).toBe(path.normalize("/test/project/.qwen/agents/misnamed-file.md"));
        });
    });
    describe("listSubagents", () => {
        beforeEach(() => {
            // Mock directory listing
            vi.mocked(fs.readdir)
                .mockResolvedValueOnce(asReaddirResult(["agent1.md", "agent2.md", "not-md.txt"]))
                .mockResolvedValueOnce(asReaddirResult(["agent3.md", "agent1.md"])); // user level
            // Mock file reading for valid agents
            vi.mocked(fs.readFile).mockImplementation((filePath) => {
                const pathStr = String(filePath);
                if (pathStr.includes("agent1.md")) {
                    return Promise.resolve(`---
name: agent1
description: First agent
---
System prompt 1`);
                }
                else if (pathStr.includes("agent2.md")) {
                    return Promise.resolve(`---
name: agent2
description: Second agent
---
System prompt 2`);
                }
                else if (pathStr.includes("agent3.md")) {
                    return Promise.resolve(`---
name: agent3
description: Third agent
---
System prompt 3`);
                }
                return Promise.reject(new Error("File not found"));
            });
        });
        it("should list subagents from both levels", async () => {
            const subagents = await manager.listSubagents();
            expect(subagents).toHaveLength(4); // agent1 (project takes precedence), agent2, agent3, general-purpose (built-in)
            expect(subagents.map((s) => s.name)).toEqual([
                "agent1",
                "agent2",
                "agent3",
                "general-purpose",
            ]);
        });
        it("should prioritize project level over user level", async () => {
            const subagents = await manager.listSubagents();
            const agent1 = subagents.find((s) => s.name === "agent1");
            expect(agent1.level).toBe("project");
        });
        it("should filter by level", async () => {
            const projectSubagents = await manager.listSubagents({
                level: "project",
            });
            expect(projectSubagents).toHaveLength(2); // agent1, agent2
            expect(projectSubagents.every((s) => s.level === "project")).toBe(true);
        });
        it("should sort by name", async () => {
            const subagents = await manager.listSubagents({
                sortBy: "name",
                sortOrder: "asc",
            });
            const names = subagents.map((s) => s.name);
            expect(names).toEqual(["agent1", "agent2", "agent3", "general-purpose"]);
        });
        it("should handle empty directories", async () => {
            // Reset all mocks for this specific test
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult([]));
            vi.mocked(fs.readFile).mockRejectedValue(new Error("No files"));
            const subagents = await manager.listSubagents();
            expect(subagents).toHaveLength(1); // Only built-in agents remain
            expect(subagents[0].name).toBe("general-purpose");
            expect(subagents[0].level).toBe("builtin");
        });
        it("should handle directory read errors", async () => {
            // Reset all mocks for this specific test
            vi.mocked(fs.readdir).mockRejectedValue(new Error("Directory not found"));
            vi.mocked(fs.readFile).mockRejectedValue(new Error("No files"));
            const subagents = await manager.listSubagents();
            expect(subagents).toHaveLength(1); // Only built-in agents remain
            expect(subagents[0].name).toBe("general-purpose");
            expect(subagents[0].level).toBe("builtin");
        });
    });
    describe("findSubagentByName", () => {
        it("should find existing subagent", async () => {
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult(["test-agent.md"]));
            vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);
            const metadata = await manager.findSubagentByName("test-agent");
            expect(metadata).toBeDefined();
            expect(metadata.name).toBe("test-agent");
            expect(metadata.description).toBe("A test subagent");
        });
        it("should return null for non-existent subagent", async () => {
            vi.mocked(fs.readdir).mockRejectedValue(new Error("Directory not found"));
            const metadata = await manager.findSubagentByName("nonexistent");
            expect(metadata).toBeNull();
        });
    });
    describe("isNameAvailable", () => {
        it("should return true for available names", async () => {
            vi.mocked(fs.readdir).mockRejectedValue(new Error("Directory not found"));
            const available = await manager.isNameAvailable("new-agent");
            expect(available).toBe(true);
        });
        it("should return false for existing names", async () => {
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult(["test-agent.md"]));
            vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);
            const available = await manager.isNameAvailable("test-agent");
            expect(available).toBe(false);
        });
        it("should check specific level when provided", async () => {
            // The isNameAvailable method loads from both levels and checks if found subagent is at different level
            // First call: loads subagent (found at user level), checks if it's at project level (different) -> available
            vi.mocked(fs.readdir)
                .mockRejectedValueOnce(new Error("Project dir not found")) // project level
                .mockResolvedValueOnce(asReaddirResult(["test-agent.md"])); // user level - found here
            vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);
            const availableAtProject = await manager.isNameAvailable("test-agent", "project");
            expect(availableAtProject).toBe(true); // Available at project because found at user level
            // Second call: loads subagent (found at user level), checks if it's at user level (same) -> not available
            vi.mocked(fs.readdir).mockResolvedValue(asReaddirResult(["test-agent.md"])); // user level - found here
            vi.mocked(fs.readFile).mockResolvedValue(validMarkdown);
            const availableAtUser = await manager.isNameAvailable("test-agent", "user");
            expect(availableAtUser).toBe(false); // Not available at user because found at user level
        });
    });
    describe("Runtime Configuration Methods", () => {
        describe("convertToRuntimeConfig", () => {
            it("should convert basic configuration", () => {
                const runtimeConfig = manager.convertToRuntimeConfig(validConfig);
                expect(runtimeConfig.promptConfig.systemPrompt).toBe(validConfig.systemPrompt);
                expect(runtimeConfig.modelConfig).toEqual({});
                expect(runtimeConfig.runConfig).toEqual({});
                expect(runtimeConfig.toolConfig).toBeUndefined();
            });
            it("should include tool configuration when tools are specified", () => {
                const configWithTools = {
                    ...validConfig,
                    tools: ["read_file", "write_file"],
                };
                const runtimeConfig = manager.convertToRuntimeConfig(configWithTools);
                expect(runtimeConfig.toolConfig).toBeDefined();
                expect(runtimeConfig.toolConfig.tools).toEqual([
                    "read_file",
                    "write_file",
                ]);
            });
            it("should transform display names to tool names in tool configuration", () => {
                const configWithDisplayNames = {
                    ...validConfig,
                    tools: ["Read File", "write_file", "Search Files", "unknown_tool"],
                };
                const runtimeConfig = manager.convertToRuntimeConfig(configWithDisplayNames);
                expect(runtimeConfig.toolConfig).toBeDefined();
                expect(runtimeConfig.toolConfig.tools).toEqual([
                    "read_file", // 'Read File' -> 'read_file' (display name match)
                    "write_file", // 'write_file' -> 'write_file' (exact name match)
                    "grep", // 'Search Files' -> 'grep' (display name match)
                    "unknown_tool", // 'unknown_tool' -> 'unknown_tool' (preserved as-is)
                ]);
            });
            it("should merge custom model and run configurations", () => {
                const configWithCustom = {
                    ...validConfig,
                    modelConfig: { model: "custom-model", temp: 0.5 },
                    runConfig: { max_time_minutes: 5 },
                };
                const runtimeConfig = manager.convertToRuntimeConfig(configWithCustom);
                expect(runtimeConfig.modelConfig.model).toBe("custom-model");
                expect(runtimeConfig.modelConfig.temp).toBe(0.5);
                expect(runtimeConfig.runConfig.max_time_minutes).toBe(5);
                // No default values are provided anymore
                expect(Object.keys(runtimeConfig.modelConfig)).toEqual([
                    "model",
                    "temp",
                ]);
                expect(Object.keys(runtimeConfig.runConfig)).toEqual([
                    "max_time_minutes",
                ]);
            });
        });
    });
});
//# sourceMappingURL=subagent-manager.test.js.map