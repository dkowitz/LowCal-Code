/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { AuthType } from "@qwen-code/qwen-code-core";
import { createModelSourceKey } from "./modelSourceKey.js";
describe("createModelSourceKey", () => {
    it("produces distinct keys for different providers", () => {
        const openrouterKey = createModelSourceKey({
            authType: AuthType.USE_OPENAI,
            providerId: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1",
        });
        const lmStudioKey = createModelSourceKey({
            authType: AuthType.USE_OPENAI,
            providerId: "lmstudio",
            baseUrl: "http://127.0.0.1:1234/v1",
        });
        expect(openrouterKey).not.toEqual(lmStudioKey);
    });
    it("normalizes trailing slashes in base URLs", () => {
        const keyWithoutSlash = createModelSourceKey({
            authType: AuthType.USE_OPENAI,
            providerId: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1",
        });
        const keyWithSlash = createModelSourceKey({
            authType: AuthType.USE_OPENAI,
            providerId: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1/",
        });
        expect(keyWithoutSlash).toEqual(keyWithSlash);
    });
    it("falls back to provider only for non OpenAI auth types", () => {
        const qwenKey = createModelSourceKey({
            authType: AuthType.QWEN_OAUTH,
        });
        const geminiKey = createModelSourceKey({
            authType: AuthType.USE_GEMINI,
        });
        expect(qwenKey).not.toEqual(geminiKey);
    });
});
//# sourceMappingURL=modelSourceKey.test.js.map