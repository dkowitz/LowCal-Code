/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@qwen-code/qwen-code-core';
import type {
  SlashCommand,
  CommandContext,
  OpenDialogActionReturn,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import {
  AVAILABLE_MODELS_QWEN,
  fetchOpenAICompatibleModels,
  getOpenAIAvailableModelFromEnv,
  type AvailableModel,
} from '../models/availableModels.js';

async function getAvailableModelsForAuthType(
  authType: AuthType,
): Promise<AvailableModel[]> {
  switch (authType) {
    case AuthType.QWEN_OAUTH:
      return AVAILABLE_MODELS_QWEN;
    case AuthType.USE_OPENAI: {
      // If a model is explicitly set via OPENAI_MODEL, return that.
      const openAIModel = getOpenAIAvailableModelFromEnv();
      if (openAIModel) return [openAIModel];

      // If an OpenAI-compatible base URL is provided, assume models are available
      const baseUrl = process.env['OPENAI_BASE_URL']?.trim();
      if (baseUrl) {
        const apiKey = process.env['OPENAI_API_KEY']?.trim();
        return await fetchOpenAICompatibleModels(baseUrl, apiKey);
      }

      return [];
    }
    default:
      // For other auth types, return empty array for now
      // This can be expanded later according to the design doc
      return [];
  }
}

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Switch the model for this session',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<OpenDialogActionReturn | MessageActionReturn> => {
    const { services } = context;
    const { config } = services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const contentGeneratorConfig = config.getContentGeneratorConfig();
    if (!contentGeneratorConfig) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Content generator configuration not available.',
      };
    }

    const authType = contentGeneratorConfig.authType;
    if (!authType) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Authentication type not available.',
      };
    }

    const availableModels = await getAvailableModelsForAuthType(authType);

    if (availableModels.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: `No models available for the current authentication type (${authType}).`,
      };
    }

    // Trigger model selection dialog
    return {
      type: 'dialog',
      dialog: 'model',
    };
  },
};
