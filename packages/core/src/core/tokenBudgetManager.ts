/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { tokenLimit } from './tokenLimits.js';

const DEFAULT_WARN_FRACTION = 0.85;
const DEFAULT_BUFFER_FRACTION = 0.05;
const MIN_BUFFER_TOKENS = 512;
const MAX_BUFFER_TOKENS = 4096;

export interface TokenBudgetSnapshot {
  readonly tokens: number;
  readonly limit: number;
  readonly effectiveLimit: number;
  readonly warnThreshold: number;
  readonly fitsWithinEffective: boolean;
  readonly withinHardLimit: boolean;
}

export class TokenBudgetExceededError extends Error {
  constructor(message: string, public readonly snapshot: TokenBudgetSnapshot) {
    super(message);
    this.name = 'TokenBudgetExceededError';
  }
}

export class TokenBudgetManager {
  constructor(private readonly contentGenerator: ContentGenerator) {}

  /**
   * Evaluate the total token requirement for a prospective request and compute
   * how it relates to the model's context window.
   */
  async evaluate(model: string, contents: Content[]): Promise<TokenBudgetSnapshot> {
    const limit = tokenLimit(model, 'input');
    const buffer = this.getSafetyBuffer(limit);
    const effectiveLimit = Math.max(
      0,
      Math.min(limit - buffer, Math.floor(limit * 0.95)),
    );
    const warnThreshold = Math.max(limit * DEFAULT_WARN_FRACTION, effectiveLimit);

    const { totalTokens = 0 } = await this.contentGenerator.countTokens({
      model,
      contents,
    });

    return {
      tokens: totalTokens,
      limit,
      effectiveLimit,
      warnThreshold,
      fitsWithinEffective: totalTokens <= effectiveLimit,
      withinHardLimit: totalTokens <= limit,
    } satisfies TokenBudgetSnapshot;
  }

  private getSafetyBuffer(limit: number): number {
    if (limit <= 0 || Number.isNaN(limit)) return 0;

    const fractionalBuffer = Math.floor(limit * DEFAULT_BUFFER_FRACTION);
    return Math.max(
      MIN_BUFFER_TOKENS,
      Math.min(fractionalBuffer, MAX_BUFFER_TOKENS),
    );
  }
}
