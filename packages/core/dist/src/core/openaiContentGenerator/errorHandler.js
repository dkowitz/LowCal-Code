/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
export class EnhancedErrorHandler {
    shouldSuppressLogging;
    constructor(shouldSuppressLogging = () => false) {
        this.shouldSuppressLogging = shouldSuppressLogging;
    }
    handle(error, context, request) {
        const isTimeoutError = this.isTimeoutError(error);
        const errorMessage = this.buildErrorMessage(error, context, isTimeoutError);
        // Allow subclasses to suppress error logging for specific scenarios
        if (!this.shouldSuppressErrorLogging(error, request)) {
            const logPrefix = context.isStreaming
                ? "OpenAI API Streaming Error:"
                : "OpenAI API Error:";
            console.error(logPrefix, errorMessage);
        }
        // Provide helpful timeout-specific error message
        if (isTimeoutError) {
            throw new Error(`${errorMessage}\n\n${this.getTimeoutTroubleshootingTips(context)}`);
        }
        throw error;
    }
    shouldSuppressErrorLogging(error, request) {
        return this.shouldSuppressLogging(error, request);
    }
    isTimeoutError(error) {
        if (!error)
            return false;
        const errorMessage = error instanceof Error
            ? error.message.toLowerCase()
            : String(error).toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorCode = error?.code;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorType = error?.type;
        // Check for common timeout indicators
        return (errorMessage.includes("timeout") ||
            errorMessage.includes("timed out") ||
            errorMessage.includes("connection timeout") ||
            errorMessage.includes("request timeout") ||
            errorMessage.includes("read timeout") ||
            errorMessage.includes("etimedout") ||
            errorMessage.includes("esockettimedout") ||
            errorCode === "ETIMEDOUT" ||
            errorCode === "ESOCKETTIMEDOUT" ||
            errorType === "timeout" ||
            errorMessage.includes("request timed out") ||
            errorMessage.includes("deadline exceeded"));
    }
    buildErrorMessage(error, context, isTimeoutError) {
        const durationSeconds = Math.round(context.duration / 1000);
        if (isTimeoutError) {
            const prefix = context.isStreaming
                ? "Streaming request timeout"
                : "Request timeout";
            return `${prefix} after ${durationSeconds}s. Try reducing input length or increasing timeout in config.`;
        }
        return error instanceof Error ? error.message : String(error);
    }
    getTimeoutTroubleshootingTips(context) {
        const baseTitle = context.isStreaming
            ? "Streaming timeout troubleshooting:"
            : "Troubleshooting tips:";
        const baseTips = [
            "- Reduce input length or complexity",
            "- Increase timeout in config: contentGenerator.timeout",
            "- Check network connectivity",
        ];
        const streamingSpecificTips = context.isStreaming
            ? [
                "- Check network stability for streaming connections",
                "- Consider using non-streaming mode for very long inputs",
            ]
            : ["- Consider using streaming mode for long responses"];
        return `${baseTitle}\n${[...baseTips, ...streamingSpecificTips].join("\n")}`;
    }
}
//# sourceMappingURL=errorHandler.js.map