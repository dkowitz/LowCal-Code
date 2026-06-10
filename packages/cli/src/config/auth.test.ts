/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from "@qwen-code/qwen-code-core";
import { vi } from "vitest";
import {
  applyConfiguredAuthToEnv,
  normalizeAuthType,
  validateAuthMethod,
} from "./auth.js";

vi.mock("./settings.js", () => ({
  loadEnvironment: vi.fn(),
}));

describe("validateAuthMethod", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return null for LOGIN_WITH_GOOGLE", () => {
    expect(validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE)).toBeNull();
  });

  it("should return null for CLOUD_SHELL", () => {
    expect(validateAuthMethod(AuthType.CLOUD_SHELL)).toBeNull();
  });

  describe("USE_GEMINI", () => {
    it("should return null if GEMINI_API_KEY is set", () => {
      process.env["GEMINI_API_KEY"] = "test-key";
      expect(validateAuthMethod(AuthType.USE_GEMINI)).toBeNull();
    });

    it("should return an error message if GEMINI_API_KEY is not set", () => {
      expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(
        "GEMINI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!",
      );
    });
  });

  describe("USE_VERTEX_AI", () => {
    it("should return null if GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set", () => {
      process.env["GOOGLE_CLOUD_PROJECT"] = "test-project";
      process.env["GOOGLE_CLOUD_LOCATION"] = "test-location";
      expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
    });

    it("should return null if GOOGLE_API_KEY is set", () => {
      process.env["GOOGLE_API_KEY"] = "test-api-key";
      expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBeNull();
    });

    it("should return an error message if no required environment variables are set", () => {
      expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBe(
        "When using Vertex AI, you must specify either:\n" +
          "• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n" +
          "• GOOGLE_API_KEY environment variable (if using express mode).\n" +
          "Update your environment and try again (no reload needed if using .env)!",
      );
    });
  });

  it("should return an error message for an invalid auth method", () => {
    expect(validateAuthMethod("invalid-method")).toBe(
      "Invalid auth method selected.",
    );
  });

  describe("OpenAI-compatible providers", () => {
    beforeEach(() => {
      delete process.env["OPENAI_API_KEY"];
      delete process.env["OPENAI_BASE_URL"];
      delete process.env["OPENROUTER_API_KEY"];
      delete process.env["GEMINI_API_KEY"];
    });

    it("applies saved OpenRouter settings over stale local env", () => {
      process.env["OPENAI_API_KEY"] = "lmstudio-local-key";
      process.env["OPENAI_BASE_URL"] = "http://127.0.0.1:1234/v1";

      applyConfiguredAuthToEnv({
        selectedType: AuthType.USE_OPENAI,
        providerId: "openrouter",
        providers: {
          openrouter: {
            apiKey: "sk-or-v1-test",
            baseUrl: "https://openrouter.ai/api/v1",
          },
        },
      });

      expect(process.env["OPENAI_API_KEY"]).toBe("sk-or-v1-test");
      expect(process.env["OPENAI_BASE_URL"]).toBe(
        "https://openrouter.ai/api/v1",
      );
    });

    it("does not apply local placeholder keys to remote providers", () => {
      process.env["OPENAI_API_KEY"] = "sk-existing";
      process.env["OPENAI_BASE_URL"] = "https://api.openai.com/v1";

      applyConfiguredAuthToEnv({
        selectedType: AuthType.USE_OPENAI,
        providerId: "openrouter",
        providers: {
          openrouter: {
            apiKey: "lmstudio-local-key",
            baseUrl: "https://openrouter.ai/api/v1",
          },
        },
      });

      expect(process.env["OPENAI_API_KEY"]).toBe("sk-existing");
      expect(process.env["OPENAI_BASE_URL"]).toBe(
        "https://openrouter.ai/api/v1",
      );
    });

    it("clears a stale local placeholder key for remote providers", () => {
      process.env["OPENAI_API_KEY"] = "lmstudio-local-key";

      applyConfiguredAuthToEnv({
        selectedType: AuthType.USE_OPENAI,
        providerId: "openrouter",
        providers: {
          openrouter: {
            baseUrl: "https://openrouter.ai/api/v1",
          },
        },
      });

      expect(process.env["OPENAI_API_KEY"]).toBeUndefined();
      expect(process.env["OPENAI_BASE_URL"]).toBe(
        "https://openrouter.ai/api/v1",
      );
    });

    it("uses OPENROUTER_API_KEY for OpenRouter when no provider key is saved", () => {
      process.env["OPENROUTER_API_KEY"] = "sk-or-v1-env";

      applyConfiguredAuthToEnv({
        selectedType: AuthType.USE_OPENAI,
        providerId: "openrouter",
        providers: {
          openrouter: {
            baseUrl: "https://openrouter.ai/api/v1",
          },
        },
      });

      expect(process.env["OPENAI_API_KEY"]).toBe("sk-or-v1-env");
    });

    it("applies LM Studio placeholder and base URL from settings", () => {
      process.env["OPENAI_API_KEY"] = "sk-or-v1-test";
      process.env["OPENAI_BASE_URL"] = "https://openrouter.ai/api/v1";

      applyConfiguredAuthToEnv({
        selectedType: AuthType.USE_OPENAI,
        providerId: "lmstudio",
        providers: {
          lmstudio: {
            baseUrl: "http://localhost:1234/v1",
          },
        },
      });

      expect(process.env["OPENAI_API_KEY"]).toBe("lmstudio-local-key");
      expect(process.env["OPENAI_BASE_URL"]).toBe("http://localhost:1234/v1");
    });

    it("normalizes openrouter to USE_OPENAI", () => {
      expect(normalizeAuthType("openrouter")).toBe(AuthType.USE_OPENAI);
    });

    it("requires OPENAI_API_KEY for openrouter", () => {
      expect(validateAuthMethod("openrouter")).toBe(
        "OPENAI_API_KEY environment variable not found. You can enter it interactively or add it to your .env file.",
      );
      process.env["OPENAI_API_KEY"] = "sk-test";
      expect(validateAuthMethod("openrouter")).toBeNull();
    });

    it("accepts saved OpenRouter provider settings without OPENAI_API_KEY", () => {
      expect(
        validateAuthMethod(AuthType.USE_OPENAI, {
          selectedType: AuthType.USE_OPENAI,
          providerId: "openrouter",
          providers: {
            openrouter: {
              apiKey: "sk-or-v1-test",
              baseUrl: "https://openrouter.ai/api/v1",
            },
          },
        }),
      ).toBeNull();
    });

    it("rejects local placeholder keys for openrouter", () => {
      process.env["OPENAI_API_KEY"] = "llamacpp-local-key";
      expect(validateAuthMethod("openrouter")).toBe(
        "OPENAI_API_KEY environment variable not found. You can enter it interactively or add it to your .env file.",
      );

      process.env["OPENAI_API_KEY"] = "lmstudio-local-key";
      expect(validateAuthMethod("openrouter")).toBe(
        "OPENAI_API_KEY environment variable not found. You can enter it interactively or add it to your .env file.",
      );
    });

    it("accepts lmstudio when OPENAI_API_KEY is set", () => {
      process.env["OPENAI_API_KEY"] = "lmstudio-local-key";
      expect(validateAuthMethod("lmstudio")).toBeNull();
    });

    it("accepts inferred LM Studio environment for USE_OPENAI", () => {
      process.env["OPENAI_API_KEY"] = "lmstudio-local-key";
      process.env["OPENAI_BASE_URL"] = "http://127.0.0.1:1234/v1";
      expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
    });

    it("accepts saved LM Studio provider settings without OPENAI_API_KEY", () => {
      expect(
        validateAuthMethod(AuthType.USE_OPENAI, {
          selectedType: AuthType.USE_OPENAI,
          providerId: "lmstudio",
          providers: {
            lmstudio: {
              baseUrl: "http://127.0.0.1:1234/v1",
            },
          },
        }),
      ).toBeNull();
    });
  });

  describe("llama.cpp provider", () => {
    it("accepts saved modelsDir without LLAMA_CPP_MODELS_DIR", () => {
      expect(
        validateAuthMethod(AuthType.USE_LLAMACPP, {
          selectedType: AuthType.USE_LLAMACPP,
          providerId: "llamacpp",
          providers: {
            llamacpp: {
              modelsDir: "/models",
            },
          },
        }),
      ).toBeNull();
    });
  });
});
