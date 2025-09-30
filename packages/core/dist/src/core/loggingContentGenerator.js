/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ApiRequestEvent, ApiResponseEvent, ApiErrorEvent, } from "../telemetry/types.js";
import { logApiError, logApiRequest, logApiResponse, } from "../telemetry/loggers.js";
import { toContents } from "../code_assist/converter.js";
import { isStructuredError } from "../utils/quotaErrorDetection.js";
/**
 * A decorator that wraps a ContentGenerator to add logging to API calls.
 */
export class LoggingContentGenerator {
    wrapped;
    config;
    constructor(wrapped, config) {
        this.wrapped = wrapped;
        this.config = config;
    }
    getWrapped() {
        return this.wrapped;
    }
    logApiRequest(contents, model, promptId) {
        const requestText = JSON.stringify(contents);
        logApiRequest(this.config, new ApiRequestEvent(model, promptId, requestText));
    }
    _logApiResponse(responseId, durationMs, prompt_id, usageMetadata, responseText) {
        logApiResponse(this.config, new ApiResponseEvent(responseId, this.config.getModel(), durationMs, prompt_id, this.config.getContentGeneratorConfig()?.authType, usageMetadata, responseText));
    }
    _logApiError(responseId, durationMs, error, prompt_id) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorType = error instanceof Error ? error.name : "unknown";
        logApiError(this.config, new ApiErrorEvent(responseId, this.config.getModel(), errorMessage, durationMs, prompt_id, this.config.getContentGeneratorConfig()?.authType, errorType, isStructuredError(error)
            ? error.status
            : undefined));
    }
    async generateContent(req, userPromptId) {
        const startTime = Date.now();
        this.logApiRequest(toContents(req.contents), req.model, userPromptId);
        try {
            const response = await this.wrapped.generateContent(req, userPromptId);
            const durationMs = Date.now() - startTime;
            this._logApiResponse(response.responseId ?? "", durationMs, userPromptId, response.usageMetadata, JSON.stringify(response));
            return response;
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            this._logApiError(undefined, durationMs, error, userPromptId);
            throw error;
        }
    }
    async generateContentStream(req, userPromptId) {
        const startTime = Date.now();
        this.logApiRequest(toContents(req.contents), req.model, userPromptId);
        let stream;
        try {
            stream = await this.wrapped.generateContentStream(req, userPromptId);
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            this._logApiError(undefined, durationMs, error, userPromptId);
            throw error;
        }
        return this.loggingStreamWrapper(stream, startTime, userPromptId);
    }
    async *loggingStreamWrapper(stream, startTime, userPromptId) {
        let lastResponse;
        const responses = [];
        let lastUsageMetadata;
        try {
            for await (const response of stream) {
                responses.push(response);
                lastResponse = response;
                if (response.usageMetadata) {
                    lastUsageMetadata = response.usageMetadata;
                }
                yield response;
            }
        }
        catch (error) {
            const durationMs = Date.now() - startTime;
            this._logApiError(undefined, durationMs, error, userPromptId);
            throw error;
        }
        const durationMs = Date.now() - startTime;
        if (lastResponse) {
            this._logApiResponse(lastResponse.responseId ?? "", durationMs, userPromptId, lastUsageMetadata, JSON.stringify(responses));
        }
    }
    async countTokens(req) {
        return this.wrapped.countTokens(req);
    }
    async embedContent(req) {
        return this.wrapped.embedContent(req);
    }
}
//# sourceMappingURL=loggingContentGenerator.js.map