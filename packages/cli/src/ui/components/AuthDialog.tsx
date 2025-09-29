/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { AuthType } from '@qwen-code/qwen-code-core';
import { Box, Text } from 'ink';
import {
  setOpenAIApiKey,
  setOpenAIBaseUrl,
  setOpenAIModel,
  validateAuthMethod,
} from '../../config/auth.js';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';
import { ProviderKeyPrompt } from './ProviderKeyPrompt.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

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
  const [showProviderPrompt, setShowProviderPrompt] = useState<
    | { provider: 'openrouter' | 'lmstudio' }
    | null
  >(null);
  const items = [
    { label: 'Qwen OAuth', value: AuthType.QWEN_OAUTH },
    { label: 'OpenRouter (OpenAI-compatible)', value: 'openrouter' },
    { label: 'LM Studio (local)', value: 'lmstudio' },
    { label: 'OpenAI', value: AuthType.USE_OPENAI },
  ];
  // Try to detect OpenAI-compatible provider from environment first so the
  // auth dialog can default to the provider the user last configured.
  const openaiBaseUrl = process.env['OPENAI_BASE_URL'] || '';
  let detectedProvider: 'openrouter' | 'lmstudio' | undefined;
  if (openaiBaseUrl.includes('openrouter')) {
    detectedProvider = 'openrouter';
  } else if (
    openaiBaseUrl.includes('127.0.0.1') ||
    openaiBaseUrl.includes('localhost') ||
    openaiBaseUrl.includes('lmstudio')
  ) {
    detectedProvider = 'lmstudio';
  }

  const initialAuthIndex = Math.max(
    0,
    items.findIndex((item) => {
      // If the user has an explicit stored auth selection in settings, prefer it.
      const stored = settings.merged.security?.auth?.selectedType;
      if (stored) {
        // If the stored type is the generic OpenAI auth but we can detect a
        // specific OpenAI-compatible provider from OPENAI_BASE_URL, prefer
        // selecting that provider option in the dialog so the UI reflects
        // the concrete provider (OpenRouter / LM Studio) the user previously
        // configured.
        if (stored === AuthType.USE_OPENAI && detectedProvider) {
          return item.value === detectedProvider;
        }
        return item.value === stored;
      }

      // Otherwise, if we detected a provider from OPENAI_BASE_URL, select that.
      if (detectedProvider) {
        return item.value === detectedProvider;
      }

      const defaultAuthType = parseDefaultAuthType(
        process.env['QWEN_DEFAULT_AUTH_TYPE'],
      );
      if (defaultAuthType) {
        return item.value === defaultAuthType;
      }

      if (process.env['GEMINI_API_KEY']) {
        return item.value === AuthType.USE_GEMINI;
      }

      return item.value === AuthType.LOGIN_WITH_GOOGLE;
    }),
  );

  const handleAuthSelect = (value: any) => {
    // Support both AuthType values and provider strings
    if (value === 'openrouter') {
      // Pre-populate OpenRouter base url and ask for API key
      setShowProviderPrompt({ provider: 'openrouter' });
      setErrorMessage(null);
      return;
    }

    if (value === 'lmstudio') {
      // Pre-populate LM Studio base url and a dummy API key
      setShowProviderPrompt({ provider: 'lmstudio' });
      setErrorMessage(null);
      return;
    }

    const authMethod = value as AuthType;
    const error = validateAuthMethod(authMethod);
    if (error) {
      if (
        authMethod === AuthType.USE_OPENAI &&
        !process.env['OPENAI_API_KEY']
      ) {
        setShowOpenAIKeyPrompt(true);
        setErrorMessage(null);
      } else {
        setErrorMessage(error);
      }
    } else {
      setErrorMessage(null);
      // Persist the chosen auth type so it will be restored on next startup.
      try {
        // Persist the chosen auth type in the nested settings path so
        // downstream code reads it from `security.auth.selectedType` on
        // startup.
        settings.setValue(
          SettingScope.User,
          'security.auth.selectedType',
          authMethod,
        );
      } catch (e) {
        // Ignore errors persisting settings; still proceed with selection.
      }
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleOpenAIKeySubmit = (
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => {
    setOpenAIApiKey(apiKey);
    setOpenAIBaseUrl(baseUrl);
    setOpenAIModel(model);
    setShowOpenAIKeyPrompt(false);
    onSelect(AuthType.USE_OPENAI, SettingScope.User);
  };

  const handleProviderSubmit = (apiKey: string, baseUrl: string) => {
    // Use the OpenAI env vars for OpenRouter/LM Studio since they are OpenAI-compatible
    setOpenAIApiKey(apiKey || '');
    setOpenAIBaseUrl(baseUrl);
    // Treat provider as OpenAI-compatible provider
    try {
      // Treat provider as OpenAI-compatible provider; persist the selected
      // auth type to the nested setting path so it is restored on next run.
      settings.setValue(
        SettingScope.User,
        'security.auth.selectedType',
        AuthType.USE_OPENAI,
      );
    } catch (e) {
      // ignore
    }
    onSelect(AuthType.USE_OPENAI, SettingScope.User);
    setShowProviderPrompt(null);
  };

  const handleProviderCancel = () => {
    setShowProviderPrompt(null);
    setErrorMessage('Provider configuration canceled.');
  };

  const handleOpenAIKeyCancel = () => {
    setShowOpenAIKeyPrompt(false);
    setErrorMessage('OpenAI API key is required to use OpenAI authentication.');
  };

  useKeypress(
    (key) => {
      if (showOpenAIKeyPrompt) {
        return;
      }

      if (key.name === 'escape') {
        // Prevent exit if there is an error message.
        // This means they user is not authenticated yet.
        if (errorMessage) {
          return;
        }
        if (settings.merged.security?.auth?.selectedType === undefined) {
          // Prevent exiting if no auth method is set
          setErrorMessage(
            'You must select an auth method to proceed. Press Ctrl+C again to exit.',
          );
          return;
        }
        onSelect(undefined, SettingScope.User);
      }
    },
    { isActive: true },
  );

  if (showOpenAIKeyPrompt) {
    return (
      <OpenAIKeyPrompt
        onSubmit={handleOpenAIKeySubmit}
        onCancel={handleOpenAIKeyCancel}
      />
    );
  }

  if (showProviderPrompt) {
    const provider = showProviderPrompt.provider;
    // Prepopulate provider prompt using any existing OPENAI env vars.
    const prepopulated = provider === 'openrouter'
      ? {
          baseUrl: process.env['OPENAI_BASE_URL'] || 'https://openrouter.ai/api/v1',
          apiKey: process.env['OPENAI_API_KEY'] || '',
        }
      : {
          baseUrl: process.env['OPENAI_BASE_URL'] || 'http://127.0.0.1:1234/v1',
          apiKey: process.env['OPENAI_API_KEY'] || 'lmstudio-dummy-key',
        };
    return (
      <ProviderKeyPrompt
        prepopulatedBaseUrl={prepopulated.baseUrl}
        prepopulatedApiKey={prepopulated.apiKey}
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
          {'https://github.com/QwenLM/Qwen3-Coder/blob/main/README.md'}
        </Text>
      </Box>
    </Box>
  );
}
