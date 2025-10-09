/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from "@google/genai";
import type { ContentGenerator } from "./contentGenerator.js";
export interface TokenBudgetSnapshot {
    readonly tokens: number;
    readonly limit: number;
    readonly effectiveLimit: number;
    readonly warnThreshold: number;
    readonly fitsWithinEffective: boolean;
    readonly withinHardLimit: boolean;
}
export declare class TokenBudgetExceededError extends Error {
    readonly snapshot: TokenBudgetSnapshot;
    constructor(message: string, snapshot: TokenBudgetSnapshot);
}
export declare class TokenBudgetManager {
    private readonly contentGenerator;
    private readonly getContextLimit?;
    constructor(contentGenerator: ContentGenerator, getContextLimit?: ((model: string) => number | undefined) | undefined);
    /**
     * Evaluate the total token requirement for a prospective request and compute
     * how it relates to the model's context window.
     */
    evaluate(model: string, contents: Content[]): Promise<TokenBudgetSnapshot>;
    private getSafetyBuffer;
}
