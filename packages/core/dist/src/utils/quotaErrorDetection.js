/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export function isApiError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'error' in error &&
        typeof error.error === 'object' &&
        'message' in error.error);
}
export function isStructuredError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string');
}
export function isProQuotaExceededError(error) {
    // Check for Pro quota exceeded errors by looking for the specific pattern
    // This will match patterns like:
    // - "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'"
    // - "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'"
    // We use string methods instead of regex to avoid ReDoS vulnerabilities
    const checkMessage = (message) => message.includes("Quota exceeded for quota metric 'Gemini") &&
        message.includes("Pro Requests'");
    if (typeof error === 'string') {
        return checkMessage(error);
    }
    if (isStructuredError(error)) {
        return checkMessage(error.message);
    }
    if (isApiError(error)) {
        return checkMessage(error.error.message);
    }
    // Check if it's a Gaxios error with response data
    if (error && typeof error === 'object' && 'response' in error) {
        const gaxiosError = error;
        if (gaxiosError.response && gaxiosError.response.data) {
            if (typeof gaxiosError.response.data === 'string') {
                return checkMessage(gaxiosError.response.data);
            }
            if (typeof gaxiosError.response.data === 'object' &&
                gaxiosError.response.data !== null &&
                'error' in gaxiosError.response.data) {
                const errorData = gaxiosError.response.data;
                return checkMessage(errorData.error?.message || '');
            }
        }
    }
    return false;
}
export function isGenericQuotaExceededError(error) {
    if (typeof error === 'string') {
        return error.includes('Quota exceeded for quota metric');
    }
    if (isStructuredError(error)) {
        return error.message.includes('Quota exceeded for quota metric');
    }
    if (isApiError(error)) {
        return error.error.message.includes('Quota exceeded for quota metric');
    }
    return false;
}
export function isQwenQuotaExceededError(error) {
    // Check for Qwen insufficient quota errors (should not retry)
    const checkMessage = (message) => {
        const lowerMessage = message.toLowerCase();
        return (lowerMessage.includes('insufficient_quota') ||
            lowerMessage.includes('free allocated quota exceeded') ||
            (lowerMessage.includes('quota') && lowerMessage.includes('exceeded')));
    };
    if (typeof error === 'string') {
        return checkMessage(error);
    }
    if (isStructuredError(error)) {
        return checkMessage(error.message);
    }
    if (isApiError(error)) {
        return checkMessage(error.error.message);
    }
    return false;
}
export function isQwenThrottlingError(error) {
    // Check for Qwen throttling errors (should retry)
    const checkMessage = (message) => {
        const lowerMessage = message.toLowerCase();
        return (lowerMessage.includes('throttling') ||
            lowerMessage.includes('requests throttling triggered') ||
            lowerMessage.includes('rate limit') ||
            lowerMessage.includes('too many requests'));
    };
    // Check status code
    const getStatusCode = (error) => {
        if (error && typeof error === 'object') {
            const errorObj = error;
            return errorObj.status || errorObj.code;
        }
        return undefined;
    };
    const statusCode = getStatusCode(error);
    if (typeof error === 'string') {
        return ((statusCode === 429 && checkMessage(error)) ||
            error.includes('throttling'));
    }
    if (isStructuredError(error)) {
        return statusCode === 429 && checkMessage(error.message);
    }
    if (isApiError(error)) {
        return error.error.code === 429 && checkMessage(error.error.message);
    }
    return false;
}
//# sourceMappingURL=quotaErrorDetection.js.map