/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from "vitest";
import { LlamaCppOpenAICompatibleProvider } from "./llamacpp.js";
describe("LlamaCppOpenAICompatibleProvider", () => {
    const baseConfig = {
        model: "test-model",
        apiKey: "llamacpp-local-key",
        baseUrl: "http://127.0.0.1:8080/v1",
    };
    describe("isLlamaCppProvider", () => {
        it("should return true for dummy API key", () => {
            const config = {
                model: "test-model",
                apiKey: "llamacpp-local-key",
            };
            expect(LlamaCppOpenAICompatibleProvider.isLlamaCppProvider(config)).toBe(true);
        });
        it("should return true for matching localhost port", () => {
            process.env["LLAMA_CPP_PORT"] = "8080";
            const config = {
                model: "test-model",
                baseUrl: "http://127.0.0.1:8080/v1",
            };
            expect(LlamaCppOpenAICompatibleProvider.isLlamaCppProvider(config)).toBe(true);
        });
        it("should return false for non-matching config", () => {
            const config = {
                model: "test-model",
                apiKey: "some-other-key",
                baseUrl: "https://api.openai.com/v1",
            };
            expect(LlamaCppOpenAICompatibleProvider.isLlamaCppProvider(config)).toBe(false);
        });
        it("should return false for empty config", () => {
            const config = { model: "test-model" };
            expect(LlamaCppOpenAICompatibleProvider.isLlamaCppProvider(config)).toBe(false);
        });
    });
    describe("shouldUseResponses", () => {
        it("should always return false for llama.cpp", () => {
            // Mock minimal Config — we only need to check the method, not full instantiation
            const mockConfig = {};
            const provider = new LlamaCppOpenAICompatibleProvider(baseConfig, mockConfig);
            expect(provider.shouldUseResponses("any-model")).toBe(false);
        });
    });
    describe("buildRequest", () => {
        it("should enforce max_tokens default when not provided", () => {
            const mockConfig = {};
            const provider = new LlamaCppOpenAICompatibleProvider(baseConfig, mockConfig);
            const request = {
                model: "test-model",
                messages: [{ role: "user", content: "hello" }],
            };
            const result = provider.buildRequest(request, "prompt-id");
            expect(result.max_tokens).toBe(8000);
        });
        it("should preserve existing max_tokens when provided", () => {
            const mockConfig = {};
            const provider = new LlamaCppOpenAICompatibleProvider(baseConfig, mockConfig);
            const request = {
                model: "test-model",
                messages: [{ role: "user", content: "hello" }],
                max_tokens: 4096,
            };
            const result = provider.buildRequest(request, "prompt-id");
            expect(result.max_tokens).toBe(4096);
        });
    });
    describe("buildHeaders", () => {
        it("should include User-Agent header", () => {
            const mockConfig = { getCliVersion: () => "1.0.0" };
            const provider = new LlamaCppOpenAICompatibleProvider(baseConfig, mockConfig);
            const headers = provider.buildHeaders();
            expect(headers["User-Agent"]).toBeDefined();
        });
    });
});
//# sourceMappingURL=llamacpp.test.js.map