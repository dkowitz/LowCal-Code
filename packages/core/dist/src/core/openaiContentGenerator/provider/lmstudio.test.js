/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LMStudioOpenAICompatibleProvider } from "./lmstudio.js";
describe("LMStudioOpenAICompatibleProvider", () => {
    let mockConfig;
    let contentGeneratorConfig;
    beforeEach(() => {
        // Mock config
        mockConfig = {
            getCliVersion: vi.fn().mockReturnValue("1.0.0"),
            getContentGeneratorConfig: vi.fn().mockReturnValue(undefined),
        };
        // Content generator config for LM Studio
        contentGeneratorConfig = {
            model: "test-model",
            baseUrl: "http://localhost:1234/v1",
        };
    });
    describe("isLMStudioProvider", () => {
        it("should return true for LM Studio base URLs", () => {
            const config1 = {
                model: "test-model",
                baseUrl: "http://127.0.0.1:1234/v1",
            };
            const config2 = {
                model: "test-model",
                baseUrl: "http://localhost:1234/v1",
            };
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config1)).toBe(true);
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config2)).toBe(true);
        });
        it("should return false for non-local base URLs", () => {
            const config1 = {
                model: "test-model",
                baseUrl: "http://openai.com/v1",
            };
            const config2 = {
                model: "test-model",
                baseUrl: "https://api.example.com/v1",
            };
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config1)).toBe(false);
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config2)).toBe(false);
        });
        it("should return true for localhost URLs even on non-default ports", () => {
            const config = {
                model: "test-model",
                baseUrl: "http://localhost:5678/v1",
            };
            expect(LMStudioOpenAICompatibleProvider.isLMStudioProvider(config)).toBe(true);
        });
    });
    describe("buildHeaders", () => {
        it("should remove User-Agent header for LM Studio compatibility", () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const headers = provider.buildHeaders();
            expect(headers["User-Agent"]).toBeUndefined();
        });
    });
    describe("buildRequest", () => {
        it("should inject max_tokens when not already present", () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const request = {
                model: "test-model",
                messages: [{ role: "user", content: "Hello" }],
            };
            const result = provider.buildRequest(request, "test-prompt");
            expect(result.max_tokens).toBe(8000);
        });
        it("should preserve existing max_tokens from the request", () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const request = {
                model: "test-model",
                messages: [{ role: "user", content: "Hello" }],
                max_tokens: 4096,
            };
            const result = provider.buildRequest(request, "test-prompt");
            expect(result.max_tokens).toBe(4096);
        });
        it("should inject max_tokens even when cache control is disabled", () => {
            const mockConfigWithCacheDisabled = {
                getCliVersion: vi.fn().mockReturnValue("1.0.0"),
                getContentGeneratorConfig: vi.fn().mockReturnValue({
                    disableCacheControl: true,
                }),
            };
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfigWithCacheDisabled);
            const request = {
                model: "test-model",
                messages: [{ role: "user", content: "Hello" }],
            };
            const result = provider.buildRequest(request, "test-prompt");
            expect(result.max_tokens).toBe(8000);
        });
        it("should add cache control markers when cache control is enabled", () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const request = {
                model: "test-model",
                messages: [
                    { role: "system", content: "You are helpful" },
                    { role: "user", content: "Hello" },
                ],
            };
            const result = provider.buildRequest(request, "test-prompt");
            expect(result.max_tokens).toBe(8000);
            // Verify cache control markers were added
            expect(Array.isArray(result.messages[0].content)).toBe(true);
        });
    });
    describe("unloadModel", () => {
        it("should attempt to unload the model without throwing an error", async () => {
            const provider = new LMStudioOpenAICompatibleProvider(contentGeneratorConfig, mockConfig);
            const unloadPromise = provider.unloadModel();
            await expect(unloadPromise).resolves.not.toThrow();
        });
    });
});
//# sourceMappingURL=lmstudio.test.js.map