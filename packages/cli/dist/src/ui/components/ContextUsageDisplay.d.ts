/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export declare const ContextUsageDisplay: ({ promptTokenCount, model, modelLimit, }: {
    promptTokenCount: number;
    model: string;
    /** Optional precomputed model limit (preferred) */
    modelLimit?: number;
    /** Optional version to force re-render when model-level limits change */
    modelLimitVersion?: number;
}) => import("react/jsx-runtime").JSX.Element;
