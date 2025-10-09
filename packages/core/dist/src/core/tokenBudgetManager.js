/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { tokenLimit } from "./tokenLimits.js";
const DEFAULT_WARN_FRACTION = 0.85;
const DEFAULT_BUFFER_FRACTION = 0.05;
const MIN_BUFFER_TOKENS = 512;
const MAX_BUFFER_TOKENS = 4096;
export class TokenBudgetExceededError extends Error {
    snapshot;
    constructor(message, snapshot) {
        super(message);
        this.snapshot = snapshot;
        this.name = "TokenBudgetExceededError";
    }
}
export class TokenBudgetManager {
    contentGenerator;
    getContextLimit;
    constructor(contentGenerator, getContextLimit) {
        this.contentGenerator = contentGenerator;
        this.getContextLimit = getContextLimit;
    }
    /**
     * Evaluate the total token requirement for a prospective request and compute
     * how it relates to the model's context window.
     */
    async evaluate(model, contents) {
        // Prefer provider-supplied context limits via getContextLimit (e.g., Config.getEffectiveContextLimit)
        const computedLimit = this.getContextLimit?.(model);
        let limit;
        if (typeof computedLimit === "number" &&
            Number.isFinite(computedLimit) &&
            computedLimit > 0) {
            limit = computedLimit;
        }
        else {
            // Fall back to the tokenLimit helper which may be static
            limit = tokenLimit(model, "input");
        }
        const buffer = this.getSafetyBuffer(limit);
        const effectiveLimit = Math.max(0, Math.min(limit - buffer, Math.floor(limit * 0.95)));
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
        };
    }
    getSafetyBuffer(limit) {
        if (limit <= 0 || Number.isNaN(limit))
            return 0;
        const fractionalBuffer = Math.floor(limit * DEFAULT_BUFFER_FRACTION);
        return Math.max(MIN_BUFFER_TOKENS, Math.min(fractionalBuffer, MAX_BUFFER_TOKENS));
    }
}
//# sourceMappingURL=tokenBudgetManager.js.map