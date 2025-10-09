/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import type { GenerateContentParameters } from "@google/genai";
import type { RequestContext } from "./telemetryService.js";
export interface ErrorHandler {
    handle(error: unknown, context: RequestContext, request: GenerateContentParameters): never;
    shouldSuppressErrorLogging(error: unknown, request: GenerateContentParameters): boolean;
}
export declare class EnhancedErrorHandler implements ErrorHandler {
    private shouldSuppressLogging;
    constructor(shouldSuppressLogging?: (error: unknown, request: GenerateContentParameters) => boolean);
    handle(error: unknown, context: RequestContext, request: GenerateContentParameters): never;
    shouldSuppressErrorLogging(error: unknown, request: GenerateContentParameters): boolean;
    private isTimeoutError;
    private buildErrorMessage;
    private getTimeoutTroubleshootingTips;
}
