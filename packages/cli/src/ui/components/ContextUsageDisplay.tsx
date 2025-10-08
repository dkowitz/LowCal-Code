/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { Colors } from '../colors.js';
import { tokenLimit } from '@qwen-code/qwen-code-core';

export const ContextUsageDisplay = ({
  promptTokenCount,
  model,
  modelLimit,
}: {
  promptTokenCount: number;
  model: string;
  /** Optional precomputed model limit (preferred) */
  modelLimit?: number;
}) => {
  // Prefer provided modelLimit (from Config.getEffectiveContextLimit) when available
  const limit = typeof modelLimit === 'number' && Number.isFinite(modelLimit) && modelLimit > 0
    ? modelLimit
    : tokenLimit(model);

  const percentage = promptTokenCount / limit;

  return (
    <Text color={Colors.Gray}>
      ({promptTokenCount.toLocaleString()}/{limit.toLocaleString()} tokens available) ({((1 - percentage) * 100).toFixed(0)}% context left)
    </Text>
  );
};

