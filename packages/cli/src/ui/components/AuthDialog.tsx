/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useState } from "react";
import { AuthType } from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import {
  setGeminiApiKey,
  setOpenAIApiKey,
  setOpenAIBaseUrl,
  setOpenAIModel,
  validateAuthMethod,
} from "../../config/auth.js";
import { appEvents, AppEvent } from "../../utils/events.js";
import { type LoadedSettings, SettingScope } from "../../config/settings.js";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { OpenAIKeyPrompt } from "./OpenAIKeyPrompt.js";
import { ProviderKeyPrompt } from "./ProviderKeyPrompt.js";
import { RadioButtonSelect } from "./shared/RadioButtonSelect.js";
import { GeminiKeyPrompt } from "./GeminiKeyPrompt.js";

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const LM_STUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const LM_STUDIO_DUMMY_KEY = "lmstudio-local-key";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

type ProviderId = "openrouter" | "lmstudio" | "openai" | "gemini";

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

function parseDefaultAuthType(
  defaultAuthType: string | undefined,
): AuthType | null {
  if (
    defaultAuthType &&
    Object.values(AuthType).includes(defaultAuthType as AuthType)
  ) {
    return defaultAuthType as AuthType;
  }
  return null;
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [showOpenAIKeyPrompt, setShowOpenAIKeyPrompt] = useState(false);
  const [showGeminiKeyPrompt, setShowGeminiKeyPrompt] = useState(false);
  const [showProviderPrompt, setShowProviderPrompt] = useState<{
    provider: "openrouter" | "lmstudio";
    baseUrl: string;
    apiKey: string;
    hideApiKeyInput?: boolean;
  } | null>(null);
  const storedProviderId = settings.merged.security?.auth?.providerId as
    | ProviderId
    | undefined;
  const providerSettings =
    (settings.merged.security?.auth?.providers as
      | Record<string, { baseUrl?: string; apiKey?: string }>
      | undefined) || {};
  const openaiProviderSettings =
    (providerSettings["openai"] as
      | { baseUrl?: string; apiKey?: string }
      | undefined) || {};

  const persistSelectedAuthType = (authType: AuthType) => {
    try {
      settings.setValue(
        SettingScope.User,
        "security.auth.selectedType",
        authType,
      );
    } catch (e) {
      // ignore persistence failures; continue flow
    }
  };

  const persistProviderId = (providerId: ProviderId | undefined) => {
    try {
      settings.setValue(
        SettingScope.User,
        "security.auth.providerId",
        providerId,
      );
    } catch (e) {
      // ignore persistence failures; continue flow
    }
  };

  const persistProviderSetting = (
    provider: ProviderId,
    key: "baseUrl" | "apiKey",
    value: string | undefined,
  ) => {
    if (typeof value === "undefined") {
      return;
    }
    try {
      settings.setValue(
        SettingScope.User,
        `security.auth.providers.${provider}.${key}`,
        value,
      );
    } catch (e) {
      // ignore persistence failures; continue flow
    }
  };

  const snapshotOpenRouterCredentials = () => {
    const currentBaseUrl = process.env["OPENAI_BASE_URL"];
    const currentApiKey = process.env["OPENAI_API_KEY"];
    if (
      currentBaseUrl &&
      (storedProviderId === "openrouter" ||
        currentBaseUrl.includes("openrouter"))
    ) {
      persistProviderSetting("openrouter", "baseUrl", currentBaseUrl);
    }
    if (currentApiKey && currentApiKey !== LM_STUDIO_DUMMY_KEY) {
      persistProviderSetting("openrouter", "apiKey", currentApiKey);
    }
  };
  const items = [
    { label: "OpenRouter (OpenAI-compatible)", value: "openrouter" },
    { label: "LM Studio (local)", value: "lmstudio" },
    { label: "OpenAI (direct)", value: AuthType.USE_OPENAI },
    { label: "Google Gemini (API key)", value: AuthType.USE_GEMINI },
  ];
  // Try to detect OpenAI-compatible provider from environment first so the
  // auth dialog can default to the provider the user last configured.
  const openaiBaseUrl = process.env["OPENAI_BASE_URL"] || "";
  let detectedProvider: "openrouter" | "lmstudio" | undefined;
  if (openaiBaseUrl.includes("openrouter")) {
    detectedProvider = "openrouter";
  } else if (
    openaiBaseUrl.includes("127.0.0.1") ||
    openaiBaseUrl.includes("localhost") ||
    openaiBaseUrl.includes("lmstudio")
  ) {
    detectedProvider = "lmstudio";
  }

  const storedAuthType = settings.merged.security?.auth?.selectedType;
  let preferredValue: string | AuthType | null = null;

  if (storedAuthType) {
    if (storedAuthType === AuthType.USE_OPENAI) {
      if (storedProviderId) {
        preferredValue =
          storedProviderId === "openai"
            ? AuthType.USE_OPENAI
            : storedProviderId;
      } else if (detectedProvider) {
        preferredValue = detectedProvider;
      } else {
        preferredValue = AuthType.USE_OPENAI;
      }
    } else {
      preferredValue = storedAuthType;
    }
  }

  if (!preferredValue && storedProviderId) {
    preferredValue =
      storedProviderId === "openai" ? AuthType.USE_OPENAI : storedProviderId;
  }

  if (!preferredValue && detectedProvider) {
    preferredValue = detectedProvider;
  }

  if (!preferredValue) {
    const defaultAuthType = parseDefaultAuthType(
      process.env["QWEN_DEFAULT_AUTH_TYPE"],
    );
    if (defaultAuthType) {
      preferredValue = defaultAuthType;
    }
  }

  if (!preferredValue && process.env["GEMINI_API_KEY"]) {
    preferredValue = AuthType.USE_GEMINI;
  }

  if (!preferredValue) {
    preferredValue = AuthType.LOGIN_WITH_GOOGLE;
  }

  const initialAuthIndex = Math.max(
    0,
    items.findIndex((item) => item.value === preferredValue),
  );

  const handleAuthSelect = (value: any) => {
    // Support both AuthType values and provider strings
    if (value === "openrouter") {
      const openrouterConfig =
        (providerSettings["openrouter"] as
          | { baseUrl?: string; apiKey?: string }
          | undefined) || {};
      const baseUrl =
        openrouterConfig.baseUrl ||
        (process.env["OPENAI_BASE_URL"]?.includes("openrouter")
          ? process.env["OPENAI_BASE_URL"]!
          : OPENROUTER_DEFAULT_BASE_URL);
      const apiKey =
        openrouterConfig.apiKey ||
        (storedProviderId === "openrouter"
          ? process.env["OPENAI_API_KEY"] || ""
          : "");
      setShowProviderPrompt({
        provider: "openrouter",
        baseUrl,
        apiKey,
      });
      setErrorMessage(null);
      return;
    }

    if (value === "lmstudio") {
      snapshotOpenRouterCredentials();
      const lmStudioConfig =
        (providerSettings["lmstudio"] as { baseUrl?: string } | undefined) ||
        {};
      const baseUrl =
        lmStudioConfig.baseUrl ||
        (process.env["OPENAI_BASE_URL"]?.includes("127.0.0.1") ||
        process.env["OPENAI_BASE_URL"]?.includes("localhost")
          ? process.env["OPENAI_BASE_URL"]!
          : LM_STUDIO_DEFAULT_BASE_URL);
      setShowProviderPrompt({
        provider: "lmstudio",
        baseUrl,
        apiKey: LM_STUDIO_DUMMY_KEY,
        hideApiKeyInput: true,
      });
      setErrorMessage(null);
      return;
    }

    if (value === AuthType.USE_OPENAI) {
      setShowOpenAIKeyPrompt(true);
      setErrorMessage(null);
      return;
    }

    if (value === AuthType.USE_GEMINI) {
      setShowGeminiKeyPrompt(true);
      setErrorMessage(null);
      return;
    }

    const authMethod = value as AuthType;
    const error = validateAuthMethod(authMethod);
    if (error) {
      setErrorMessage(error);
    } else {
      setErrorMessage(null);
      persistSelectedAuthType(authMethod);
      if (authMethod === AuthType.USE_OPENAI) {
        persistProviderId("openai");
        if (process.env["OPENAI_BASE_URL"]) {
          persistProviderSetting(
            "openai",
            "baseUrl",
            process.env["OPENAI_BASE_URL"],
          );
        }
        if (process.env["OPENAI_API_KEY"]) {
          persistProviderSetting(
            "openai",
            "apiKey",
            process.env["OPENAI_API_KEY"],
          );
        }
      } else {
        persistProviderId(undefined);
      }
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleOpenAIKeySubmit = (apiKey: string, baseUrl: string) => {
    const apiKeyPath = setOpenAIApiKey(apiKey);
    const normalizedBaseUrl = baseUrl.trim() || OPENAI_DEFAULT_BASE_URL;
    const baseUrlPath = setOpenAIBaseUrl(normalizedBaseUrl);
    const modelPath = setOpenAIModel("");
    persistSelectedAuthType(AuthType.USE_OPENAI);
    persistProviderId("openai");
    persistProviderSetting("openai", "apiKey", apiKey);
    persistProviderSetting("openai", "baseUrl", normalizedBaseUrl);
    try {
      appEvents.emit(
        AppEvent.ShowInfo,
        `Saved OpenAI credentials to: ${apiKeyPath}`,
      );
      // Also show base url and model file locations (often same file)
      if (baseUrlPath !== apiKeyPath) {
        appEvents.emit(
          AppEvent.ShowInfo,
          `Saved OPENAI_BASE_URL to: ${baseUrlPath}`,
        );
      }
      if (modelPath !== apiKeyPath && modelPath !== baseUrlPath) {
        appEvents.emit(
          AppEvent.ShowInfo,
          `Cleared OPENAI_MODEL in: ${modelPath}`,
        );
      }
    } catch (e) {
      // ignore emission errors
    }
    setShowOpenAIKeyPrompt(false);
    onSelect(AuthType.USE_OPENAI, SettingScope.User);
  };

  const handleGeminiKeySubmit = (apiKey: string) => {
    const apiKeyPath = setGeminiApiKey(apiKey);
    persistSelectedAuthType(AuthType.USE_GEMINI);
    persistProviderId(undefined);
    persistProviderSetting("gemini", "apiKey", apiKey);
    try {
      appEvents.emit(
        AppEvent.ShowInfo,
        `Saved GEMINI_API_KEY to: ${apiKeyPath}`,
      );
    } catch (e) {
      // ignore emissions
    }
    setShowGeminiKeyPrompt(false);
    onSelect(AuthType.USE_GEMINI, SettingScope.User);
  };

  const handleProviderSubmit = (apiKey: string, baseUrl: string) => {
    if (!showProviderPrompt) {
      setShowProviderPrompt(null);
      return;
    }

    const provider = showProviderPrompt.provider;
    const trimmedBaseUrl = baseUrl.trim();

    if (provider === "openrouter") {
      const normalizedBaseUrl =
        trimmedBaseUrl ||
        showProviderPrompt.baseUrl ||
        OPENROUTER_DEFAULT_BASE_URL;
      const safeApiKey = apiKey.trim();
      const apiKeyPath = setOpenAIApiKey(safeApiKey);
      const baseUrlPath = setOpenAIBaseUrl(normalizedBaseUrl);
      persistSelectedAuthType(AuthType.USE_OPENAI);
      persistProviderId("openrouter");
      persistProviderSetting("openrouter", "apiKey", safeApiKey);
      persistProviderSetting("openrouter", "baseUrl", normalizedBaseUrl);
      try {
        appEvents.emit(
          AppEvent.ShowInfo,
          `Saved provider credentials to: ${apiKeyPath}`,
        );
        if (baseUrlPath !== apiKeyPath) {
          appEvents.emit(
            AppEvent.ShowInfo,
            `Saved OPENAI_BASE_URL to: ${baseUrlPath}`,
          );
        }
      } catch (e) {
        // ignore emissions
      }
      onSelect(AuthType.USE_OPENAI, SettingScope.User);
    } else {
      // LM Studio branch
      const normalizedBaseUrl =
        trimmedBaseUrl ||
        showProviderPrompt.baseUrl ||
        LM_STUDIO_DEFAULT_BASE_URL;
      const dummyKey = LM_STUDIO_DUMMY_KEY;
      const apiKeyPath = setOpenAIApiKey(dummyKey);
      const baseUrlPath = setOpenAIBaseUrl(normalizedBaseUrl);
      persistSelectedAuthType(AuthType.USE_OPENAI);
      persistProviderId("lmstudio");
      persistProviderSetting("lmstudio", "baseUrl", normalizedBaseUrl);
      try {
        appEvents.emit(
          AppEvent.ShowInfo,
          `Configured LM Studio credentials in: ${apiKeyPath}`,
        );
        if (baseUrlPath !== apiKeyPath) {
          appEvents.emit(
            AppEvent.ShowInfo,
            `Saved OPENAI_BASE_URL to: ${baseUrlPath}`,
          );
        }
      } catch (e) {
        // ignore emissions
      }
      onSelect(AuthType.USE_OPENAI, SettingScope.User);
    }

    setShowProviderPrompt(null);
  };

  const handleProviderCancel = () => {
    setShowProviderPrompt(null);
    setErrorMessage("Provider configuration canceled.");
  };

  const handleOpenAIKeyCancel = () => {
    setShowOpenAIKeyPrompt(false);
    setErrorMessage("OpenAI API key is required to use OpenAI authentication.");
  };

  const handleGeminiKeyCancel = () => {
    setShowGeminiKeyPrompt(false);
    setErrorMessage(
      "GEMINI_API_KEY is required to use Google Gemini authentication.",
    );
  };

  useKeypress(
    (key) => {
      if (showOpenAIKeyPrompt) {
        return;
      }

      if (key.name === "escape") {
        // Prevent exit if there is an error message.
        // This means they user is not authenticated yet.
        if (errorMessage) {
          return;
        }
        if (settings.merged.security?.auth?.selectedType === undefined) {
          // Prevent exiting if no auth method is set
          setErrorMessage(
            "You must select an auth method to proceed. Press Ctrl+C again to exit.",
          );
          return;
        }
        onSelect(undefined, SettingScope.User);
      }
    },
    { isActive: true },
  );

  if (showOpenAIKeyPrompt) {
    const storedBaseUrl = openaiProviderSettings.baseUrl || "";
    const isStoredOpenAI =
      storedBaseUrl === OPENAI_DEFAULT_BASE_URL ||
      storedBaseUrl.startsWith("https://api.openai.com");
    const defaultBaseUrl = isStoredOpenAI
      ? storedBaseUrl
      : OPENAI_DEFAULT_BASE_URL;
    const defaultApiKey = isStoredOpenAI
      ? openaiProviderSettings.apiKey || ""
      : "";
    return (
      <OpenAIKeyPrompt
        onSubmit={handleOpenAIKeySubmit}
        onCancel={handleOpenAIKeyCancel}
        prepopulatedApiKey={defaultApiKey}
        prepopulatedBaseUrl={defaultBaseUrl}
      />
    );
  }

  if (showGeminiKeyPrompt) {
    const geminiProviderSettings =
      (providerSettings["gemini"] as { apiKey?: string } | undefined) || {};
    return (
      <GeminiKeyPrompt
        onSubmit={handleGeminiKeySubmit}
        onCancel={handleGeminiKeyCancel}
        prepopulatedApiKey={geminiProviderSettings.apiKey || ""}
      />
    );
  }

  if (showProviderPrompt) {
    const provider = showProviderPrompt.provider;
    const baseUrl =
      showProviderPrompt.baseUrl ||
      (provider === "openrouter"
        ? OPENROUTER_DEFAULT_BASE_URL
        : LM_STUDIO_DEFAULT_BASE_URL);
    const apiKey =
      provider === "openrouter"
        ? showProviderPrompt.apiKey
        : showProviderPrompt.apiKey || LM_STUDIO_DUMMY_KEY;
    return (
      <ProviderKeyPrompt
        prepopulatedBaseUrl={baseUrl}
        prepopulatedApiKey={apiKey}
        hideApiKeyInput={showProviderPrompt.hideApiKeyInput}
        onSubmit={handleProviderSubmit}
        onCancel={handleProviderCancel}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Get started</Text>
      <Box marginTop={1}>
        <Text>How would you like to authenticate for this project?</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialAuthIndex}
          onSelect={handleAuthSelect}
        />
      </Box>
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.AccentPurple}>(Use Enter to Set Auth)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Qwen Code</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {"https://github.com/QwenLM/Qwen3-Coder/blob/main/README.md"}
        </Text>
      </Box>
    </Box>
  );
}
