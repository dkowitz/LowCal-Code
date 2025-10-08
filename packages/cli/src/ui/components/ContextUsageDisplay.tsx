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
  /** Optional version to force re-render when model-level limits change */
  modelLimitVersion?: number;
}) => {
  // Prefer provided modelLimit (from Config.getEffectiveContextLimit) when available
  const limit = typeof modelLimit === 'number' && Number.isFinite(modelLimit) && modelLimit > 0
    ? modelLimit
    : tokenLimit(model);

  // Tokens remaining in the context window
  const remaining = Math.max(0, limit - promptTokenCount);
  const percentage = remaining / limit;

  return (
    <Text color={Colors.Gray}>
      ({remaining.toLocaleString()}/{limit.toLocaleString()} tokens available) ({(percentage * 100).toFixed(0)}% context left)
    </Text>
  );
};

