/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface ProviderKeyPromptProps {
  prepopulatedBaseUrl: string;
  prepopulatedApiKey: string;
  onSubmit: (apiKey: string, baseUrl: string) => void;
  onCancel: () => void;
  hideApiKeyInput?: boolean;
}

export function ProviderKeyPrompt({
  prepopulatedBaseUrl,
  prepopulatedApiKey,
  onSubmit,
  onCancel,
  hideApiKeyInput = false,
}: ProviderKeyPromptProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState(prepopulatedApiKey || '');
  const [baseUrl, setBaseUrl] = useState(prepopulatedBaseUrl || '');
  const allowApiKeyInput = !hideApiKeyInput;
  const [currentField, setCurrentField] = useState<'apiKey' | 'baseUrl'>(
    allowApiKeyInput && !prepopulatedApiKey ? 'apiKey' : 'baseUrl',
  );

  useInput((input, key) => {
    let cleanInput = (input || '')
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\[200~/g, '')
      .replace(/\[201~/g, '')
      .replace(/^\[|~$/g, '');

    cleanInput = cleanInput
      .split('')
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join('');

    if (cleanInput.length > 0) {
      if (currentField === 'apiKey') {
        if (allowApiKeyInput) setApiKey((p) => p + cleanInput);
      } else setBaseUrl((p) => p + cleanInput);
      return;
    }

    if (input.includes('\n') || input.includes('\r')) {
      if (currentField === 'apiKey' && allowApiKeyInput) setCurrentField('baseUrl');
      else onSubmit(
        allowApiKeyInput ? apiKey.trim() : prepopulatedApiKey.trim(),
        baseUrl.trim(),
      );
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.tab && allowApiKeyInput) {
      setCurrentField((c) => (c === 'apiKey' ? 'baseUrl' : 'apiKey'));
      return;
    }

    if ((key.upArrow || key.downArrow) && allowApiKeyInput) {
      setCurrentField((c) => (c === 'apiKey' ? 'baseUrl' : 'apiKey'));
      return;
    }

    if (key.backspace || key.delete) {
      if (currentField === 'apiKey' && allowApiKeyInput)
        setApiKey((p) => p.slice(0, -1));
      else setBaseUrl((p) => p.slice(0, -1));
      return;
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        Provider Configuration
      </Text>
      <Box marginTop={1}>
        <Text>
          Enter the provider base URL and API key (if required). For LM Studio
          the API key is managed automatically with a dummy value.
        </Text>
      </Box>

      {allowApiKeyInput && (
        <Box marginTop={1} flexDirection="row">
          <Box width={12}>
            <Text
              color={
                currentField === 'apiKey' ? Colors.AccentBlue : Colors.Gray
              }
            >
              API Key:
            </Text>
          </Box>
          <Box flexGrow={1}>
            <Text>
              {currentField === 'apiKey' ? '> ' : '  '}
              {apiKey || ' '}
            </Text>
          </Box>
        </Box>
      )}

      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text color={currentField === 'baseUrl' ? Colors.AccentBlue : Colors.Gray}>
            Base URL:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>{currentField === 'baseUrl' ? '> ' : '  '}{baseUrl}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>Press Enter to continue, Tab/↑↓ to navigate, Esc to cancel</Text>
      </Box>
    </Box>
  );
}

export default ProviderKeyPrompt;
