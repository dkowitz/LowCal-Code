/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, } from "vitest";
import { researchCommand } from "./researchCommand.js";
import { createMockCommandContext } from "../../test-utils/mockCommandContext.js";
const { buildMock, executeMock, researchToolConstructorMock, partToStringMock, } = vi.hoisted(() => ({
    buildMock: vi.fn(),
    executeMock: vi.fn(),
    researchToolConstructorMock: vi.fn(),
    partToStringMock: vi.fn(),
}));
vi.mock("@qwen-code/qwen-code-core", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        ResearchTool: researchToolConstructorMock,
        partToString: partToStringMock,
    };
});
let toolConfig;
let ToolNames;
beforeAll(async () => {
    const core = await import("@qwen-code/qwen-code-core");
    toolConfig = core.toolConfig;
    ToolNames = core.ToolNames;
});
describe("researchCommand", () => {
    let mockContext;
    beforeEach(() => {
        vi.clearAllMocks();
        executeMock.mockImplementation((_signal, update) => {
            update?.("ℹ🔎 Mock progress update");
            return Promise.resolve({
                llmContent: "Mock research result",
            });
        });
        buildMock.mockImplementation(() => ({
            execute: executeMock,
        }));
        researchToolConstructorMock.mockImplementation(() => ({
            build: buildMock,
        }));
        partToStringMock.mockImplementation((content) => content || "");
        // Configure toolset defaults for tests
        toolConfig.activeCollection = "full";
        toolConfig.collections = {
            full: [
                ToolNames.WEB_FETCH,
                ToolNames.WEB_SEARCH,
                ToolNames.SEARXNG_SEARCH,
            ],
        };
        const allowedTools = new Set([
            ToolNames.WEB_FETCH,
            ToolNames.WEB_SEARCH,
            ToolNames.SEARXNG_SEARCH,
        ]);
        const toolRegistry = {
            getTool: vi.fn((name) => allowedTools.has(name) ? { name } : undefined),
        };
        mockContext = createMockCommandContext();
        mockContext.services.config = {
            getToolRegistry: vi.fn(() => toolRegistry),
        };
    });
    afterEach(() => {
        buildMock.mockReset();
        executeMock.mockReset();
        researchToolConstructorMock.mockReset();
        partToStringMock.mockReset();
    });
    it("should be defined with correct properties", () => {
        expect(researchCommand).toBeDefined();
        expect(researchCommand.name).toBe("research");
        expect(researchCommand.description).toContain("Conduct deep internet research");
        expect(typeof researchCommand.action).toBe("function");
    });
    it("parses mode and query with quotes and executes research tool", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        const result = await researchCommand.action(mockContext, `speed "climate change impact on Lake Michigan shoreline"`);
        expect(researchToolConstructorMock).toHaveBeenCalledTimes(1);
        expect(buildMock).toHaveBeenCalledWith({
            mode: "speed",
            query: "climate change impact on Lake Michigan shoreline",
            searchTools: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
        });
        expect(executeMock).toHaveBeenCalledTimes(1);
        expect(partToStringMock).toHaveBeenCalledWith("Mock research result");
        expect(mockContext.ui.setPendingItem).toHaveBeenNthCalledWith(1, expect.objectContaining({
            type: "info",
            text: expect.stringContaining("Tavily + SearXNG"),
        }));
        expect(mockContext.ui.setPendingItem).toHaveBeenNthCalledWith(2, expect.objectContaining({
            type: "info",
            text: "ℹ🔎 Mock progress update",
        }));
        expect(mockContext.ui.setPendingItem).toHaveBeenLastCalledWith(null);
        expect(result).toEqual({
            type: "message",
            messageType: "info",
            content: "Mock research result",
        });
    });
    it("defaults mode to balanced when omitted", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        await researchCommand.action(mockContext, "Great Lakes invasive species");
        expect(buildMock).toHaveBeenCalledWith({
            mode: "balanced",
            query: "Great Lakes invasive species",
            searchTools: [ToolNames.WEB_SEARCH, ToolNames.SEARXNG_SEARCH],
        });
    });
    it("returns error when query is missing", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        const result = await researchCommand.action(mockContext, "speed ");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "Research command requires a query. Usage: /research <mode> <query>\nAvailable modes: speed, balanced, quality (default is 'balanced')",
        });
        expect(buildMock).not.toHaveBeenCalled();
    });
    it("returns error when required search tools are disabled", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        toolConfig.activeCollection = "custom";
        toolConfig.collections = {
            custom: [ToolNames.WEB_FETCH],
        };
        const result = await researchCommand.action(mockContext, "balanced freshwater ecosystem trends");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "Research requires either the web_search or searxng_search tool. Enable one with /toolset and try again.",
        });
        expect(buildMock).not.toHaveBeenCalled();
        expect(mockContext.ui.setPendingItem).not.toHaveBeenCalled();
    });
    it("returns error when web_fetch is not enabled", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        toolConfig.activeCollection = "custom";
        toolConfig.collections = {
            custom: [ToolNames.WEB_SEARCH],
        };
        const missingFetchRegistry = {
            getTool: vi.fn((name) => name === ToolNames.WEB_SEARCH ? { name } : undefined),
        };
        mockContext.services.config.getToolRegistry = vi.fn(() => missingFetchRegistry);
        const result = await researchCommand.action(mockContext, "quality local housing initiatives");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "Research requires the web_fetch tool. Enable it with /toolset and try again.",
        });
        expect(buildMock).not.toHaveBeenCalled();
        expect(mockContext.ui.setPendingItem).not.toHaveBeenCalled();
    });
    it("uses single available search tool when only searxng_search is enabled", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        const searxAllowed = new Set([
            ToolNames.WEB_FETCH,
            ToolNames.SEARXNG_SEARCH,
        ]);
        const searxOnlyRegistry = {
            getTool: vi.fn((name) => searxAllowed.has(name) ? { name } : undefined),
        };
        mockContext.services.config.getToolRegistry = vi.fn(() => searxOnlyRegistry);
        toolConfig.activeCollection = "custom";
        toolConfig.collections = {
            custom: [ToolNames.WEB_FETCH, ToolNames.SEARXNG_SEARCH],
        };
        await researchCommand.action(mockContext, "quality renewable energy adoption in Michigan");
        expect(buildMock).toHaveBeenCalledWith({
            mode: "quality",
            query: "renewable energy adoption in Michigan",
            searchTools: [ToolNames.SEARXNG_SEARCH],
        });
        expect(mockContext.ui.setPendingItem).toHaveBeenNthCalledWith(1, expect.objectContaining({
            type: "info",
            text: expect.stringContaining("SearXNG"),
        }));
        expect(mockContext.ui.setPendingItem).toHaveBeenNthCalledWith(2, expect.objectContaining({
            type: "info",
            text: "ℹ🔎 Mock progress update",
        }));
        expect(mockContext.ui.setPendingItem).toHaveBeenLastCalledWith(null);
    });
    it("clears progress and surfaces errors when tool execution fails", async () => {
        if (!researchCommand.action) {
            throw new Error("Action not defined");
        }
        executeMock.mockImplementationOnce((_signal, update) => {
            update?.("ℹ🔎 Mock progress update");
            return Promise.reject(new Error("boom"));
        });
        const result = await researchCommand.action(mockContext, "speed failed execution");
        expect(result).toEqual({
            type: "message",
            messageType: "error",
            content: "Research failed: boom",
        });
        expect(mockContext.ui.setPendingItem).toHaveBeenNthCalledWith(1, expect.objectContaining({
            type: "info",
            text: expect.stringContaining("Tavily + SearXNG"),
        }));
        expect(mockContext.ui.setPendingItem).toHaveBeenNthCalledWith(2, expect.objectContaining({
            type: "info",
            text: "ℹ🔎 Mock progress update",
        }));
        expect(mockContext.ui.setPendingItem).toHaveBeenLastCalledWith(null);
    });
});
//# sourceMappingURL=researchCommand.test.js.map