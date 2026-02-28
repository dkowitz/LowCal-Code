/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export const DEFAULT_MAX_TOOL_OUTPUT_CHARS = 12_000;
export const DEFAULT_TOOL_OUTPUT_PREVIEW_CHARS = 4_000;
const TRUNCATION_HEADER = "TOOL OUTPUT TRUNCATED";
const DEFAULT_RECENT_MEDIA_ENTRIES = 1;
function formatTruncationNotice(toolName, originalLength, preview, previewLength, callId) {
    const metadataLines = [
        `• Tool: ${toolName}`,
        callId ? `• Call ID: ${callId}` : undefined,
        `• Original length: ${originalLength.toLocaleString()} characters`,
        `• Retained preview: ${previewLength.toLocaleString()} characters`,
        "• Action: Re-run the tool with narrower scope (pagination, filters, or targeted parameters) to inspect additional output.",
    ].filter(Boolean);
    const suffix = previewLength < originalLength
        ? "\n... [truncated to preserve context]"
        : "";
    return [
        TRUNCATION_HEADER,
        ...metadataLines,
        "",
        "--- OUTPUT PREVIEW ---",
        preview + suffix,
        "--- END PREVIEW ---",
    ].join("\n");
}
export function compactToolOutputText(toolName, text, options = {}) {
    if (!text) {
        return { value: text, wasCompacted: false };
    }
    const maxChars = options.maxChars ?? DEFAULT_MAX_TOOL_OUTPUT_CHARS;
    if (text.length <= maxChars) {
        return { value: text, wasCompacted: false };
    }
    if (text.startsWith(TRUNCATION_HEADER)) {
        return { value: text, wasCompacted: false };
    }
    const requestedPreview = options.previewChars ?? DEFAULT_TOOL_OUTPUT_PREVIEW_CHARS;
    const previewChars = Math.min(Math.max(requestedPreview, 500), maxChars);
    const preview = text.slice(0, previewChars);
    const truncated = formatTruncationNotice(toolName, text.length, preview, previewChars, options.callId);
    return { value: truncated, wasCompacted: true };
}
export function compactPartListUnion(toolName, content, options = {}) {
    if (typeof content === "string") {
        return compactToolOutputText(toolName, content, options);
    }
    if (Array.isArray(content)) {
        let arrayCompacted = false;
        const transformed = content.map((entry) => {
            const result = compactPartListUnion(toolName, entry, options);
            if (result.wasCompacted || result.value !== entry) {
                arrayCompacted = true;
            }
            return result.value;
        });
        return { value: transformed, wasCompacted: arrayCompacted };
    }
    if (typeof content === "object" && content !== null) {
        const part = content;
        let mutatedPart;
        let wasCompacted = false;
        if (typeof part.text === "string") {
            const result = compactToolOutputText(toolName, part.text, options);
            if (result.wasCompacted) {
                mutatedPart = { ...part, text: result.value };
                wasCompacted = true;
            }
        }
        if (part.functionResponse?.response) {
            const response = part.functionResponse.response;
            const callId = part.functionResponse.id ?? options.callId;
            const responseToolName = part.functionResponse.name ?? toolName;
            let mutatedResponse;
            const output = response["output"];
            if (typeof output === "string") {
                const result = compactToolOutputText(responseToolName, output, {
                    ...options,
                    callId,
                });
                if (result.wasCompacted) {
                    mutatedResponse = { ...response, output: result.value };
                    wasCompacted = true;
                }
            }
            const responseContent = response["content"];
            if (Array.isArray(responseContent)) {
                let contentCompacted = false;
                const nextContent = responseContent.map((item) => {
                    const result = compactPartListUnion(responseToolName, item, {
                        ...options,
                        callId,
                    });
                    if (result.wasCompacted || result.value !== item) {
                        contentCompacted = true;
                    }
                    return result.value;
                });
                if (contentCompacted) {
                    mutatedResponse = {
                        ...(mutatedResponse ?? response),
                        content: nextContent,
                    };
                    wasCompacted = true;
                }
            }
            if (mutatedResponse) {
                const basePart = mutatedPart ?? part;
                mutatedPart = {
                    ...basePart,
                    functionResponse: {
                        ...basePart.functionResponse,
                        response: mutatedResponse,
                    },
                };
            }
        }
        if (mutatedPart) {
            return { value: mutatedPart, wasCompacted: true };
        }
        return { value: content, wasCompacted };
    }
    return { value: content, wasCompacted: false };
}
function normalizeToPart(value) {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return { text: "" };
        }
        console.warn("[ToolOutputCompactor] Collapsing unexpected array part into first element.");
        return normalizeToPart(value[0]);
    }
    if (typeof value === "string") {
        return { text: value };
    }
    return value;
}
function hasBinaryPayload(part) {
    return !!part.inlineData || !!part.fileData;
}
function getBinaryMimeType(part) {
    return part.inlineData?.mimeType || part.fileData?.mimeType || "unknown";
}
function createBinaryPayloadPlaceholder(part) {
    const mimeType = getBinaryMimeType(part);
    return {
        text: `[Binary payload omitted from earlier history (${mimeType}) to preserve context. Re-run the tool if this media is needed again.]`,
    };
}
export function compactHistoryMediaPayloads(history, options = {}) {
    const retainRecentMediaEntries = Math.max(0, options.retainRecentMediaEntries ?? DEFAULT_RECENT_MEDIA_ENTRIES);
    const mediaEntryIndices = history
        .map((entry, index) => entry.parts?.some((part) => hasBinaryPayload(part)) ? index : -1)
        .filter((index) => index >= 0);
    if (mediaEntryIndices.length <= retainRecentMediaEntries) {
        return { history, compactionCount: 0 };
    }
    const preservedMediaIndices = new Set(retainRecentMediaEntries === 0
        ? []
        : mediaEntryIndices.slice(-retainRecentMediaEntries));
    let compactionCount = 0;
    const nextHistory = history.map((entry, entryIndex) => {
        if (!entry.parts?.length || preservedMediaIndices.has(entryIndex)) {
            return entry;
        }
        let entryMutated = false;
        const nextParts = entry.parts.map((part) => {
            if (!hasBinaryPayload(part)) {
                return part;
            }
            entryMutated = true;
            compactionCount += 1;
            return createBinaryPayloadPlaceholder(part);
        });
        return entryMutated ? { ...entry, parts: nextParts } : entry;
    });
    return { history: nextHistory, compactionCount };
}
export function compactHistoryFunctionResponses(history, options = {}) {
    let compactionCount = 0;
    const nextHistory = history.map((entry) => {
        if (!entry.parts?.length) {
            return entry;
        }
        let entryMutated = false;
        const nextParts = entry.parts.map((part) => {
            const toolName = typeof part === "object" &&
                part !== null &&
                "functionResponse" in part &&
                part.functionResponse?.name
                ? part.functionResponse.name
                : "unknown_tool";
            const callId = typeof part === "object" &&
                part !== null &&
                "functionResponse" in part &&
                part.functionResponse?.id
                ? part.functionResponse.id
                : undefined;
            const result = compactPartListUnion(toolName, part, {
                ...options,
                callId,
            });
            const normalizedPart = normalizeToPart(result.value);
            if (result.wasCompacted) {
                compactionCount += 1;
                entryMutated = true;
            }
            else if (normalizedPart !== part) {
                entryMutated = true;
            }
            return normalizedPart;
        });
        return entryMutated ? { ...entry, parts: nextParts } : entry;
    });
    return { history: nextHistory, compactionCount };
}
//# sourceMappingURL=toolOutputCompactor.js.map